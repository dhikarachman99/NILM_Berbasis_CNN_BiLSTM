/** URL default ML API (HF Space). Override lewat .env / .env.local jika perlu. */
export const DEFAULT_ML_SERVICE_URL =
  "https://dhikarachman-nilm-ml-service.hf.space";

export function getMlServiceUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_ML_SERVICE_URL?.trim() ||
    process.env.ML_SERVICE_URL?.trim() ||
    DEFAULT_ML_SERVICE_URL;
  return url.replace(/\/$/, "");
}

export function getMlDashboardEndpoint(): string {
  return `${getMlServiceUrl()}/dashboard/latest`;
}

export function isRemoteMlService(): boolean {
  const url = getMlServiceUrl();
  return url.includes(".hf.space") || url.includes("huggingface.co");
}

export async function fetchMlHealth(): Promise<{
  ok: boolean;
  modelVersion?: string;
  error?: string;
}> {
  const endpoint = `${getMlServiceUrl()}/health`;
  try {
    const response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = (await response.json()) as {
      success?: boolean;
      model_version?: string;
      error?: string;
    };
    if (!response.ok || !payload.success) {
      return { ok: false, error: payload.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, modelVersion: payload.model_version };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Koneksi gagal";
    return { ok: false, error: message };
  }
}
