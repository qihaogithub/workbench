import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ["@opencode-workbench/shared", "shiki"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    instrumentationHook: true,
  },
  serverExternalPackages: ['langium', '@mermaid-js/parser'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'vscode-jsonrpc': false,
        'langium': false,
      };
    }
    return config;
  },
}

export default nextConfig
