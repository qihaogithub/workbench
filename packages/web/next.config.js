/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@opencode-workbench/shared"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
