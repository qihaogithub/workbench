/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_PREVIEW_CDN_BASE_URL:
      process.env.CDN_BASE_URL || "https://esm.sh",
    NEXT_PUBLIC_PREVIEW_RUNTIME_SOURCE:
      process.env.PREVIEW_RUNTIME_SOURCE || "local",
    NEXT_PUBLIC_PREVIEW_SHELL_MODE:
      process.env.PREVIEW_SHELL_MODE ||
      (process.env.NODE_ENV === "production" ? "inline" : "fixed"),
  },
  transpilePackages: [
    "@workbench/demo-ui",
    "@workbench/sketch-core",
    "@workbench/sketch-react",
    "@workbench/shared",
  ],
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
