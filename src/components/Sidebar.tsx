"use client";

import { useEffect } from "react";
import {
  Activity,
  BarChart3,
  Cpu,
  LayoutDashboard,
  Settings,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavigationSection } from "@/types/nilm";

interface SidebarProps {
  activeSection: NavigationSection;
  onChange: (section: NavigationSection) => void;
  mobileOpen: boolean;
  onClose: () => void;
}

const navItems: Array<{ key: NavigationSection; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "device-detection", label: "Device Detection", icon: Cpu },
  { key: "energy-analytics", label: "Energy Analytics", icon: BarChart3 },
  { key: "system-status", label: "System Status", icon: Activity },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ activeSection, onChange, mobileOpen, onClose }: SidebarProps) {
  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[min(18rem,88vw)] flex-col overflow-y-auto border-r border-blue-100 bg-white px-4 py-5 shadow-2xl transition-transform duration-300 ease-out sm:px-5 sm:py-6 lg:z-40 lg:w-72 lg:translate-x-0 lg:bg-gradient-to-b lg:from-white lg:via-blue-50/40 lg:to-orange-50/40 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0 pr-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">NILM Dashboard</p>
            <h1 className="mt-2 text-lg font-semibold text-slate-900 sm:text-xl">Energy Monitoring</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Monitoring energi dan inferensi NILM.
            </p>
          </div>
          <button
            type="button"
            className="rounded-2xl border border-blue-100 bg-white p-2 text-blue-700 lg:hidden"
            onClick={onClose}
            aria-label="Tutup menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-6 shrink-0 space-y-2 sm:mt-8">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition",
                activeSection === key
                  ? "bg-gradient-to-r from-blue-600 to-orange-500 text-white shadow-lg shadow-blue-200/60"
                  : "text-slate-700 hover:bg-white hover:text-blue-700 hover:shadow-sm hover:shadow-blue-100/60",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-6 shrink-0 rounded-3xl border border-orange-100 bg-orange-50 p-4 sm:mt-8">
          <p className="text-sm font-semibold text-orange-800">ThingsBoard Telemetry</p>
          <p className="mt-2 text-sm leading-6 text-orange-700">
            Backend membaca telemetry sensor lalu meneruskan sample ke model NILM untuk menghasilkan label perangkat.
          </p>
        </div>
      </aside>
    </>
  );
}
