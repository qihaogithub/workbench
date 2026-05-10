/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@opencode-workbench/shared", "@opencode-workbench/agent-client", "shiki"],
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
};

module.exports = nextConfig;
