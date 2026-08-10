#!/usr/bin/env node
/**
 * export.mjs — 页面导出编排器
 *
 * 步骤：
 *   1. 路由发现（自动或显式 --routes）
 *   2. 登录 author-site 获取 JWT → 生成 --browser-cookie
 *   3. 用 single-file-cli 渲染每页为自包含 HTML（--dump-content）
 *   4. normalize.mjs 转换（样式分离/净化/锚点/图片/manifest）
 *   5. ow project import-prototype --dry-run 校验（可选实际导入）
 *
 * 用法：
 *   node bin/export.mjs \
 *     --root packages/author-site \
 *     --base-url http://localhost:4200 \
 *     --app-dir packages/author-site/src/app \
 *     --username <user> --password <pass> \
 *     --output out \
 *     --import-name "创作端页面导出" \
 *     [--dynamic-sample id:xxx]
 *
 * 可选：
 *   --no-login         跳过登录（公开页面）
 *   --dry-run          只校验不导入
 *   --routes routeKey:file,...  显式提供路由（跳过自动发现）
 *   --no-commit        导入但不提交（保留 edit 事务）
 *   --manifest-only    只做 normalize 生成 manifest，不调用 import
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SINGLE_FILE_BIN = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "node_modules",
  "single-file-cli",
  "single-file",
);

const CHROME_BIN =
  process.env.CHROME_BIN ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "auth_token";

function parseArgs(argv) {
  const args = { routes: [], "dynamic-sample": [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args.positionals ??= [];
      args.positionals.push(token);
      continue;
    }
    const [key, inlineValue] = token.slice(2).split("=");
    if (key === "routes") {
      for (const pair of (inlineValue ?? argv[i + 1]).split(",").filter(Boolean)) {
        args.routes.push(pair);
      }
      if (inlineValue === undefined && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;
    } else if (key === "dynamic-sample") {
      args["dynamic-sample"].push(inlineValue ?? argv[i + 1]);
      if (inlineValue === undefined && argv[i + 1] && !argv[i + 1].startsWith("--")) i += 1;
    } else {
      const value =
        inlineValue !== undefined
          ? inlineValue
          : argv[i + 1] && !argv[i + 1].startsWith("--")
            ? argv[++i]
            : "true";
      args[key] = value;
    }
  }
  return args;
}

async function login(baseUrl, username, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, includeToken: true }),
  });
  const body = await res.json();
  if (!res.ok || !body?.success || !body?.data?.token) {
    throw new Error(`登录失败: ${JSON.stringify(body)}`);
  }
  return body.data.token;
}

function runSingleFile(url, outputFile, cookie) {
  const args = [
    url,
    "--dump-content",
    "--browser-executable-path", CHROME_BIN,
    "--browser-headless=true",
    "--browser-width=1280",
    "--browser-height=900",
    "--browser-wait-until=networkIdle",
    "--browser-wait-until-delay=1500",
    "--compress-html=false",
    "--remove-hidden-elements=true",
    "--remove-unused-styles=true",
    "--remove-unused-fonts=true",
    "--group-duplicate-images=false",
    "--insert-meta-csp=false",
    "--insert-single-file-comment=false",
    "--remove-saved-date=true",
    "--filename-replacement-character=_",
  ];
  if (cookie) {
    args.push("--browser-cookies-file", cookie);
  }
  const run = spawnSync("node", [SINGLE_FILE_BIN, ...args], {
    encoding: "utf-8",
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) {
    throw new Error(`single-file 渲染失败 ${url}: ${run.stderr?.slice(0, 2000)}`);
  }
  fs.writeFileSync(outputFile, run.stdout, "utf-8");
  return run.stdout.length;
}

function discoverRoutes(appDir, baseUrl, dynamicSamples) {
  const args = [
    path.join(__dirname, "discover-routes.mjs"),
    "--root", appDir,
    "--base-url", baseUrl,
  ];
  for (const s of dynamicSamples) args.push("--dynamic-sample", s);
  const run = spawnSync("node", args, { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`路由发现失败: ${run.stderr}`);
  return JSON.parse(run.stdout).routes;
}

function runNormalize(htmlDir, outputDir, routes, noConfig) {
  const args = [
    path.join(__dirname, "normalize.mjs"),
    "--html-dir", htmlDir,
    "--output", outputDir,
    "--routes", routes.map((r) => `${r.routeKey}:${r.file}`).join(","),
  ];
  if (noConfig) args.push("--no-config=true");
  const run = spawnSync("node", args, { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
  if (run.status !== 0) throw new Error(`normalize 失败: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

function runImport(dir, opts) {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const owBin = path.join(repoRoot, "packages", "project-cli", "bin", "ow.mjs");
  const dataDir = opts.dataDir || path.join(repoRoot, "data");
  const args = [
    owBin,
    "project", "import-prototype",
    "--source", dir,
    "--manifest", "@./manifest.json",
    "--assets", "images:assets/images",
    "--data-dir", dataDir,
    "--json",
  ];
  if (opts.name) args.push("--name", opts.name);
  if (opts.dryRun) args.push("--dry-run");
  if (opts.commit) args.push("--commit");
  const run = spawnSync("node", args, {
    encoding: "utf-8",
    cwd: dir,
    maxBuffer: 64 * 1024 * 1024,
  });
  let parsed;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    parsed = { ok: false, error: { message: run.stdout?.slice(0, 2000) || run.stderr?.slice(0, 2000) } };
  }
  return { parsed, status: run.status };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = (args["base-url"] || "http://localhost:4200").replace(/\/+$/, "");
  const outputDir = path.resolve(args.output || "out");
  const htmlDir = path.join(outputDir, "raw");
  const normDir = path.join(outputDir, "normalized");

  fs.mkdirSync(htmlDir, { recursive: true });

  // 1. 路由
  let routes;
  if (args.routes.length > 0) {
    routes = args.routes.map((pair) => {
      const [routeKey, file] = pair.split(":");
      return { routeKey, file: file ?? routeKey, url: routeKey === "/" || !routeKey ? baseUrl : `${baseUrl}/${routeKey}` };
    });
    console.error(`[routes] 显式路由 ${routes.length} 个`);
  } else {
    const appDir = path.resolve(args["app-dir"] || args.root);
    routes = discoverRoutes(appDir, baseUrl, args["dynamic-sample"]);
    if (routes.length === 0) throw new Error("未发现任何路由");
    console.error(`[routes] 自动发现 ${routes.length} 个`);
  }

  // 2. 登录
  let cookieFile;
  if (args["no-login"] !== "true") {
    const token = await login(baseUrl, args.username, args.password);
    cookieFile = path.join(outputDir, "cookies.json");
    fs.writeFileSync(
      cookieFile,
      JSON.stringify([
        {
          name: AUTH_COOKIE_NAME,
          value: token,
          path: "/",
          url: baseUrl,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]),
      "utf-8",
    );
    console.error(`[auth] 已登录 ${args.username}，cookie -> ${cookieFile}`);
  }

  // 3. 渲染
  for (const route of routes) {
    const outFile = path.join(htmlDir, `${route.file}.html`);
    try {
      const bytes = runSingleFile(route.url, outFile, cookieFile);
      console.error(`[render] ${route.routeKey} -> ${bytes} bytes`);
    } catch (error) {
      console.error(`[render] 失败 ${route.routeKey}: ${error.message}`);
    }
  }

  // 4. normalize
  const normalized = runNormalize(htmlDir, normDir, routes, args["no-config"] === "true");
  console.error(`[normalize] ${normalized.pages.length} 页，warnings=${normalized.warnings.length}`);

  // 5. manifest-only 提前返回
  if (args["manifest-only"] === "true") {
    console.error(`[done] manifest 已生成于 ${normDir}/manifest.json`);
    return;
  }

  // 6. import
  const importName = args["import-name"] || "页面导出";
  const dryOnly = args["dry-run"] === "true";
  let result = runImport(normDir, { name: importName, dryRun: true, commit: false });
  console.error(`[import] dry-run: ${result.parsed.ok === true ? "OK" : "失败"}`);
  if (!dryOnly && result.parsed.ok === true) {
    result = runImport(normDir, { name: importName, dryRun: false, commit: args["no-commit"] !== "true" });
    console.error(`[import] 提交: ${result.parsed.ok === true ? "OK" : "失败"}`);
  }
  process.stdout.write(JSON.stringify({ ...result.parsed, normalized }, null, 2) + "\n");
}

main().catch((error) => {
  console.error(`[export] 失败: ${error.message}`);
  process.exit(1);
});