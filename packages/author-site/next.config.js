const fs = require("fs");
const path = require("path");

// 加载 monorepo 根目录 .env，使 INTERNAL_API_TOKEN 等变量对 Next.js 可用
const rootEnvPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value = rawValue.startsWith('"') && rawValue.endsWith('"')
      ? rawValue.slice(1, -1)
      : rawValue.startsWith("'") && rawValue.endsWith("'")
        ? rawValue.slice(1, -1)
        : rawValue;
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@opencode-workbench/shared", "@opencode-workbench/demo-ui", "@opencode-workbench/project-core", "@opencode-workbench/agent-client", "shiki"],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    instrumentationHook: true,
    serverComponentsExternalPackages: ['langium', '@mermaid-js/parser', 'better-sqlite3', 'bcrypt'],
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
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
