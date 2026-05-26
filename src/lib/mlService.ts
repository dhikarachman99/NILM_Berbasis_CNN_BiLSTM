import { heuristicLabelFromPower, labelToDeviceKey, resolveLabelFromActiveDevices } from "@/lib/nilmMeta";
import type { DeviceProbability, NilmData } from "@/types/nilm";

export interface SensorSample {
  voltage: number;
  current: number;
  power: number;
  energy: number;
  frequency: number;
  power_factor: number;
}

export interface InferenceResponse {
  success: boolean;
  label?: string;
  confidence?: number;
  model_version?: string;
  label_source?: string;
  timestamp?: string;
  problem_type?: string;
  active_devices?: string[];
  device_probs?: DeviceProbability[];
  buffer?: {
    status?: string;
    received?: number;
    window?: number;
  };
  error?: string;
}

export function mapInferenceToNilmFields(
  inference: InferenceResponse,
): Pick<NilmData, "active_devices" | "device_probs" | "buffer_status"> {
  const activeDevices =
    inference.active_devices ??
    (inference.label ? labelToDeviceKey(inference.label) : []);

  return {
    active_devices: activeDevices,
    device_probs: inference.device_probs ?? [],
    buffer_status: inference.buffer?.status,
  };
}

export function resolveDetectedLabel(inference: InferenceResponse): string {
  if (inference.label === "filling_buffer") {
    return "idle";
  }

  if (inference.label && inference.label !== "unknown") {
    const fromActive = inference.active_devices?.length
      ? resolveLabelFromActiveDevices(inference.active_devices)
      : null;
    return fromActive ?? inference.label;
  }

  if (inference.active_devices?.length) {
    return resolveLabelFromActiveDevices(inference.active_devices);
  }

  return inference.label ?? "unknown";
}

export interface LatestMlResponse {
  success: boolean;
  data?: NilmData;
  meta?: {
    label_source?: string;
    buffer?: {
      status?: string;
    };
  };
  error?: string;
}

export interface LatestMlData {
  success: true;
  data: NilmData;
  meta?: {
    label_source?: string;
    buffer?: {
      status?: string;
    };
  };
}

export function getMlServiceUrl() {
  return (process.env.ML_SERVICE_URL || "http://127.0.0.1:5001").replace(/\/$/, "");
}

async function parseMlServiceJson<T>(response: Response, endpoint: string): Promise<T> {
  const rawText = await response.text();
  const trimmed = rawText.trim();

  if (!trimmed) {
    throw new Error(`ML service endpoint ${endpoint} mengembalikan response kosong.`);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.startsWith("<")) {
      throw new Error(
        `ML service endpoint ${endpoint} mengembalikan HTML, bukan JSON. Biasanya ini berarti service Flask masih versi lama atau belum direstart.`,
      );
    }

    throw new Error(`ML service endpoint ${endpoint} mengembalikan response yang bukan JSON valid.`);
  }
}

export async function inferFromMlService(sample: SensorSample) {
  const endpoint = `${getMlServiceUrl()}/ingest`;
  const response = await fetch(`${getMlServiceUrl()}/ingest`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sample,
      update_blynk: process.env.ML_UPDATE_BLYNK === "true",
    }),
  });

  const payload = await parseMlServiceJson<InferenceResponse>(response, endpoint);

  if (!response.ok || !payload.success || !payload.label) {
    throw new Error(payload.error || "ML service tidak mengembalikan prediksi yang valid.");
  }

  return payload;
}

export async function fetchLatestMlData(): Promise<LatestMlData> {
  const endpoint = `${getMlServiceUrl()}/latest`;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await parseMlServiceJson<LatestMlResponse>(response, endpoint);

  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || "ML service belum memiliki data telemetry terbaru.");
  }

  return {
    success: true,
    data: payload.data,
    meta: payload.meta,
  };
}

export function buildMlFallbackInference(sample: SensorSample): InferenceResponse {
  const idle = heuristicLabelFromPower(sample.power);
  const timestamp = new Date().toISOString();

  if (idle) {
    return {
      success: false,
      label: idle.label,
      confidence: idle.confidence,
      model_version: "N/A",
      timestamp,
      label_source: "heuristic:noise_floor",
      active_devices: [],
      device_probs: [],
    };
  }

  return {
    success: false,
    label: "unknown",
    confidence: 0,
    model_version: "N/A",
    timestamp,
    label_source: "fallback",
    active_devices: [],
    device_probs: [],
  };
}

export function buildFallbackNilmData(sample: SensorSample, timestamp: string): NilmData {
  const inference = buildMlFallbackInference(sample);
  return {
    ...sample,
    device_detected: inference.label ?? "unknown",
    confidence: inference.confidence ?? 0,
    model_version: inference.model_version ?? "N/A",
    timestamp,
    active_devices: [],
    device_probs: [],
  };
}
