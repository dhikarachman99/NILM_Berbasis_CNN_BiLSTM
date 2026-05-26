import { NextResponse } from "next/server";

import {
  buildSessionLabelLookup,
  getDeviceDisplayMap,
  getNilmDevices,
  getSessionToLabel,
  NILM_META,
} from "@/lib/nilmMeta";

export const dynamic = "force-dynamic";

export async function GET() {
  const devices = getNilmDevices();
  const sessionToLabel = getSessionToLabel();
  const deviceDisplay = getDeviceDisplayMap();
  const sessionLookup = Object.fromEntries(buildSessionLabelLookup(devices));

  return NextResponse.json({
    success: true,
    model_version: NILM_META.model_version ?? "unknown",
    devices,
    session_to_label: sessionToLabel,
    device_display: deviceDisplay,
    session_lookup: sessionLookup,
    threshold: NILM_META.threshold ?? 0.5,
  });
}
