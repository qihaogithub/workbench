/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  transpilePackages: ["@opencode-workbench/shared"],
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
