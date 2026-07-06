export const LOCAL_PREVIEW_DEV_SERVER_SCRIPT = String.raw`import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import url from "node:url";

const root = process.cwd();
const manifestPath = path.join(root, "workbench.project.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function schemaDefaults(schemaText) {
  if (!schemaText || !schemaText.trim()) return {};
  try {
    const schema = JSON.parse(schemaText);
    const defaults = {};
    for (const [key, value] of Object.entries(schema.properties || {})) {
      if (value && typeof value === "object" && "default" in value) defaults[key] = value.default;
    }
    return defaults;
  } catch {
    return {};
  }
}

function pageRuntimeType(page) {
  if (page.runtimeType === "prototype-html-css") return "prototype-html-css";
  if (page.runtimeType === "sketch-scene") return "sketch-scene";
  return "high-fidelity-react";
}

function loadProject() {
  const manifest = readJson(manifestPath);
  const projectSchema = manifest.projectConfig ? readTextIfExists(path.join(root, manifest.projectConfig)) : "";
  const projectDefaults = schemaDefaults(projectSchema);
  const pages = manifest.pages.map((page) => {
    const schema = readTextIfExists(path.join(root, page.schema));
    return {
      ...page,
      runtimeType: pageRuntimeType(page),
      code: readTextIfExists(path.join(root, page.entry)),
      schema,
      prototypeHtml: page.prototypeHtml ? readTextIfExists(path.join(root, page.prototypeHtml)) : "",
      prototypeCss: page.prototypeCss ? readTextIfExists(path.join(root, page.prototypeCss)) : "",
      prototypeMeta: page.prototypeMeta ? readJsonIfExists(path.join(root, page.prototypeMeta)) : undefined,
      sketchScene: page.sketchScene ? readTextIfExists(path.join(root, page.sketchScene)) : "",
      sketchMeta: page.sketchMeta ? readJsonIfExists(path.join(root, page.sketchMeta)) : undefined,
      configData: { ...projectDefaults, ...schemaDefaults(schema) },
    };
  });
  return {
    manifest,
    projectSchema,
    appGraph: manifest.appGraph ? readJsonIfExists(path.join(root, manifest.appGraph)) : null,
    pages,
  };
}

function applyTextBindings(html, configData) {
  return html.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_match, key) => {
    const value = configData[key];
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  });
}

function sanitizePrototypeHtml(html) {
  return html
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "");
}

function sanitizePrototypeCss(css) {
  return css
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/@import\b|expression\s*\(|behavior\s*:/gi, "");
}

function rewriteAssetUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return value;
  if (/^(data:|https?:|blob:|#|mailto:|tel:)/i.test(trimmed)) return value;
  if (trimmed.startsWith("/assets/")) return trimmed;
  if (trimmed.startsWith("/src/assets/")) return trimmed.replace(/^\/src\/assets\//, "/assets/");
  const normalized = trimmed.replace(/^(\.\/)+/, "").replace(/^(\.\.\/)+/, "");
  if (normalized.startsWith("assets/")) return "/" + normalized;
  if (normalized.startsWith("src/assets/")) return "/" + normalized.replace(/^src\//, "");
  return value;
}

function rewritePrototypeAssets(content) {
  return content
    .replace(/\b(src|href|poster)=("|')([^"']+)(\2)/gi, (match, attr, quote, value, endQuote) => {
      const rewritten = rewriteAssetUrl(value);
      return rewritten === value ? match : attr + "=" + quote + rewritten + endQuote;
    })
    .replace(/url\((["']?)([^"')]+)(\1)\)/gi, (match, quote, value, endQuote) => {
      const rewritten = rewriteAssetUrl(value);
      return rewritten === value ? match : "url(" + quote + rewritten + endQuote + ")";
    });
}

function parseViewport() {
  const arg = process.argv.find((item) => item.startsWith("--viewport="));
  const value = (arg ? arg.slice("--viewport=".length) : process.env.OW_PREVIEW_VIEWPORT) || "375x812";
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) return { label: "375x812", width: 375, height: 812 };
  return { label: value, width: Number(match[1]), height: Number(match[2]) };
}

function renderPrototypePage(page, viewport) {
  const safeHtml = applyTextBindings(
    rewritePrototypeAssets(sanitizePrototypeHtml(page.prototypeHtml || "")),
    page.configData || {},
  );
  const safeCss = rewritePrototypeAssets(sanitizePrototypeCss(page.prototypeCss || ""));
  return "<!doctype html><html><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    "<title>" + htmlEscape(page.name || page.id) + " - Local Preview</title>" +
    "<style>html,body{margin:0;width:100%;min-height:100%;background:#fff;}" +
    "body{display:flex;justify-content:center;align-items:flex-start;}" +
    "#root{position:relative;width:" + viewport.width + "px;height:" + viewport.height + "px;min-height:" + viewport.height + "px;overflow:hidden;background:#fff;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;}" +
    "#root *,#root *::before,#root *::after{box-sizing:border-box;}" +
    "#root img,#root svg,#root video,#root canvas{max-width:100%;}" +
    safeCss +
    "</style></head><body><div id=\"root\">" + safeHtml + "</div></body></html>";
}

function renderDegradedSourcePage(page, reason) {
  return "<!doctype html><html><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    "<style>body{margin:0;background:#f8fafc;color:#111827;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;}main{max-width:960px;margin:0 auto;padding:24px;}pre{white-space:pre-wrap;overflow:auto;background:#fff;border:1px solid #d8dee9;border-radius:8px;padding:16px;line-height:1.5;}p{color:#4b5563;}</style>" +
    "</head><body><main><h1>" + htmlEscape(page.name || page.id) + "</h1><p>" + htmlEscape(reason) + "</p><pre><code>" +
    htmlEscape(page.code || page.sketchScene || "") +
    "</code></pre></main></body></html>";
}

function renderPageDocument(project, pageId, viewport) {
  const page = project.pages.find((item) => item.id === pageId) || project.pages[0];
  if (!page) return renderDegradedSourcePage({ id: "empty", name: "No pages", code: "" }, "本地项目包没有页面。");
  if (page.runtimeType === "prototype-html-css") return renderPrototypePage(page, viewport);
  if (page.runtimeType === "sketch-scene") return renderDegradedSourcePage(page, "草图页暂以 scene 源码降级预览；真实草图渲染仍需创作端预览。");
  return renderDegradedSourcePage(page, "高保真 React 页暂以源码降级预览；真实组件运行仍需创作端预览。");
}

function renderIndex(project) {
  const links = project.pages.map((page) =>
    "<a href=\"/pages/" + encodeURIComponent(page.id) + "\"><strong>" +
    htmlEscape(page.name || page.id) + "</strong><span>" + htmlEscape(page.runtimeType) + "</span></a>"
  ).join("");
  return "<!doctype html><html><head><meta charset=\"utf-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />" +
    "<style>body{margin:0;background:#f5f7fb;color:#17202a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;}main{max-width:960px;margin:0 auto;padding:28px;}h1{font-size:22px;margin:0 0 6px;}p{margin:0 0 20px;color:#4b5563;}nav{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;}a{display:flex;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #d8dee9;border-radius:8px;background:#fff;color:inherit;text-decoration:none;}span{color:#64748b;font-size:12px;}</style>" +
    "</head><body><main><h1>" + htmlEscape(project.manifest.name) + "</h1><p>" +
    htmlEscape(project.manifest.projectId) + " / " + htmlEscape(project.manifest.baseVersion) +
    "</p><nav>" + links + "</nav></main></body></html>";
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function sendStaticAsset(project, requestPath, response) {
  const assetPrefix = "/" + project.manifest.assetsDir.replace(/^src\//, "").replace(/\/$/, "") + "/";
  const srcAssetPrefix = "/" + project.manifest.assetsDir.replace(/\/$/, "") + "/";
  let relativeAsset = null;
  if (requestPath.startsWith(assetPrefix)) relativeAsset = requestPath.slice(assetPrefix.length);
  if (requestPath.startsWith(srcAssetPrefix)) relativeAsset = requestPath.slice(srcAssetPrefix.length);
  if (!relativeAsset || relativeAsset.includes("..")) return false;
  const filePath = path.join(root, project.manifest.assetsDir, relativeAsset);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  response.writeHead(200, { "content-type": contentTypeFor(filePath) });
  response.end(fs.readFileSync(filePath));
  return true;
}

function checkProject() {
  const project = loadProject();
  if (!project.manifest.projectId) throw new Error("projectId is missing");
  for (const page of project.manifest.pages || []) {
    const runtimeType = pageRuntimeType(page);
    if (!fs.existsSync(path.join(root, page.entry))) throw new Error("missing page entry: " + page.entry);
    if (!fs.existsSync(path.join(root, page.schema))) throw new Error("missing page schema: " + page.schema);
    if (runtimeType === "prototype-html-css" && (!page.prototypeHtml || !fs.existsSync(path.join(root, page.prototypeHtml)))) {
      throw new Error("missing prototype html: " + (page.prototypeHtml || page.id));
    }
    if (runtimeType === "prototype-html-css" && page.prototypeCss && !fs.existsSync(path.join(root, page.prototypeCss))) {
      throw new Error("missing prototype css: " + page.prototypeCss);
    }
    if (runtimeType === "sketch-scene" && (!page.sketchScene || !fs.existsSync(path.join(root, page.sketchScene)))) {
      throw new Error("missing sketch scene: " + (page.sketchScene || page.id));
    }
  }
  if (project.manifest.appGraph && !fs.existsSync(path.join(root, project.manifest.appGraph))) {
    throw new Error("missing app graph: " + project.manifest.appGraph);
  }
  return project;
}

function createPreviewServer() {
  return http.createServer((request, response) => {
    try {
      const parsed = url.parse(request.url || "/");
      const requestPath = decodeURIComponent(parsed.pathname || "/");
      const project = loadProject();
      const viewport = parseViewport();
      if (requestPath === "/api/project") {
        response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(project, null, 2));
        return;
      }
      if (sendStaticAsset(project, requestPath, response)) return;
      if (requestPath.startsWith("/pages/")) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(renderPageDocument(project, requestPath.slice("/pages/".length), viewport));
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderIndex(project));
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({ server, baseUrl: "http://127.0.0.1:" + actualPort });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function loadChromium() {
  if (process.env.OW_PLAYWRIGHT_IMPORT_PATH) {
    try {
      const playwright = await import(url.pathToFileURL(process.env.OW_PLAYWRIGHT_IMPORT_PATH).href);
      return playwright.chromium;
    } catch {
      // Fall back to the local package dependency below.
    }
  }
  try {
    const playwright = await import("playwright");
    return playwright.chromium;
  } catch {
    return undefined;
  }
}

async function runPreviewCheck({ screenshot }) {
  const project = checkProject();
  const viewport = parseViewport();
  const outputDir = path.join(root, "test-results", "local-preview");
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "preview-check-report.json");
  const chromium = await loadChromium();
  if (!chromium) {
    const report = {
      ok: false,
      projectId: project.manifest.projectId,
      viewport: viewport.label,
      outputDir,
      reportPath,
      error: { code: "PLAYWRIGHT_NOT_INSTALLED", message: "缺少 playwright 依赖，无法执行真实浏览器预览。" },
      nextActions: ["pnpm install", "pnpm preview:screenshot"],
      pages: [],
      summary: { total: project.pages.length, passed: 0, failed: project.pages.length, screenshots: 0, degraded: project.pages.length, failedRequests: 0, consoleErrors: 0 },
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const preview = await listen(createPreviewServer(), 0);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    await closeServer(preview.server);
    const report = {
      ok: false,
      projectId: project.manifest.projectId,
      viewport: viewport.label,
      outputDir,
      reportPath,
      error: {
        code: "PLAYWRIGHT_BROWSER_MISSING",
        message: error instanceof Error ? error.message : String(error),
      },
      nextActions: ["pnpm exec playwright install chromium", "pnpm preview:screenshot"],
      pages: [],
      summary: { total: project.pages.length, passed: 0, failed: project.pages.length, screenshots: 0, degraded: 0, failedRequests: 0, consoleErrors: 0 },
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const results = [];
  try {
    for (const previewPage of project.pages) {
      const browserPage = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      const consoleErrors = [];
      const failedRequests = [];
      browserPage.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      browserPage.on("pageerror", (error) => consoleErrors.push(error.message));
      browserPage.on("requestfailed", (request) => failedRequests.push(request.url()));
      browserPage.on("response", (response) => {
        if (response.status() >= 400) failedRequests.push(response.url() + " " + response.status());
      });
      const renderUrl = preview.baseUrl + "/pages/" + encodeURIComponent(previewPage.id);
      const issues = [];
      let metrics = { textLength: 0, loadedImages: 0, visibleElements: 0 };
      let nonblank = false;
      try {
        await browserPage.goto(renderUrl, { waitUntil: "networkidle", timeout: 15000 });
        await browserPage.waitForTimeout(120);
        metrics = await browserPage.evaluate(() => {
          const textLength = (document.body.innerText || "").trim().length;
          const loadedImages = Array.from(document.images).filter((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0).length;
          const visibleElements = Array.from(document.body.querySelectorAll("*")).filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || "1") > 0;
          }).length;
          return { textLength, loadedImages, visibleElements };
        });
        nonblank = metrics.textLength > 0 || metrics.loadedImages > 0 || metrics.visibleElements > 2;
      } catch (error) {
        issues.push({ code: "PREVIEW_RENDER_FAILED", message: error instanceof Error ? error.message : String(error), severity: "blocking" });
      }
      const screenshotPath = screenshot ? path.join(outputDir, previewPage.id + ".png") : null;
      if (screenshotPath) await browserPage.screenshot({ path: screenshotPath, fullPage: false });
      if (!nonblank) issues.push({ code: "PREVIEW_BLANK_PAGE", message: "页面疑似空白或透明占位", severity: "blocking" });
      for (const request of failedRequests) issues.push({ code: "PREVIEW_REQUEST_FAILED", message: request, severity: "blocking" });
      for (const error of consoleErrors) issues.push({ code: "PREVIEW_CONSOLE_ERROR", message: error, severity: "blocking" });
      const degraded = previewPage.runtimeType !== "prototype-html-css";
      results.push({
        pageId: previewPage.id,
        name: previewPage.name,
        runtimeType: previewPage.runtimeType,
        renderUrl,
        screenshotPath,
        viewport: viewport.label,
        nonblank,
        degraded,
        degradedReason: degraded ? "当前本地脚手架仅对 HTML/CSS 原型页执行真实运行时渲染；该页面为源码降级预览。" : undefined,
        metrics,
        failedRequests,
        consoleErrors,
        issues,
      });
      await browserPage.close();
    }
  } finally {
    await browser.close();
    await closeServer(preview.server);
  }
  const report = {
    ok: results.every((page) => page.issues.length === 0),
    projectId: project.manifest.projectId,
    viewport: viewport.label,
    outputDir,
    reportPath,
    pages: results,
    summary: {
      total: results.length,
      passed: results.filter((page) => page.issues.length === 0).length,
      failed: results.filter((page) => page.issues.length > 0).length,
      screenshots: results.filter((page) => page.screenshotPath).length,
      degraded: results.filter((page) => page.degraded).length,
      failedRequests: results.reduce((sum, page) => sum + page.failedRequests.length, 0),
      consoleErrors: results.reduce((sum, page) => sum + page.consoleErrors.length, 0),
    },
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf-8");
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (process.argv.includes("--check")) {
  const project = checkProject();
  console.log(JSON.stringify({ ok: true, projectId: project.manifest.projectId, pages: project.pages.length }, null, 2));
  process.exit(0);
}

if (process.argv.includes("--preview-check") || process.argv.includes("--screenshot")) {
  await runPreviewCheck({ screenshot: process.argv.includes("--screenshot") });
}

if (process.env.OW_DEV_ONCE === "1") {
  const project = checkProject();
  console.log("workbench local preview check: " + project.manifest.projectId + " (" + project.pages.length + " pages)");
  process.exit(0);
}

const port = Number(process.env.PORT || process.env.OW_DEV_PORT || 4173);
createPreviewServer().listen(port, () => {
  console.log("workbench local preview: http://localhost:" + port);
});
`;
