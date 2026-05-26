"""Fetch latest telemetry from ThingsBoard (server-side, for /dashboard/latest)."""

from __future__ import annotations

import os
from typing import Any

import requests

TELEMETRY_KEYS = {
  "voltage": os.environ.get("THINGSBOARD_KEY_VOLTAGE", "tegangan").strip() or "tegangan",
  "current": os.environ.get("THINGSBOARD_KEY_CURRENT", "arus").strip() or "arus",
  "power": os.environ.get("THINGSBOARD_KEY_POWER", "daya").strip() or "daya",
  "energy": os.environ.get("THINGSBOARD_KEY_ENERGY", "kwh").strip() or "kwh",
  "frequency": os.environ.get("THINGSBOARD_KEY_FREQUENCY", "frekuensi").strip() or "frekuensi",
  "power_factor": os.environ.get("THINGSBOARD_KEY_POWER_FACTOR", "power_factor").strip()
  or "power_factor",
}


def _base_url() -> str:
  url = (os.environ.get("THINGSBOARD_BASE_URL") or "").strip().rstrip("/")
  if not url:
    raise RuntimeError("THINGSBOARD_BASE_URL belum diatur di environment ML service.")
  return url


def _device_token() -> str:
  return (os.environ.get("THINGSBOARD_ACCESS_TOKEN") or "").strip()


def _api_token() -> str:
  return (
    (os.environ.get("THINGSBOARD_API_TOKEN") or os.environ.get("THINGSBOARD_JWT_TOKEN") or "").strip()
  )


def _device_id() -> str:
  return (os.environ.get("THINGSBOARD_DEVICE_ID") or "").strip()


def _login_token() -> str:
  username = (os.environ.get("THINGSBOARD_USERNAME") or "").strip()
  password = (os.environ.get("THINGSBOARD_PASSWORD") or "").strip()
  if not username or not password:
    raise RuntimeError("THINGSBOARD_USERNAME/PASSWORD belum diatur.")
  response = requests.post(
    f"{_base_url()}/api/auth/login",
    json={"username": username, "password": password},
    timeout=15,
  )
  response.raise_for_status()
  payload = response.json()
  token = payload.get("token")
  if not token:
    raise RuntimeError("Login ThingsBoard tidak mengembalikan token.")
  return str(token)


def _tenant_auth_header(token: str) -> str:
  """
  ThingsBoard 4.3+ REST API key: X-Authorization: ApiKey <tb_...>
  JWT dari /api/auth/login: X-Authorization: Bearer <jwt>
  """
  normalized = token.strip()
  if normalized.startswith("tb_"):
    return f"ApiKey {normalized}"
  if normalized.startswith("eyJ"):
    return f"Bearer {normalized}"
  # Default: treat as REST API key (ThingsBoard Cloud)
  return f"ApiKey {normalized}"


def _auth_headers() -> dict[str, str]:
  api_token = _api_token()
  if api_token:
    return {"X-Authorization": _tenant_auth_header(api_token)}
  return {"X-Authorization": f"Bearer {_login_token()}"}


def _resolve_device_id(headers: dict[str, str]) -> str:
  device_id = _device_id()
  if device_id:
    return device_id
  token = _device_token()
  if not token:
    raise RuntimeError("THINGSBOARD_DEVICE_ID atau THINGSBOARD_ACCESS_TOKEN wajib diisi.")
  response = requests.get(
    f"{_base_url()}/api/device/info",
    params={"deviceToken": token},
    headers=headers,
    timeout=15,
  )
  response.raise_for_status()
  payload = response.json()
  resolved = (payload.get("id") or {}).get("id")
  if not resolved:
    raise RuntimeError("Device ID ThingsBoard tidak ditemukan dari access token.")
  return str(resolved)


def _parse_value(points: list[dict[str, Any]] | None, default: float = 0.0) -> float:
  if not points:
    return default
  raw = points[0].get("value")
  if raw is None or raw == "":
    return default
  try:
    return float(raw)
  except (TypeError, ValueError):
    return default


def _telemetry_via_device_api() -> dict[str, Any]:
  token = _device_token()
  if not token:
    raise RuntimeError("THINGSBOARD_ACCESS_TOKEN kosong untuk mode device API.")
  keys = ",".join(TELEMETRY_KEYS.values())
  response = requests.get(
    f"{_base_url()}/api/v1/{token}/telemetry",
    params={"keys": keys, "limit": 1},
    timeout=15,
  )
  response.raise_for_status()
  return response.json()


def _telemetry_via_tenant_api() -> dict[str, Any]:
  headers = _auth_headers()
  device_id = _resolve_device_id(headers)
  keys = ",".join(TELEMETRY_KEYS.values())
  response = requests.get(
    f"{_base_url()}/api/plugins/telemetry/DEVICE/{device_id}/values/timeseries",
    params={"keys": keys, "limit": 1},
    headers=headers,
    timeout=15,
  )
  response.raise_for_status()
  return response.json()


def _sample_from_telemetry(telemetry: dict[str, Any]) -> dict[str, float]:
  return {
    "voltage": _parse_value(telemetry.get(TELEMETRY_KEYS["voltage"]), 220.0),
    "current": _parse_value(telemetry.get(TELEMETRY_KEYS["current"]), 0.0),
    "power": _parse_value(telemetry.get(TELEMETRY_KEYS["power"]), 0.0),
    "energy": _parse_value(telemetry.get(TELEMETRY_KEYS["energy"]), 0.0),
    "frequency": _parse_value(telemetry.get(TELEMETRY_KEYS["frequency"]), 50.0),
    "power_factor": _parse_value(telemetry.get(TELEMETRY_KEYS["power_factor"]), 0.0),
  }


def fetch_thingsboard_sample() -> dict[str, float]:
  auth_mode = (os.environ.get("THINGSBOARD_AUTH_MODE") or "auto").strip().lower()

  if auth_mode == "device_token":
    return _sample_from_telemetry(_telemetry_via_device_api())

  if auth_mode in ("api_token", "jwt", "login"):
    return _sample_from_telemetry(_telemetry_via_tenant_api())

  # auto: tenant API jika ada API token / login; fallback device token jika 401
  if _api_token() or (_device_id() and not _device_token()):
    try:
      return _sample_from_telemetry(_telemetry_via_tenant_api())
    except requests.HTTPError as exc:
      status = exc.response.status_code if exc.response is not None else None
      if status in (401, 403) and _device_token():
        return _sample_from_telemetry(_telemetry_via_device_api())
      raise

  if _device_token():
    return _sample_from_telemetry(_telemetry_via_device_api())

  return _sample_from_telemetry(_telemetry_via_tenant_api())
