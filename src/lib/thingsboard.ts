import {
  buildMlFallbackInference,
  inferFromMlService,
  mapInferenceToNilmFields,
  resolveDetectedLabel,
} from "@/lib/mlService";
import type { NilmData } from "@/types/nilm";

const TELEMETRY_KEY_MAP = {
  voltage: process.env.THINGSBOARD_KEY_VOLTAGE?.trim() || "tegangan",
  current: process.env.THINGSBOARD_KEY_CURRENT?.trim() || "arus",
  power: process.env.THINGSBOARD_KEY_POWER?.trim() || "daya",
  energy: process.env.THINGSBOARD_KEY_ENERGY?.trim() || "kwh",
  frequency: process.env.THINGSBOARD_KEY_FREQUENCY?.trim() || "frekuensi",
  power_factor: process.env.THINGSBOARD_KEY_POWER_FACTOR?.trim() || "power_factor",
} as const;

type MetricField = keyof typeof TELEMETRY_KEY_MAP;
type TelemetryKey = (typeof TELEMETRY_KEY_MAP)[MetricField];

type ThingsBoardAuthResponse = {
  token?: string;
  refreshToken?: string;
};

type ThingsBoardDeviceInfo = {
  id?: {
    id?: string;
  };
  name?: string;
};

type TelemetryPoint = {
  ts?: number;
  value?: string | number;
};

type ThingsBoardTelemetry = Partial<Record<TelemetryKey, TelemetryPoint[]>>;

type ThingsBoardAuthMode = "api_token" | "jwt" | "login" | "device_token";

let cachedLoginToken: string | null = null;

function getThingsBoardBaseUrl() {
  return (process.env.THINGSBOARD_BASE_URL || "").trim().replace(/\/$/, "");
}

/** Token kredensial perangkat (MQTT/HTTP device API). */
function getThingsBoardDeviceToken() {
  return process.env.THINGSBOARD_ACCESS_TOKEN?.trim() || "";
}

/**
 * REST API token dari ThingsBoard (Profile → Security → API keys).
 * Prioritas: THINGSBOARD_API_TOKEN, lalu THINGSBOARD_JWT_TOKEN (legacy).
 */
function getThingsBoardApiToken() {
  return (
    process.env.THINGSBOARD_API_TOKEN?.trim() ||
    process.env.THINGSBOARD_JWT_TOKEN?.trim() ||
    ""
  );
}

function getThingsBoardUsername() {
  return process.env.THINGSBOARD_USERNAME?.trim() || "";
}

function getThingsBoardPassword() {
  return process.env.THINGSBOARD_PASSWORD?.trim() || "";
}

function getThingsBoardDeviceId() {
  return process.env.THINGSBOARD_DEVICE_ID?.trim() || "";
}

function getThingsBoardAuthMode(): ThingsBoardAuthMode {
  const forced = (process.env.THINGSBOARD_AUTH_MODE || "auto").trim().toLowerCase();

  if (forced === "api_token" || forced === "jwt" || forced === "login" || forced === "device_token") {
    return forced;
  }

  if (getThingsBoardApiToken()) {
    return process.env.THINGSBOARD_API_TOKEN?.trim() ? "api_token" : "jwt";
  }

  if (getThingsBoardUsername() && getThingsBoardPassword()) {
    return "login";
  }

  if (getThingsBoardDeviceToken()) {
    return "device_token";
  }

  return "login";
}

function getAuthModeLabel(mode: ThingsBoardAuthMode) {
  switch (mode) {
    case "api_token":
      return "REST API token";
    case "jwt":
      return "JWT (legacy)";
    case "device_token":
      return "device access token (HTTP API v1)";
    case "login":
      return "login username/password";
    default:
      return mode;
  }
}

async function parseThingsBoardJson<T>(response: Response, endpoint: string): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error(`ThingsBoard endpoint ${endpoint} mengembalikan response kosong.`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`ThingsBoard endpoint ${endpoint} tidak mengembalikan JSON valid.`);
  }
}

async function loginThingsBoard(forceRefresh = false) {
  if (cachedLoginToken && !forceRefresh) {
    return cachedLoginToken;
  }

  const baseUrl = getThingsBoardBaseUrl();
  const username = getThingsBoardUsername();
  const password = getThingsBoardPassword();

  if (!baseUrl) {
    throw new Error("THINGSBOARD_BASE_URL belum diatur.");
  }

  if (!username || !password) {
    throw new Error(
      "THINGSBOARD_API_TOKEN belum diatur, dan fallback THINGSBOARD_USERNAME/THINGSBOARD_PASSWORD juga belum lengkap.",
    );
  }

  const endpoint = `${baseUrl}/api/auth/login`;
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const payload = await parseThingsBoardJson<ThingsBoardAuthResponse>(response, endpoint);

  if (!response.ok || !payload.token) {
    throw new Error("Login ThingsBoard gagal. Periksa username/password tenant.");
  }

  cachedLoginToken = payload.token;
  return cachedLoginToken;
}

async function resolveTenantAuthToken(forceRefresh = false): Promise<{ token: string; authScheme: "api_key" | "jwt" }> {
  const apiToken = getThingsBoardApiToken();
  if (apiToken) {
    return { token: apiToken, authScheme: "api_key" };
  }

  return { token: await loginThingsBoard(forceRefresh), authScheme: "jwt" };
}

function buildTenantAuthHeader(token: string, authScheme: "api_key" | "jwt"): string {
  // ThingsBoard 4.3+ REST API key: X-Authorization: ApiKey <tb_...>
  // JWT dari login: X-Authorization: Bearer <jwt>
  return authScheme === "api_key" ? `ApiKey ${token}` : `Bearer ${token}`;
}

async function thingsBoardFetchJson<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const baseUrl = getThingsBoardBaseUrl();
  const { token, authScheme } = await resolveTenantAuthToken();
  const endpoint = `${baseUrl}${path}`;

  const response = await fetch(endpoint, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Authorization": buildTenantAuthHeader(token, authScheme),
      ...(init?.headers ?? {}),
    },
  });

  if ((response.status === 401 || response.status === 403) && retry && !getThingsBoardApiToken()) {
    await loginThingsBoard(true);
    return thingsBoardFetchJson<T>(path, init, false);
  }

  return parseThingsBoardJson<T>(response, endpoint);
}

async function fetchDeviceApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getThingsBoardBaseUrl();
  const deviceToken = getThingsBoardDeviceToken();

  if (!deviceToken) {
    throw new Error("THINGSBOARD_ACCESS_TOKEN belum diatur untuk mode device_token.");
  }

  const endpoint = `${baseUrl}${path}`;
  const response = await fetch(endpoint, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  return parseThingsBoardJson<T>(response, endpoint);
}

async function resolveDeviceIdViaTenantApi() {
  const deviceId = getThingsBoardDeviceId();
  if (deviceId) {
    return deviceId;
  }

  const accessToken = getThingsBoardDeviceToken();
  if (!accessToken) {
    throw new Error(
      "THINGSBOARD_DEVICE_ID wajib diisi saat memakai API token tenant, " +
        "atau isi THINGSBOARD_ACCESS_TOKEN agar device dapat ditemukan otomatis.",
    );
  }

  const payload = await thingsBoardFetchJson<ThingsBoardDeviceInfo>(
    `/api/device/info?deviceToken=${encodeURIComponent(accessToken)}`,
  );
  const resolvedId = payload.id?.id;

  if (!resolvedId) {
    throw new Error("Device ID ThingsBoard tidak berhasil ditemukan dari access token.");
  }

  return resolvedId;
}

function getLatestValue(points: TelemetryPoint[] | undefined, key: MetricField, defaultValue = 0) {
  const rawValue = points?.[0]?.value;

  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultValue;
  }

  const numericValue = Number(rawValue);

  if (Number.isNaN(numericValue)) {
    return defaultValue;
  }

  return numericValue;
}

async function fetchTelemetryViaTenantApi(): Promise<ThingsBoardTelemetry> {
  const deviceId = await resolveDeviceIdViaTenantApi();
  const keys = Object.values(TELEMETRY_KEY_MAP).join(",");

  // Ambil nilai terbaru per key (tanpa jendela 5 menit — kosong jika ESP32 offline sementara)
  const latestQuery = new URLSearchParams({ keys, limit: "1" });
  const latest = await thingsBoardFetchJson<ThingsBoardTelemetry>(
    `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?${latestQuery.toString()}`,
  );

  const hasAnyPoint = Object.values(TELEMETRY_KEY_MAP).some((telemetryKey) => {
    const points = latest[telemetryKey];
    return Array.isArray(points) && points.length > 0;
  });

  if (hasAnyPoint) {
    return latest;
  }

  // Fallback: cari dalam 24 jam terakhir jika belum ada titik di response "latest"
  const endTs = Date.now();
  const startTs = endTs - 86_400_000;
  const rangeQuery = new URLSearchParams({
    keys,
    startTs: String(startTs),
    endTs: String(endTs),
    limit: "1",
    agg: "NONE",
  });

  return thingsBoardFetchJson<ThingsBoardTelemetry>(
    `/api/plugins/telemetry/DEVICE/${deviceId}/values/timeseries?${rangeQuery.toString()}`,
  );
}

async function fetchTelemetryViaDeviceApi(): Promise<ThingsBoardTelemetry> {
  const deviceToken = getThingsBoardDeviceToken();
  const query = new URLSearchParams({
    keys: Object.values(TELEMETRY_KEY_MAP).join(","),
    limit: "1",
  });

  return fetchDeviceApiJson<ThingsBoardTelemetry>(
    `/api/v1/${encodeURIComponent(deviceToken)}/telemetry?${query.toString()}`,
  );
}

function sampleFromTelemetry(telemetry: ThingsBoardTelemetry) {
  const sample = {
    voltage: getLatestValue(telemetry[TELEMETRY_KEY_MAP.voltage], "voltage"),
    current: getLatestValue(telemetry[TELEMETRY_KEY_MAP.current], "current"),
    power: getLatestValue(telemetry[TELEMETRY_KEY_MAP.power], "power"),
    energy: getLatestValue(telemetry[TELEMETRY_KEY_MAP.energy], "energy"),
    frequency: getLatestValue(telemetry[TELEMETRY_KEY_MAP.frequency], "frequency", 50),
    power_factor: getLatestValue(telemetry[TELEMETRY_KEY_MAP.power_factor], "power_factor", 0),
  };

  const missingKeys = (Object.keys(TELEMETRY_KEY_MAP) as MetricField[]).filter((field) => {
    const telemetryKey = TELEMETRY_KEY_MAP[field];
    const points = telemetry[telemetryKey];
    return !Array.isArray(points) || points.length === 0;
  });

  return { sample, missingKeys };
}

export async function fetchLatestThingsBoardDataWithMeta(): Promise<{ data: NilmData; notice?: string }> {
  const baseUrl = getThingsBoardBaseUrl();
  const authMode = getThingsBoardAuthMode();

  if (!baseUrl) {
    throw new Error("THINGSBOARD_BASE_URL belum diatur.");
  }

  if (authMode === "device_token" && !getThingsBoardDeviceToken()) {
    throw new Error(
      "Mode device_token dipilih tetapi THINGSBOARD_ACCESS_TOKEN kosong. " +
        "Isi token perangkat atau gunakan THINGSBOARD_API_TOKEN untuk REST API tenant.",
    );
  }

  if ((authMode === "api_token" || authMode === "jwt") && !getThingsBoardApiToken()) {
    throw new Error("THINGSBOARD_API_TOKEN belum diatur.");
  }

  const telemetry =
    authMode === "device_token" ? await fetchTelemetryViaDeviceApi() : await fetchTelemetryViaTenantApi();

  const { sample, missingKeys } = sampleFromTelemetry(telemetry);

  let inference;
  const notices: string[] = [];

  if (missingKeys.length > 0) {
    notices.push(
      `Beberapa key telemetry kosong di ThingsBoard (${missingKeys.join(", ")}). Nilai default dipakai untuk key yang hilang.`,
    );
  }

  try {
    inference = await inferFromMlService(sample);

    if (inference.label_source?.startsWith("meta_nilm.json")) {
      notices.push("Label inferensi berasal dari file meta_nilm.json.");
    } else if (inference.label_source === "generated") {
      notices.push("Label model masih placeholder unknown_* karena mapping label final belum tersedia.");
    }

    if (inference.buffer?.status && inference.buffer.status !== "READY") {
      notices.push(`Buffer inferensi model masih ${inference.buffer.status.toLowerCase()}. Prediksi awal dapat berubah.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ML service error";
    inference = buildMlFallbackInference(sample);

    if (inference.label === "idle") {
      notices.push(
        `ML service tidak dapat diakses (${message}). Daya ${sample.power.toFixed(1)} W di bawah noise floor — ditampilkan sebagai idle.`,
      );
    } else {
      notices.push(`ML service tidak dapat diakses (${message}). Menggunakan fallback label unknown dan confidence 0.`);
    }
  }

  if (inference.buffer?.status && inference.buffer.status !== "READY") {
    notices.push(`Buffer inferensi model masih ${inference.buffer.status.toLowerCase()}. Prediksi awal dapat berubah.`);
  }

  notices.push(
    `Dashboard membaca telemetry live dari ThingsBoard di ${baseUrl}. Autentikasi: ${getAuthModeLabel(authMode)}.`,
  );

  if (authMode === "api_token" || authMode === "jwt") {
    const deviceId = getThingsBoardDeviceId();
    if (!deviceId) {
      notices.push("Tips: set THINGSBOARD_DEVICE_ID di .env agar lookup perangkat lebih cepat.");
    }
  }

  return {
    data: {
      ...sample,
      device_detected: resolveDetectedLabel(inference),
      confidence: inference.confidence ?? 0,
      model_version: inference.model_version ?? "N/A",
      timestamp: inference.timestamp ?? new Date().toISOString(),
      ...mapInferenceToNilmFields(inference),
    },
    notice: notices.join(" "),
  };
}
