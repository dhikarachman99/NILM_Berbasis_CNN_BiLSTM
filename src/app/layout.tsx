import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NILM Energy Monitoring Dashboard",
  description: "Real-Time Smart Energy Monitoring using Deep Learning",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id">
      <body className="overflow-x-hidden antialiased">{children}</body>
    </html>
  );
}
