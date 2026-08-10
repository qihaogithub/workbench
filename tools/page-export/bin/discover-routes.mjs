#!/usr/bin/env node
/**
 * discover-routes.mjs — 页面路由自动发现
 *
 * 扫描 Next.js App Router 的 app 目录（page.tsx）或 Pages Router 的 pages 目录生成路由清单。
 *
 * 用法：
 *   node bin/discover-routes.mjs --root <app 目录> [--base-url http://localhost:4200]
 *
 * 输出 JSON：
 *   { routes: [{ routeKey, path, file, url }] }
 *
 * 动态段 [id] 默认保留为占位符路径，可通过 --dynamic-sample 提供真实样例值
 * （如 --dynamic-sample 'id:sample-project'）用于渲染。
 */
import fs from "node:fs";
import path from "node:path";

function toRouteKey(relativeDir) {
  // app/(group)/page.tsx -> "" ; app/demo/[id]/edit/page.tsx -> "demo/[id]/edit"
  return relativeDir.replace(/^\([^)]*\)\//, "").replace(/\/$/, "");
}

function discoverAppRouter(appDir) {
  const routes = [];
  const walk = (dir, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const entryRel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith("_")) continue; // private folder
        walk(entryPath, entryRel);
      } else if (entry.name === "page.tsx" || entry.name === "page.tsx" || entry.name === "page.js") {
        const dirRel = path.dirname(entryRel);
        const routeKey = toRouteKey(dirRel);
        routes.push({ routeKey, file: routeKey || "index" });
      }
    }
  };
  walk(appDir, "");
  return routes;
}

function discoverPagesRouter(pagesDir) {
  const routes = [];
  const walk = (dir, relative) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      const entryRel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(entryPath, entryRel);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.startsWith("_") && !entry.name.startsWith(".")) {
        const base = entry.name.replace(/\.(tsx?|jsx?)$/, "");
        if (base === "index") {
          routes.push({ routeKey: relative || "", file: relative || "index" });
        } else {
          const routeKey = relative ? `${relative}/${base}` : base;
          routes.push({ routeKey, file: routeKey });
        }
      }
    }
  };
  walk(pagesDir, "");
  return routes;
}

function applyDynamicSamples(routeKey, samples) {
  return routeKey.replace(/\[([^\]]+)\]/g, (_, name) => samples[name] ?? `__${name}__`);
}

function main() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const [key, val] = argv[i].replace(/^--/, "").split("=");
    const value = val !== undefined ? val : argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    if (key === "dynamic-sample") {
      args[key] ??= [];
      args[key].push(value);
    } else {
      args[key] = value;
    }
  }
  const root = path.resolve(args.root || process.cwd());
  const baseUrl = (args["base-url"] || "http://localhost:4200").replace(/\/+$/, "");
  const samples = {};
  for (const pair of args["dynamic-sample"] ?? []) {
    const [name, value] = pair.split(":");
    if (name) samples[name] = value;
  }

  let routes;
  const appDir = fs.existsSync(path.join(root, "app"))
    ? path.join(root, "app")
    : fs.existsSync(path.join(root, "page.tsx")) || fs.existsSync(path.join(root, "page.js"))
      ? root
      : null;
  const pagesDir = fs.existsSync(path.join(root, "pages")) ? path.join(root, "pages") : null;
  if (appDir) {
    routes = discoverAppRouter(appDir);
  } else if (pagesDir) {
    routes = discoverPagesRouter(pagesDir);
  } else {
    console.error(`找不到 app/ 或 pages/ 目录: ${root}`);
    process.exit(1);
  }

  const enriched = routes.map((route) => {
    const routeKey = route.routeKey;
    const renderedPath = applyDynamicSamples(routeKey, samples);
    const cleanPath = renderedPath.replace(/__[^_]+__/g, "").replace(/\/+/g, "/");
    const url = routeKey === "" ? baseUrl : `${baseUrl}/${cleanPath}`;
    return { routeKey, path: cleanPath, file: cleanPath || "index", url };
  });

  const result = { root, baseUrl, dynamicSamples: samples, routes: enriched };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main();