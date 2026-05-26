import metaJson from "@/nilm_models_v9/meta_nilm.json";

export type NilmMeta = typeof metaJson;

export const NILM_META: NilmMeta = metaJson;

export function getNilmDevices(): string[] {
  return Array.isArray(NILM_META.devices)
    ? NILM_META.devices.filter((device): device is string => typeof device === "string" && device.trim().length > 0)
    : [];
}

export function getSessionToLabel(): Record<string, string> {
  const sessionToLabel = NILM_META.session_to_label;
  if (!sessionToLabel || typeof sessionToLabel !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(sessionToLabel).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function getDeviceDisplayMap(): Record<string, string> {
  const deviceDisplay = (NILM_META as NilmMeta & { device_display?: Record<string, string> }).device_display;
  if (!deviceDisplay || typeof deviceDisplay !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(deviceDisplay).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export function labelToDeviceKey(label: string, devices = getNilmDevices()): string[] {
  const normalized = label.trim();
  if (!normalized || normalized === "idle") {
    return [];
  }

  if (normalized === "full_load") {
    return [...devices];
  }

  const deviceSet = new Set(devices);
  const parts = normalized
    .split("+")
    .map((part) => part.trim())
    .filter((part) => deviceSet.has(part));

  return devices.filter((device) => parts.includes(device));
}

export function joinActiveDevices(active: string[], devices = getNilmDevices()): string {
  const activeSet = new Set(active);
  const ordered = devices.filter((device) => activeSet.has(device));
  return ordered.length > 0 ? ordered.join("+") : "idle";
}

export function buildSessionLabelLookup(devices = getNilmDevices()): Map<string, string> {
  const lookup = new Map<string, string>();
  lookup.set("", "idle");

  for (const label of Object.values(getSessionToLabel())) {
    const orderedDevices = labelToDeviceKey(label, devices);
    const canonicalKey = orderedDevices.length > 0 ? joinActiveDevices(orderedDevices, devices) : "";
    if (!lookup.has(canonicalKey)) {
      lookup.set(canonicalKey, label);
    }
  }

  return lookup;
}

export function resolveLabelFromActiveDevices(active: string[], devices = getNilmDevices()): string {
  const lookup = buildSessionLabelLookup(devices);
  const canonicalKey = joinActiveDevices(active, devices);
  const lookupKey = canonicalKey === "idle" ? "" : canonicalKey;

  return lookup.get(lookupKey) ?? canonicalKey;
}

function normalizeDeviceName(device: string) {
  return device
    .replaceAll("_", " ")
    .replaceAll("+", " + ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (token.toLowerCase() === "hp") {
        return "HP";
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}

export function formatDeviceLabel(device: string): string {
  const trimmed = device.trim();
  if (!trimmed) {
    return "Unknown";
  }

  const displayMap = getDeviceDisplayMap();
  if (displayMap[trimmed]) {
    return displayMap[trimmed];
  }

  if (trimmed.includes("+")) {
    return trimmed
      .split("+")
      .map((part) => formatDeviceLabel(part.trim()))
      .join(" + ");
  }

  if (displayMap[trimmed.replaceAll(" ", "_")]) {
    return displayMap[trimmed.replaceAll(" ", "_")];
  }

  return normalizeDeviceName(trimmed);
}

export function formatActiveDevices(activeDevices: string[]): string {
  if (activeDevices.length === 0) {
    return formatDeviceLabel("idle");
  }

  return resolveLabelFromActiveDevices(activeDevices);
}

export function getNoiseFloorW(): number {
  const value = (NILM_META as NilmMeta & { noise_floor_w?: number }).noise_floor_w;
  return typeof value === "number" && value >= 0 ? value : 3.0;
}

/** Heuristik saat ML service down: daya di bawah noise floor = idle (sesuai meta_nilm.json). */
export function heuristicLabelFromPower(powerW: number): { label: string; confidence: number } | null {
  const noiseFloor = getNoiseFloorW();
  if (!Number.isFinite(powerW) || powerW >= noiseFloor) {
    return null;
  }

  const ratio = Math.max(0, Math.min(1, 1 - powerW / noiseFloor));
  return {
    label: "idle",
    confidence: Math.round(85 + ratio * 14),
  };
}
