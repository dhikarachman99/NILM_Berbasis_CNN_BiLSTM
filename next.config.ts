import type { NextConfig } from "next";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const basePath =
  process.env.NEXT_PUBLIC_BASE_PATH?.trim() ||
  (process.env.GITHUB_ACTIONS === "true" && repoName ? `/${repoName}` : "") ||
  "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  env: {
    NEXT_PUBLIC_ML_SERVICE_URL:
      process.env.NEXT_PUBLIC_ML_SERVICE_URL ||
      process.env.ML_SERVICE_URL ||
      "http://127.0.0.1:5001",
    NEXT_PUBLIC_USE_DUMMY_BLYNK:
      process.env.NEXT_PUBLIC_USE_DUMMY_BLYNK || process.env.USE_DUMMY_BLYNK || "false",
  },
};

export default nextConfig;
