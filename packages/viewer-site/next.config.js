/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@opencode-workbench/shared"],
};

module.exports = nextConfig;
