import type { LatestBlynkResponse } from "@/types/nilm";

function getMlServiceUrl(): string {
  const url = process.env.NEXT_PUBLIC_ML_SERVICE_URL?.trim();
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_ML_SERVICE_URL belum diatur. Set saat build GitHub Actions atau di .env.local untuk dev.",
    );
  }
  return url.replace(/\/$/, "");
}

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

  const endpoint = `${getMlServiceUrl()}/dashboard/latest`;
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  const rawText = await response.text();
  let payload: LatestBlynkResponse & { meta?: unknown };

  try {
    payload = JSON.parse(rawText) as LatestBlynkResponse & { meta?: unknown };
  } catch {
    throw new Error("ML service mengembalikan response yang bukan JSON valid.");
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
