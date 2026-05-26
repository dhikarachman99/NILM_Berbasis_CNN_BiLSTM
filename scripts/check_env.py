#!/usr/bin/env python3
"""Cek konfigurasi .env tanpa mencetak secret lengkap."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

MASK = "***"


def mask(value: str | None, show: int = 4) -> str:
    if not value:
        return "(kosong)"
    if len(value) <= show * 2:
        return MASK
    return f"{value[:show]}...{value[-show:]}"


def ok(msg: str) -> None:
    print(f"  OK  {msg}")


def warn(msg: str) -> None:
    print(f"  WARN  {msg}")


def fail(msg: str) -> None:
    print(f"  FAIL  {msg}")


def main() -> int:
    print("=" * 60)
    print("CEK KONFIGURASI .env")
    print("=" * 60)

    errors = 0

    # --- file & git ---
    env_path = ROOT / ".env"
    gitignore = ROOT / ".gitignore"
    if env_path.exists():
        ok(f".env ada ({env_path})")
    else:
        fail(".env tidak ditemukan")
        errors += 1

    if gitignore.exists() and ".env" in gitignore.read_text(encoding="utf-8"):
        ok(".env tercantum di .gitignore")
    else:
        warn(".env mungkin belum di .gitignore — risiko commit secret")
        errors += 0

    # --- required vars ---
    model_dir = os.getenv("NILM_MODEL_DIR", "")
    data_source = os.getenv("NILM_DATA_SOURCE", "")
    base_url = (os.getenv("THINGSBOARD_BASE_URL") or "").rstrip("/")
    api_token = os.getenv("THINGSBOARD_API_TOKEN", "").strip()
    device_id = os.getenv("THINGSBOARD_DEVICE_ID", "").strip()
    device_token = os.getenv("THINGSBOARD_ACCESS_TOKEN", "").strip()
    ml_url = (
        os.getenv("NEXT_PUBLIC_ML_SERVICE_URL")
        or os.getenv("ML_SERVICE_URL")
        or "https://dhikarachman-nilm-ml-service.hf.space"
    ).rstrip("/")

    print("\n[Variabel utama]")
    print(f"  NILM_MODEL_DIR          = {model_dir or '(kosong)'}")
    print(f"  NILM_DATA_SOURCE        = {data_source or '(kosong)'}")
    print(f"  THINGSBOARD_BASE_URL    = {base_url or '(kosong)'}")
    print(f"  THINGSBOARD_API_TOKEN   = {mask(api_token)}")
    print(f"  THINGSBOARD_DEVICE_ID   = {device_id or '(kosong)'}")
    print(f"  THINGSBOARD_ACCESS_TOKEN= {mask(device_token)}")
    print(f"  ML_SERVICE_URL          = {ml_url or '(kosong)'}")

    model_path = ROOT / model_dir if model_dir else None
    if model_path and (model_path / "best_nilm_model.keras").exists():
        ok("Model v9: best_nilm_model.keras ada")
    else:
        fail(f"Model tidak ditemukan di {model_path}")
        errors += 1

    if data_source == "thingsboard":
        ok("NILM_DATA_SOURCE=thingsboard")
    else:
        warn(f"NILM_DATA_SOURCE={data_source!r} (bukan thingsboard)")

    if not base_url:
        fail("THINGSBOARD_BASE_URL kosong")
        errors += 1

    if api_token.startswith("tb_"):
        ok("API token format tb_* terdeteksi")
    elif api_token:
        warn("API token ada tetapi tidak berprefix tb_ — pastikan ini REST API key ThingsBoard")
    else:
        fail("THINGSBOARD_API_TOKEN kosong")
        errors += 1

    if device_id and len(device_id) >= 30:
        ok("THINGSBOARD_DEVICE_ID terisi (UUID)")
    else:
        fail("THINGSBOARD_DEVICE_ID kosong atau tidak valid")
        errors += 1

    if os.getenv("THINGSBOARD_USERNAME") and os.getenv("THINGSBOARD_PASSWORD"):
        warn("USERNAME/PASSWORD masih di .env — tidak wajib jika sudah pakai API token (hapus untuk lebih aman)")

  # --- ThingsBoard REST API ---
    print("\n[ThingsBoard REST API (API token)]")
    if base_url and api_token and device_id:
        keys = ",".join(
            [
                os.getenv("THINGSBOARD_KEY_VOLTAGE", "tegangan"),
                os.getenv("THINGSBOARD_KEY_CURRENT", "arus"),
                os.getenv("THINGSBOARD_KEY_POWER", "daya"),
            ]
        )
        url = f"{base_url}/api/plugins/telemetry/DEVICE/{device_id}/values/timeseries"
        try:
            # ThingsBoard 4.3+ REST API key: X-Authorization: ApiKey <token>
            r = requests.get(
                url,
                params={"keys": keys, "limit": 1},
                headers={"X-Authorization": f"ApiKey {api_token}"},
                timeout=15,
            )
            if r.status_code == 200:
                body = r.json()
                ok(f"Telemetry tenant API HTTP 200 — keys: {list(body.keys())}")
            elif r.status_code in (401, 403):
                fail(f"Telemetry tenant API HTTP {r.status_code} — token tidak valid atau tidak punya akses")
                errors += 1
            else:
                fail(f"Telemetry tenant API HTTP {r.status_code}: {r.text[:200]}")
                errors += 1
        except requests.RequestException as exc:
            fail(f"Koneksi ThingsBoard gagal: {exc}")
            errors += 1

    # --- Device HTTP API (opsional) ---
    print("\n[ThingsBoard Device API v1 (access token)]")
    if base_url and device_token:
        try:
            r = requests.get(
                f"{base_url}/api/v1/{device_token}/telemetry",
                params={"keys": "daya", "limit": 1},
                timeout=15,
            )
            if r.status_code == 200:
                ok("Device telemetry HTTP 200")
            else:
                warn(f"Device telemetry HTTP {r.status_code} (tidak kritis jika pakai API token tenant)")
        except requests.RequestException as exc:
            warn(f"Device API: {exc}")

    # --- ML service (HF atau lokal) ---
    print("\n[ML Service]")
    if ml_url:
        is_hf = ".hf.space" in ml_url
        try:
            r = requests.get(f"{ml_url}/health", timeout=60 if is_hf else 10)
            if r.status_code == 200:
                data = r.json()
                ok(f"ML service aktif ({'HF' if is_hf else 'lokal'}) — model={data.get('model_version', '?')}")
            else:
                fail(f"ML service HTTP {r.status_code} — {ml_url}/health")
                errors += 1
            r2 = requests.get(f"{ml_url}/dashboard/latest", timeout=90 if is_hf else 15)
            if r2.status_code == 200 and r2.json().get("success"):
                ok("GET /dashboard/latest HTTP 200")
            else:
                warn(f"/dashboard/latest HTTP {r2.status_code} — cek ThingsBoard di HF Space")
        except requests.RequestException as exc:
            if is_hf:
                fail(f"HF Space tidak terjangkau: {exc}")
            else:
                fail("ML service lokal tidak berjalan — jalankan: cd ml_service && python app.py")
            errors += 1
    else:
        fail("ML_SERVICE_URL kosong")
        errors += 1

    print("\n" + "=" * 60)
    if errors == 0:
        print("HASIL: Konfigurasi SIAP dipakai (restart npm run dev jika baru ubah .env)")
    else:
        print(f"HASIL: Ada {errors} masalah — perbaiki lalu jalankan ulang script ini")
    print("=" * 60)
    print("\nKeamanan: jangan commit .env / jangan share password & API token di chat publik.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
