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
};

export default nextConfig;
