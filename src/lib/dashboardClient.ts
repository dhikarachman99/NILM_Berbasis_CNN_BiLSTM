import type { LatestBlynkResponse } from "@/types/nilm";
import { getMlDashboardEndpoint, getMlServiceUrl } from "@/lib/mlServiceConfig";

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
  let payload: LatestBlynkResponse & { meta?: unknown };

  try {
    payload = JSON.parse(rawText) as LatestBlynkResponse & { meta?: unknown };
  } catch {
    if (response.status === 404) {
      throw new Error(
        `Endpoint /dashboard/latest tidak ada (404) di ${getMlServiceUrl()}. Pastikan HF Space sudah build dan URL benar.`,
      );
    }
    throw new Error("ML service mengembalikan response yang bukan JSON valid.");
  }

  if (response.status === 404) {
    throw new Error(
      `Endpoint /dashboard/latest tidak ada (404) di ${getMlServiceUrl()}. Pastikan HF Space sudah build dan URL benar.`,
    );
  }

  if (!response.ok || !payload.success || !payload.data) {
    return {
      success: false,
      data: null,
      source: payload.source ?? "thingsboard",
      last_updated: new Date().toISOString(),
      error: payload.error ?? `ML service error (${response.status})`,
    };
  }

  return {
    success: true,
    data: payload.data,
    source: payload.source ?? "thingsboard",
    last_updated: payload.last_updated ?? payload.data.timestamp,
    error: payload.error,
  };
}
