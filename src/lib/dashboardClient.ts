import type { LatestBlynkResponse } from "@/types/nilm";
import { getMlDashboardEndpoint, getMlServiceUrl } from "@/lib/mlServiceConfig";

type LiveTelemetryPoint = {
  key: string;
  value: number | string | null;
  ts: number | null;
  warning?: string;
};

type PredictLiveResponse = {
  ok?: boolean;
  success?: boolean;
  source?: "thingsboard" | "dummy" | "blynk";
  device_id?: string;
  telemetry?: Record<string, LiveTelemetryPoint>;
  last_ts?: number | null;
  prediction?: {
    ok?: boolean;
    data?: {
      label?: string;
      confidence?: number;
      model_version?: string;
      timestamp?: string;
      active_devices?: string[];
      device_probs?: Array<{ device: string; probability: number }>;
      buffer?: { status?: string; received?: number; window?: number; bar?: string };
      label_source?: string;
      problem_type?: string;
    } | null;
    error?: string | null;
  };
  warnings?: string[];
  error?: string | null;
};

export async function fetchDashboardLatest(): Promise<LatestBlynkResponse> {
  if (process.env.NEXT_PUBLIC_USE_DUMMY_BLYNK === "true") {
    const { getNextMockBlynkData } = await import("@/lib/mockData");
    const data = await getNextMockBlynkData();
    return {
      success: true,
      data,
      source: "dummy",
      last_updated: data.timestamp,
      error: "Mode simulasi aktif (dummy).",
    };
  }

  const endpoint = getMlDashboardEndpoint();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error(
      `Tidak bisa terhubung ke ML service (${endpoint}). Cek HF Space aktif dan CORS_ORIGINS mencakup localhost jika dev lokal.`,
    );
  }

  const rawText = await response.text();
  let payload: PredictLiveResponse;

  try {
    payload = JSON.parse(rawText) as PredictLiveResponse;
  } catch {
    if (response.status === 404) {
      throw new Error(
        `Endpoint /predict/live tidak ada (404) di ${getMlServiceUrl()}. Pastikan HF Space sudah build dan URL benar.`,
      );
    }
    throw new Error("ML service mengembalikan response yang bukan JSON valid.");
  }

  if (response.status === 404) {
    throw new Error(
      `Endpoint /predict/live tidak ada (404) di ${getMlServiceUrl()}. Pastikan HF Space sudah build dan URL benar.`,
    );
  }

  const isOk = Boolean(payload.ok) || Boolean(payload.success);
  if (!response.ok || !isOk || !payload.telemetry) {
    return {
      success: false,
      data: null,
      source: payload.source ?? "thingsboard",
      last_updated: new Date().toISOString(),
      error: payload.error ?? `ML service error (${response.status})`,
    };
  }

  const warnings: string[] = [];
  const telemetry = payload.telemetry;

  function readNumeric(metric: string, fallback: number) {
    const value = telemetry?.[metric]?.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
      warnings.push(`Nilai telemetry ${metric} bukan angka.`);
    }
    if (value === null || value === undefined) {
      warnings.push(`Telemetry ${metric} kosong.`);
    }
    return fallback;
  }

  const predictionOk = Boolean(payload.prediction?.ok);
  const prediction = payload.prediction?.data ?? null;
  const predictionError = payload.prediction?.error ?? null;

  if (Array.isArray(payload.warnings)) {
    warnings.push(...payload.warnings);
  }
  if (!predictionOk && predictionError) {
    warnings.push(predictionError);
  }

  const nowIso = new Date().toISOString();
  const timestamp = prediction?.timestamp ?? nowIso;

  const data = {
    voltage: readNumeric("voltage", 0),
    current: readNumeric("current", 0),
    power: readNumeric("power", 0),
    energy: readNumeric("energy", 0),
    frequency: readNumeric("frequency", 50),
    power_factor: readNumeric("power_factor", 0),
    device_detected: predictionOk ? (prediction?.label ?? "idle") : "unavailable",
    confidence: predictionOk ? Number(prediction?.confidence ?? 0) : 0,
    model_version: predictionOk ? (prediction?.model_version ?? "N/A") : "N/A",
    timestamp,
    active_devices: prediction?.active_devices ?? undefined,
    device_probs: prediction?.device_probs ?? undefined,
    buffer_status: prediction?.buffer?.status ?? undefined,
  };

  return {
    success: true,
    data,
    source: payload.source ?? "thingsboard",
    last_updated: timestamp,
    error: warnings.length > 0 ? warnings.join(" ") : undefined,
  };
}
