import { Cpu } from "lucide-react";

import { formatDeviceLabel, getNilmDevices, NILM_META } from "@/lib/nilmMeta";
import { formatNumber } from "@/lib/utils";

interface ModelV9PanelProps {
  runtimeVersion?: string;
}

export function ModelV9Panel({ runtimeVersion }: ModelV9PanelProps) {
  const devices = getNilmDevices();
  const activeVersion = runtimeVersion?.trim() || NILM_META.model_version || "v9_multilabel";

  return (
    <div className="rounded-3xl border border-blue-100/80 bg-white/95 p-6 shadow-sm shadow-blue-100/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Model NILM v9</h3>
          <p className="mt-1 text-sm text-slate-500">
            Terintegrasi dari <code className="rounded bg-blue-50 px-1.5 py-0.5 text-xs">src/nilm_models_v9/</code>
          </p>
        </div>
        <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 ring-1 ring-violet-100">
          <Cpu className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Versi aktif</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{activeVersion}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Window / fitur</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {NILM_META.window_size} × {NILM_META.n_features}
          </p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Threshold</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{NILM_META.threshold ?? 0.5}</p>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Macro F1 (val)</p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {typeof NILM_META.macro_f1 === "number" ? formatNumber(NILM_META.macro_f1 * 100, 1) : "—"}%
          </p>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-sm font-medium text-slate-600">Perangkat yang dideteksi (multi-label)</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {devices.map((device) => (
            <span
              key={device}
              className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800 ring-1 ring-orange-100"
            >
              {formatDeviceLabel(device)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}