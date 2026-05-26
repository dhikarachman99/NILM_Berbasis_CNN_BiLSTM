import {
  buildMlFallbackInference,
  inferFromMlService,
  mapInferenceToNilmFields,
  resolveDetectedLabel,
  type InferenceResponse,
  type SensorSample,
} from "@/lib/mlService";
import type { NilmData } from "@/types/nilm";

const REQUIRED_PIN_MAP = {
  voltage: "V0",
  current: "V1",
  power: "V2",
  energy: "V3",
  frequency: "V4",
  power_factor: "V5",
} as const;

const OPTIONAL_PIN_MAP = {
  device_detected: "V6",
  confidence: "V7",
  model_version: "V8",
  timestamp: "V9",
} as const;

type RequiredPinField = keyof typeof REQUIRED_PIN_MAP;
type OptionalPinField = keyof typeof OPTIONAL_PIN_MAP;

const NUMERIC_FIELDS = new Set<keyof NilmData | RequiredPinField>([
  "voltage",
  "current",
  "power",
  "energy",
  "frequency",
  "power_factor",
  "confidence",
]);

function getBaseUrl() {
  return (process.env.BLYNK_BASE_URL || "https://blynk.cloud/external/api").replace(/\/$/, "");
}

function cleanValue(rawValue: string) {
  return rawValue
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/^["']+/, "")
    .replace(/["']+$/, "")
    .trim();
}

async function fetchVirtualPin(pin: string, token: string) {
  const url = `${getBaseUrl()}/get?token=${encodeURIComponent(token)}&${pin}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "text/plain, application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`request ${pin} gagal (${response.status}): ${detail || response.statusText}`);
  }

  return cleanValue(await response.text());
}

async function fetchVirtualPinOptional(pin: string, token: string) {
  try {
    return await fetchVirtualPin(pin, token);
  } catch {
    return null;
  }
}

export async function fetchLatestBlynkDataWithMeta(token: string): Promise<{ data: NilmData; notice?: string }> {
  const entries = await Promise.all(
    Object.entries(REQUIRED_PIN_MAP).map(async ([field, pin]) => {
      const value = await fetchVirtualPin(pin, token);
      return [field, value] as const;
    }),
  );

  const optionalEntries = await Promise.all(
    Object.entries(OPTIONAL_PIN_MAP).map(async ([field, pin]) => {
      const value = await fetchVirtualPinOptional(pin, token);
      return [field, value] as const;
    }),
  );

  const rawRequired = Object.fromEntries(entries) as Record<RequiredPinField, string>;
  const rawOptional = Object.fromEntries(optionalEntries) as Record<OptionalPinField, string | null>;
  const parsedRequired = {} as SensorSample;
  const notices: string[] = [];

  for (const key of Object.keys(REQUIRED_PIN_MAP) as RequiredPinField[]) {
    const value = rawRequired[key];

    if (NUMERIC_FIELDS.has(key)) {
      const numericValue = Number(value);

      if (Number.isNaN(numericValue)) {
        throw new Error(`nilai ${key} dari Blynk tidak valid: ${value}`);
      }

      parsedRequired[key] = numericValue as never;
      continue;
    }

    parsedRequired[key] = value as never;
  }

  const optionalPinsMissing = Object.entries(rawOptional)
    .filter(([, value]) => value == null)
    .map(([field]) => OPTIONAL_PIN_MAP[field as OptionalPinField]);

  let inferredLabel = rawOptional.device_detected ?? "unknown";
  let inferredConfidence = 0;
  let inferredModelVersion = rawOptional.model_version ?? "N/A";
  let inferredTimestamp = rawOptional.timestamp ?? new Date().toISOString();
  let inference: InferenceResponse | null = null;

  try {
    inference = await inferFromMlService(parsedRequired);
    inferredLabel = resolveDetectedLabel(inference);
    inferredConfidence = inference.confidence ?? inferredConfidence;
    inferredModelVersion = inference.model_version ?? inferredModelVersion;
    inferredTimestamp = inference.timestamp ?? inferredTimestamp;

    if (inference.label_source?.startsWith("meta_nilm.json")) {
      notices.push("Label inferensi berasal dari file meta_nilm.json.");
    } else if (inference.label_source === "generated") {
      notices.push("Label model belum tersedia di file training, sehingga output saat ini memakai placeholder unknown_*.");
    }

    if (inference.buffer?.status && inference.buffer.status !== "READY") {
      notices.push(`Buffer inferensi model masih ${inference.buffer.status.toLowerCase()}. Prediksi awal dapat berubah.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ML service error";
    inference = buildMlFallbackInference(parsedRequired);
    inferredLabel = resolveDetectedLabel(inference);
    inferredConfidence = inference.confidence ?? 0;
    inferredModelVersion = inference.model_version ?? inferredModelVersion;
    inferredTimestamp = inference.timestamp ?? inferredTimestamp;

    if (inference.label === "idle") {
      notices.push(
        `ML service tidak dapat diakses (${message}). Daya rendah — ditampilkan sebagai idle (heuristik noise floor).`,
      );
    } else if (rawOptional.device_detected != null || rawOptional.confidence != null || rawOptional.model_version != null) {
      notices.push(`ML service tidak dapat diakses (${message}). Menggunakan hasil inferensi terakhir dari Blynk jika tersedia.`);
    } else {
      notices.push(`ML service tidak dapat diakses (${message}). Label perangkat belum bisa dihitung dari data ESP32.`);
    }
  }

  if (rawOptional.confidence != null && inferredConfidence === 0) {
    const numericValue = Number(rawOptional.confidence);
    inferredConfidence = Number.isNaN(numericValue) ? 0 : numericValue;
  }

  if (optionalPinsMissing.length > 0) {
    notices.push(`Datastream ${optionalPinsMissing.join(", ")} belum dibuat di Blynk. Nilai inferensi diambil dari backend jika tersedia.`);
  }

  const parsedData: NilmData = {
    ...parsedRequired,
    device_detected: inferredLabel,
    confidence: inferredConfidence,
    model_version: inferredModelVersion,
    timestamp: inferredTimestamp,
    ...(inference ? mapInferenceToNilmFields(inference) : { active_devices: [], device_probs: [] }),
  };

  return {
    data: parsedData,
    notice: notices.length > 0 ? notices.join(" ") : undefined,
  };
}

export async function fetchLatestBlynkData(token: string): Promise<NilmData> {
  const result = await fetchLatestBlynkDataWithMeta(token);
  return result.data;
}

export const PIN_MAP = {
  ...REQUIRED_PIN_MAP,
  ...OPTIONAL_PIN_MAP,
} as const;
