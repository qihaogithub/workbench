/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.NODE_ENV === "production" ? "export" : undefined,
  trailingSlash: true,
  transpilePackages: ["@opencode-workbench/shared", "@opencode-workbench/demo-ui"],
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
