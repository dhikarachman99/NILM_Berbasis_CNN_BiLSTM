import type { LatestBlynkResponse } from "@/types/nilm";

function getMlServiceUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_ML_SERVICE_URL?.trim() ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:5001" : "");

  if (!url) {
    throw new Error(
      "ML service URL belum diatur. Local: ML_SERVICE_URL=http://127.0.0.1:5001 di .env",
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
  let response: Response;
  try {
    response = await fetch(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error(
      `Tidak bisa terhubung ke ML service (${endpoint}). Pastikan server jalan: cd ml_service && python app.py`,
    );
  }

  const rawText = await response.text();
  let payload: LatestBlynkResponse & { meta?: unknown };

  try {
    payload = JSON.parse(rawText) as LatestBlynkResponse & { meta?: unknown };
  } catch {
    if (response.status === 404) {
      throw new Error(
        "Endpoint /dashboard/latest tidak ada (404). Restart ML service: hentikan proses lama di port 5001, lalu jalankan ulang `cd ml_service && python app.py`.",
      );
    }
    throw new Error("ML service mengembalikan response yang bukan JSON valid.");
  }

  if (response.status === 404) {
    throw new Error(
      "Endpoint /dashboard/latest tidak ada (404). Restart ML service: hentikan proses lama di port 5001, lalu jalankan ulang `cd ml_service && python app.py`.",
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
