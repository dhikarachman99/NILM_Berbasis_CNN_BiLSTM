import { Clock3, Menu, Router } from "lucide-react";

import { cn, formatTimestamp } from "@/lib/utils";

interface HeaderProps {
  statusLabel: string;
  lastUpdated?: string;
  modelVersion?: string;
  onOpenMenu: () => void;
  isStale: boolean;
}

export function Header({ statusLabel, lastUpdated, modelVersion, onOpenMenu, isStale }: HeaderProps) {
  const isOnline = statusLabel.toLowerCase().includes("online");

  return (
    <header className="sticky top-0 z-30 border-b border-blue-100/80 bg-white/95 backdrop-blur-md">
      <div className="px-4 py-3 sm:px-6 sm:py-4 xl:px-8">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 shrink-0 rounded-2xl border border-blue-100 bg-white p-2 text-blue-700 shadow-sm shadow-blue-100/60 lg:hidden"
            onClick={onOpenMenu}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-blue-700 sm:block">
              NILM Energy Monitoring Dashboard
            </p>
            <h2 className="mt-0 text-base font-semibold leading-snug text-slate-900 sm:mt-1 sm:text-xl lg:text-2xl">
              <span className="sm:hidden">NILM Energy Monitor</span>
              <span className="hidden sm:inline">
                Real-Time Smart Energy Monitoring using Deep Learning
              </span>
            </h2>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {modelVersion ? (
            <span className="inline-flex max-w-full items-center truncate rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-100 sm:px-3 sm:text-xs">
              Model: {modelVersion}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:px-3 sm:text-xs",
              isOnline && !isStale
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                : "bg-orange-50 text-orange-700 ring-1 ring-orange-100",
            )}
          >
            <Router className="h-3.5 w-3.5 shrink-0" />
            {statusLabel}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 sm:text-sm">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Updated: {formatTimestamp(lastUpdated)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
