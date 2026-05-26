import { BrainCircuit, TriangleAlert } from "lucide-react";

import { formatActiveDevices, formatDeviceLabel } from "@/lib/nilmMeta";
import {
  cn,
  formatNumber,
  getConfidenceLabel,
  getConfidenceTone,
} from "@/lib/utils";
import type { DeviceProbability } from "@/types/nilm";

interface DeviceDetectionPanelProps {
  device: string;
  confidence: number;
  modelVersion: string;
  activeDevices?: string[];
  deviceProbs?: DeviceProbability[];
  bufferStatus?: string;
}

const toneStyles = {
  blue: {
    bar: "bg-blue-600",
    badge: "bg-blue-50 text-blue-700",
  },
  orange: {
    bar: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700",
  },
  "soft-orange": {
    bar: "bg-orange-300",
    badge: "bg-orange-100 text-orange-800",
  },
};

export function DeviceDetectionPanel({
  device,
  confidence,
  modelVersion,
  activeDevices = [],
  deviceProbs = [],
  bufferStatus,
}: DeviceDetectionPanelProps) {
  const tone = getConfidenceTone(confidence) as keyof typeof toneStyles;
  const confidenceLabel = getConfidenceLabel(confidence);
  const isWarmingUp =
    bufferStatus === "WARMING" ||
    (bufferStatus === "LOADING" && confidence < 55);
  const labelDevices =
    device.includes("+")
      ? device.split("+").map((part) => part.trim()).filter(Boolean)
      : device && device !== "idle"
        ? [device]
        : [];

  const displayDevices =
    activeDevices.length > 0
      ? activeDevices
      : labelDevices.length > 0
        ? labelDevices
        : [];

  return (
    <div className="rounded-3xl border border-blue-100/80 bg-white/95 p-4 shadow-sm shadow-blue-100/70 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Device Detection Panel</h2>
          <p className="text-sm text-slate-500">
            Prediksi multi-label model v9 — beberapa perangkat dapat aktif bersamaan.
          </p>
        </div>
        <div className="rounded-2xl bg-orange-50 p-3 text-orange-600 ring-1 ring-orange-100">
          <BrainCircuit className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-blue-50 bg-gradient-to-r from-blue-50 to-orange-50 p-4">
        <p className="text-sm font-medium text-slate-600">Detected Combination</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">
          {displayDevices.length > 0 ? formatActiveDevices(displayDevices) : formatDeviceLabel(device)}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {isWarmingUp
            ? "Buffer inferensi sedang terisi, prediksi akan makin stabil."
            : `Model: ${modelVersion}${bufferStatus && bufferStatus !== "READY" ? ` · buffer ${bufferStatus.toLowerCase()}` : ""}`}
        </p>
        {displayDevices.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {displayDevices.map((activeDevice) => (
              <span
                key={activeDevice}
                className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100"
              >
                {formatDeviceLabel(activeDevice)}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {deviceProbs.length > 0 ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium text-slate-600">Probabilitas per perangkat</p>
          {deviceProbs.map((entry) => {
            const active = displayDevices.includes(entry.device);
            return (
              <div key={entry.device}>
                <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                  <span className={cn("font-medium", active ? "text-slate-900" : "text-slate-500")}>
                    {formatDeviceLabel(entry.device)}
                  </span>
                  <span className="font-semibold text-slate-900">{formatNumber(entry.probability, 1)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full rounded-full transition-all", active ? "bg-blue-600" : "bg-slate-300")}
                    style={{ width: `${Math.min(entry.probability, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-600">Confidence</p>
          <p className="text-sm font-semibold text-slate-900">{formatNumber(confidence, 1)}%</p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-orange-100/60">
          <div
            className={cn("h-full rounded-full transition-all", toneStyles[tone].bar)}
            style={{ width: `${Math.min(confidence, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", toneStyles[tone].badge)}>
          {confidenceLabel}
        </span>
        {!isWarmingUp && confidence < 60 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">
            <TriangleAlert className="h-3.5 w-3.5" />
            Confidence rendah, verifikasi hasil model.
          </span>
        ) : null}
      </div>
    </div>
  );
}