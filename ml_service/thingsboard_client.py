"""ThingsBoard telemetry client (server-side only).

Kontrak keamanan:
- Tidak pernah membaca telemetry via THINGSBOARD_ACCESS_TOKEN (device API v1).
- Telemetry dibaca via ThingsBoard tenant REST API:
  GET /api/plugins/telemetry/DEVICE/{deviceId}/values/timeseries
- Autentikasi: prioritas ApiKey → login username/password (JWT).
"""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any

import requests

try:
  from requests.adapters import HTTPAdapter
  from urllib3.util.retry import Retry
except Exception:  # pragma: no cover
  HTTPAdapter = None
  Retry = None

DEFAULT_TELEMETRY_KEY_MAP: dict[str, str] = {
  "voltage": "tegangan",
  "current": "arus",
  "power": "daya",
  "energy": "kwh",
  "frequency": "frekuensi",
  "power_factor": "power_factor",
}

_CACHE_TTL_SECONDS = 2.0
_CACHE: dict[str, Any] = {"ts": 0.0, "raw": None}
_JWT_CACHE: dict[str, Any] = {"ts": 0.0, "token": None}


def get_tb_config() -> dict[str, Any]:
  base_url = (os.environ.get("THINGSBOARD_BASE_URL") or "").strip().rstrip("/")
  device_id = (os.environ.get("THINGSBOARD_DEVICE_ID") or "").strip()
  api_token = (os.environ.get("THINGSBOARD_API_TOKEN") or "").strip()
  username = (os.environ.get("THINGSBOARD_USERNAME") or "").strip()
  password = (os.environ.get("THINGSBOARD_PASSWORD") or "").strip()

  telemetry_keys = {
    metric: (os.environ.get(f"THINGSBOARD_KEY_{metric.upper()}", default) or "").strip() or default
    for metric, default in DEFAULT_TELEMETRY_KEY_MAP.items()
  }

  return {
    "base_url": base_url,
    "device_id": device_id,
    "api_token": api_token,
    "username": username,
    "password": password,
    "telemetry_keys": telemetry_keys,
  }


def _require(value: str, name: str) -> str:
  if not value:
    raise RuntimeError(f"{name} belum diatur.")
  return value


def _build_session() -> requests.Session:
  session = requests.Session()
  if HTTPAdapter is None or Retry is None:
    return session

  retry = Retry(
    total=2,
    connect=2,
    read=2,
    backoff_factor=0.4,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=("GET", "POST"),
    raise_on_status=False,
  )
  adapter = HTTPAdapter(max_retries=retry)
  session.mount("https://", adapter)
  session.mount("http://", adapter)
  return session


def _device_id_hash(device_id: str) -> str:
  if not device_id:
    return "unknown"
  digest = hashlib.sha256(device_id.encode("utf-8")).hexdigest()
  return digest[:8]


def login_with_username_password() -> str:
  cfg = get_tb_config()
  base_url = _require(cfg["base_url"], "THINGSBOARD_BASE_URL")
  username = _require(cfg["username"], "THINGSBOARD_USERNAME")
  password = _require(cfg["password"], "THINGSBOARD_PASSWORD")

  response = _build_session().post(
    f"{base_url}/api/auth/login",
    json={"username": username, "password": password},
    timeout=10,
  )

  if response.status_code in (401, 403):
    raise RuntimeError("ThingsBoard authentication failed")

  response.raise_for_status()
  payload = response.json() if response.content else {}
  token = payload.get("token")
  if not token:
    raise RuntimeError("ThingsBoard authentication failed")
  return str(token)


def get_auth_header() -> dict[str, str]:
  cfg = get_tb_config()
  api_token = (cfg.get("api_token") or "").strip()
  if api_token:
    return {"X-Authorization": f"ApiKey {api_token}"}

  now = time.time()
  cached = _JWT_CACHE.get("token")
  cached_ts = float(_JWT_CACHE.get("ts") or 0.0)
  if cached and (now - cached_ts) < 15 * 60:
    return {"X-Authorization": f"Bearer {cached}"}

  token = login_with_username_password()
  _JWT_CACHE["token"] = token
  _JWT_CACHE["ts"] = now
  return {"X-Authorization": f"Bearer {token}"}


def validate_required_keys(raw: dict[str, Any]) -> list[str]:
  cfg = get_tb_config()
  key_map = cfg["telemetry_keys"]
  missing: list[str] = []
  for metric, tb_key in key_map.items():
    points = raw.get(tb_key)
    if not isinstance(points, list) or len(points) == 0:
      missing.append(metric)
  return missing


def get_latest_telemetry(*, use_cache: bool = True) -> dict[str, Any]:
  cfg = get_tb_config()
  base_url = _require(cfg["base_url"], "THINGSBOARD_BASE_URL")
  device_id = _require(cfg["device_id"], "THINGSBOARD_DEVICE_ID")
  key_map = cfg["telemetry_keys"]
  keys = ",".join(key_map.values())

  now = time.time()
  if use_cache and _CACHE.get("raw") is not None and (now - float(_CACHE.get("ts") or 0.0)) < _CACHE_TTL_SECONDS:
    return _CACHE["raw"]

  headers = get_auth_header()
  url = f"{base_url}/api/plugins/telemetry/DEVICE/{device_id}/values/timeseries"
  response = _build_session().get(url, params={"keys": keys, "limit": 1}, headers=headers, timeout=10)

  if response.status_code in (401, 403):
    if cfg.get("api_token"):
      _JWT_CACHE["token"] = None
      _JWT_CACHE["ts"] = 0.0
    raise RuntimeError("ThingsBoard authentication failed")

  if response.status_code == 404:
    raise RuntimeError("ThingsBoard device not found")

  response.raise_for_status()
  raw = response.json() if response.content else {}
  if not isinstance(raw, dict):
    raise RuntimeError("Malformed telemetry response")

  _CACHE["raw"] = raw
  _CACHE["ts"] = now
  return raw


def _parse_point(points: Any) -> tuple[Any, int | None]:
  if not isinstance(points, list) or not points:
    return None, None
  first = points[0] if isinstance(points[0], dict) else {}
  ts = first.get("ts")
  value = first.get("value")
  try:
    ts_int = int(ts) if ts is not None else None
  except Exception:
    ts_int = None
  return value, ts_int


def normalize_telemetry_response(raw: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
  cfg = get_tb_config()
  key_map = cfg["telemetry_keys"]
  warnings: list[str] = []
  normalized: dict[str, Any] = {}

  for metric, tb_key in key_map.items():
    if tb_key not in raw:
      normalized[metric] = {"key": tb_key, "value": None, "ts": None}
      warnings.append(f"Telemetry key not found: {tb_key}")
      continue

    raw_value, ts = _parse_point(raw.get(tb_key))
    if raw_value is None or raw_value == "":
      normalized[metric] = {"key": tb_key, "value": None, "ts": ts}
      warnings.append(f"Device telemetry empty: {tb_key}")
      continue

    try:
      numeric = float(raw_value)
      normalized[metric] = {"key": tb_key, "value": numeric, "ts": ts}
    except Exception:
      normalized[metric] = {"key": tb_key, "value": str(raw_value), "ts": ts, "warning": "non_numeric_value"}
      warnings.append(f"Non-numeric telemetry value: {tb_key}")

  return normalized, warnings


def _value_as_float(value: Any) -> float | None:
  if value is None:
    return None
  if isinstance(value, (int, float)):
    return float(value)
  try:
    return float(str(value))
  except Exception:
    return None


def fetch_thingsboard_sample() -> dict[str, float]:
  raw = get_latest_telemetry(use_cache=True)
  normalized, _warnings = normalize_telemetry_response(raw)
  required = list(DEFAULT_TELEMETRY_KEY_MAP.keys())
  missing = [metric for metric in required if _value_as_float(normalized.get(metric, {}).get("value")) is None]
  if missing:
    raise RuntimeError(f"Telemetry incomplete: {', '.join(missing)}")

  return {
    metric: float(_value_as_float(normalized[metric]["value"]))  # type: ignore[arg-type]
    for metric in required
  }


def get_public_telemetry_meta() -> dict[str, Any]:
  cfg = get_tb_config()
  device_id = (cfg.get("device_id") or "").strip()
  return {
    "source": "thingsboard",
    "device_id": f"sha256:{_device_id_hash(device_id)}",
  }
