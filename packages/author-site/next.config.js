const fs = require("fs");
const path = require("path");

// 加载 monorepo 根目录 .env，使 INTERNAL_API_TOKEN 等变量对 Next.js 可用
const rootEnvPath = path.resolve(__dirname, "../../.env");
const turbopackRelativeTsImportLoader = path.resolve(
  __dirname,
  "../../scripts/turbopack-rewrite-relative-ts-imports.cjs",
);
const turbopackRawTextLoader = path.resolve(
  __dirname,
  "../../scripts/turbopack-raw-text-loader.cjs",
);
if (fs.existsSync(rootEnvPath)) {
  const envContent = fs.readFileSync(rootEnvPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value =
      rawValue.startsWith('"') && rawValue.endsWith('"')
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
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  // 仅影响 next dev：在首页、截图接口与编辑页间切换时保留已编译路由，
  // 避免默认的短暂缓冲窗口导致重复编译。
  onDemandEntries: {
    maxInactiveAge: 5 * 60 * 1000,
    pagesBufferLength: 12,
  },
  env: {
    NEXT_PUBLIC_PREVIEW_CDN_BASE_URL:
      process.env.CDN_BASE_URL || "https://esm.sh",
    NEXT_PUBLIC_PREVIEW_RUNTIME_SOURCE:
      process.env.PREVIEW_RUNTIME_SOURCE || "local",
    NEXT_PUBLIC_PREVIEW_SHELL_MODE: process.env.PREVIEW_SHELL_MODE || "fixed",
    // 本地开发和生产均默认启用编辑页的 Puppeteer 自动截图；
    // 可由显式环境变量覆盖，供专项诊断使用。
    NEXT_PUBLIC_AUTOMATIC_SCREENSHOT_GENERATION:
      process.env.NEXT_PUBLIC_AUTOMATIC_SCREENSHOT_GENERATION ||
      "true",
  },
  transpilePackages: [
    "@workbench/agent-client",
    "@workbench/ai-chat-shared",
    "@workbench/demo-ui",
    "@workbench/knowledge-core",
    "@workbench/knowledge-service",
    "@workbench/project-core",
    "@workbench/project-scaffold",
    "@workbench/preview-contract",
    "@workbench/sketch-core",
    "@workbench/sketch-react",
    "@workbench/shared",
    "shiki",
  ],
  serverExternalPackages: [
    "langium",
    "@mermaid-js/parser",
    "better-sqlite3",
    "typescript",
  ],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    rules: {
      "*.md": {
        loaders: [turbopackRawTextLoader],
        as: "*.js",
      },
      "*.ts": {
        condition: {
          path: /^packages\/(?:knowledge-core|knowledge-service|preview-contract|project-cli|project-core|project-scaffold)\/src\//,
        },
        loaders: [turbopackRelativeTsImportLoader],
      },
      "*.tsx": {
        condition: {
          path: /^packages\/(?:knowledge-core|knowledge-service|preview-contract|project-cli|project-core|project-scaffold)\/src\//,
        },
        loaders: [turbopackRelativeTsImportLoader],
      },
    },
  },
  webpack: (config, { isServer }) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "vscode-jsonrpc": false,
        langium: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
