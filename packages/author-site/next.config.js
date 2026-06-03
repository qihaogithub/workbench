/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@opencode-workbench/shared", "@opencode-workbench/agent-client", "shiki"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    instrumentationHook: true,
    serverComponentsExternalPackages: ['langium', '@mermaid-js/parser', 'better-sqlite3', 'bcrypt'],
  },
  webpack: (config, { isServer }) => {
    // 让 .md 文件可以 import 为纯文本字符串
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
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
