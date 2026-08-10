#!/usr/bin/env node
/**
 * normalize.mjs — 页面导出转换脚本
 *
 * 输入：single-file-cli 输出的渲染后自包含 HTML（图片 base64 内联、样式 <style> 内联、无脚本）
 * 输出：创作端 prototype 导入所需的
 *   - out/<page>.html         净化后的 HTML（无 <style>，图片改相对路径）
 *   - out/<page>.css          提取的 prototypeCss
 *   - out/images/...          base64 图片落地
 *   - manifest.json           ow project import-prototype 消费的 manifest
 *
 * 用法：
 *   node bin/normalize.mjs --dir <html 目录> --output <输出目录> --routes <routeKey:htmlFile> [--max-html-bytes 2000000]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RED_LINE_SCRIPT = /<script\b[\s\S]*?<\/script\s*>/gi;
// 匹配带内容的 script（含 src 或非空体），避免误伤已经被移除的占位
const INLINE_EVENT_ATTR =
  /\s+on(?:[a-z_]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))/gi;
const JAVASCRIPT_URL_ATTR = /\s+(?:src|href|action|data)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^\']*'|javascript:[^\s>]+)/gi;
const IFRAME_EMBED_OBJECT =
  /<(?:iframe|embed|object)\b[^>]*>|<\/(?:iframe|embed|object)\s*>/gi;
const FORM_WITH_ACTION =
  /<form\b(?=[^>]*\saction\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))[^>]*>/gi;

const IMG_SRC_BASE64 =
  /\ssrc\s*=\s*"(data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[^"]+)"/gi;
const CSS_URL_BASE64 =
  /url\(\s*(['"]?)(data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[^'")\s]+)\1\s*\)/gi;

// 与 project-core PROTOTYPE_GLOBAL_SELECTOR_RE /(^|[,{;]\s*)(html|body|:root)\b/i 对齐，
// 把出现在选择器起始位置的 html/body/:root 改写为 .prototype-root 容器内局部选择器。
const CSS_ROOT_SELECTOR_RE = /((?:^|[,{;]\s*))(html|body|:root)(?=\b)/gi;

const DEFAULT_MAX_HTML_BYTES = 2 * 1024 * 1024;

function parseArgs(argv) {
  const args = { routes: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const [key, inlineValue] = token.startsWith("--")
      ? token.slice(2).split("=")
      : [null, null];
    if (!key) continue;
    const value =
      inlineValue !== undefined
        ? inlineValue
        : argv[i + 1] && !argv[i + 1].startsWith("--")
          ? argv[++i]
          : "true";
    if (key === "routes") {
      // 支持重复 --routes 或逗号分隔
      for (const pair of value.split(",").filter(Boolean)) {
        args.routes.push(pair);
      }
    } else if (key === "html-dir") {
      args.htmlDir = value;
    } else if (key === "output") {
      args.output = value;
    } else if (key === "max-html-bytes") {
      args.maxHtmlBytes = Number(value);
    } else if (key === "no-config") {
      args.noConfig = value === "true";
    }
  }
  return args;
}

function routeEntries(routes) {
  return routes.map((pair) => {
    const [routeKey, file] = pair.split(":");
    return { routeKey, file: file ?? routeKey };
  });
}

/**
 * 从渲染 HTML 中提取 <style> 内容并合并为 prototypeCss，同时从 HTML 中移除这些 <style>。
 * 返回 { html, css }。
 */
function extractStyles(html) {
  const styles = [];
  const cleaned = html.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, (match) => {
    styles.push(match.replace(/^<style\b[^>]*>/i, "").replace(/<\/style\s*>$/i, ""));
    return "";
  });
  return { html: cleaned, css: styles.join("\n") };
}

/**
 * 红线净化：删除 <script>、内联事件、javascript: URL、iframe/embed/object、带 action 的 form。
 * 返回 { html, warnings }。
 */
function sanitizeHtml(html) {
  const warnings = [];
  let next = html;
  const report = (name, count) => {
    if (count > 0) warnings.push(`净化移除 ${count} 处 ${name}`);
  };

  const scriptMatches = next.match(RED_LINE_SCRIPT) ?? [];
  report("script", scriptMatches.length);
  next = next.replace(RED_LINE_SCRIPT, "");

  const eventMatches = next.match(INLINE_EVENT_ATTR) ?? [];
  report("内联事件属性", eventMatches.length);
  next = next.replace(INLINE_EVENT_ATTR, "");

  const jsUrlMatches = next.match(JAVASCRIPT_URL_ATTR) ?? [];
  report("javascript: URL", jsUrlMatches.length);
  next = next.replace(JAVASCRIPT_URL_ATTR, "");

  const iframeMatches = next.match(IFRAME_EMBED_OBJECT) ?? [];
  report("iframe/embed/object", iframeMatches.length);
  next = next.replace(IFRAME_EMBED_OBJECT, "");

  const formMatches = next.match(FORM_WITH_ACTION) ?? [];
  report("带 action 的 form", formMatches.length);
  next = next.replace(FORM_WITH_ACTION, (tag) =>
    tag.replace(/\saction\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i, ""),
  );

  return { html: next, warnings };
}

/**
 * CSS 净化：移除 @import 与 javascript: url，局部化 html/body/:root。
 */
function sanitizeCss(css) {
  const warnings = [];
  let next = css.replace(/@import\b[^;]+;/gi, (m) => {
    warnings.push(`移除 CSS @import: ${m.trim()}`);
    return "";
  });
  next = next.replace(/url\(\s*(['"]?)javascript:[^'")\s]+\1\s*\)/gi, (m) => {
    warnings.push(`移除 CSS javascript: url`);
    return "none";
  });
  next = next.replace(CSS_ROOT_SELECTOR_RE, (match, prefix) => `${prefix}.prototype-root`);
  return { css: next, warnings };
}

/**
 * 将 base64 图片落地为独立文件，并把 HTML/CSS 中的引用改写为相对路径。
 * 返回 { html, css, images, warnings }。
 */
function extractImages(html, css, imagesDir) {
  const warnings = [];
  const images = [];
  let index = 0;
  const mimeToExt = (mime) => {
    if (mime.includes("jpeg")) return "jpg";
    if (mime.includes("png")) return "png";
    if (mime.includes("gif")) return "gif";
    if (mime.includes("webp")) return "webp";
    if (mime.includes("svg")) return "svg";
    return "png";
  };

  const ensureImage = (dataUrl, mime) => {
    const ext = mimeToExt(mime);
    index += 1;
    const filename = `img-${String(index).padStart(3, "0")}.${ext}`;
    const filePath = path.join(imagesDir, filename);
    const base64 = dataUrl.split(",")[1];
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    images.push({ filename, mimeType: mime, bytes: Buffer.from(base64, "base64").length });
    return `images/${filename}`;
  };

  let nextHtml = html.replace(IMG_SRC_BASE64, (whole, dataUrl) => {
    const mime = dataUrl.match(/^data:image\/([^;]+);/)?.[1] ?? "png";
    return ` src="${ensureImage(dataUrl, mime)}"`;
  });

  let nextCss = css.replace(CSS_URL_BASE64, (whole, quote, dataUrl) => {
    const mime = dataUrl.match(/^data:image\/([^;]+);/)?.[1] ?? "png";
    return `url("${ensureImage(dataUrl, mime)}")`;
  });

  return { html: nextHtml, css: nextCss, images, warnings };
}

/**
 * 注入 data-route 锚点到页面根元素。
 */
function injectRouteAnchor(html, routeKey) {
  const rootBrace = html.search(/<body\b[^>]*>/i);
  if (rootBrace === -1) {
    // 无 body 时给首个元素加
    return html.replace(/<([a-zA-Z][\w-]*)(\s[^>]*)?>/i, (whole, tag, attrs) =>
      attrs?.includes("data-route")
        ? whole
        : `<${tag}${attrs ?? ""} data-route="${routeKey}">`,
    );
  }
  const bodyMatch = html.slice(rootBrace).match(/<body\b[^>]*>/i);
  const bodyTag = bodyMatch ? bodyMatch[0] : null;
  if (!bodyTag) return html;
  if (bodyTag.includes("data-route")) return html;
  const newBodyTag = bodyTag.replace(
    /^<body/i,
    `<body data-route="${routeKey}"`,
  );
  return html.replace(bodyTag, newBodyTag);
}

function buildManifest(pages, noConfig) {
  return {
    pages: pages.map((page) => ({
      name: page.name,
      routeKey: page.routeKey,
      prototypeHtml: `@./${page.file}.html`,
      prototypeCss: `@./${page.file}.css`,
      ...(noConfig ? {} : { schema: undefined }),
    })),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.htmlDir || !args.output || args.routes.length === 0) {
    console.error(
      "用法: node bin/normalize.mjs --html-dir <dir> --output <dir> --routes <routeKey:file>[,...] [--no-config]",
    );
    process.exit(1);
  }

  const htmlDir = path.resolve(args.htmlDir);
  const outputDir = path.resolve(args.output);
  const imagesDir = path.join(outputDir, "images");
  const maxHtmlBytes = args.maxHtmlBytes ?? DEFAULT_MAX_HTML_BYTES;

  fs.mkdirSync(imagesDir, { recursive: true });

  const entries = routeEntries(args.routes);
  const pages = [];
  const allWarnings = [];
  const sizeIssues = [];

  for (const { routeKey, file } of entries) {
    const srcPath = path.join(htmlDir, `${file}.html`);
    if (!fs.existsSync(srcPath)) {
      allWarnings.push(`缺少源文件: ${file}.html（routeKey=${routeKey}）`);
      continue;
    }
    let html = fs.readFileSync(srcPath, "utf-8");

    const extracted = extractStyles(html);
    html = extracted.html;
    let css = extracted.css;

    const sanitizedHtml = sanitizeHtml(html);
    html = sanitizedHtml.html;
    allWarnings.push(...sanitizedHtml.warnings);

    const sanitizedCss = sanitizeCss(css);
    css = sanitizedCss.css;
    allWarnings.push(...sanitizedCss.warnings);

    const withImages = extractImages(html, css, imagesDir);
    html = withImages.html;
    css = withImages.css;

    html = injectRouteAnchor(html, routeKey);

    const htmlBytes = Buffer.byteLength(html, "utf-8");
    if (htmlBytes > maxHtmlBytes) {
      sizeIssues.push(
        `${routeKey}: HTML ${htmlBytes} 字节超过 ${maxHtmlBytes} 上限，需压缩或拆页`,
      );
    }

    fs.writeFileSync(path.join(outputDir, `${file}.html`), html, "utf-8");
    fs.writeFileSync(path.join(outputDir, `${file}.css`), css, "utf-8");

    pages.push({ name: routeKey, routeKey, file, images: withImages.images });
    allWarnings.push(...withImages.warnings);
    console.error(`[normalize] ${routeKey} -> ${file}.html / ${file}.css (${htmlBytes} bytes)`);
  }

  const manifest = buildManifest(pages, args.noConfig);
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  const result = {
    ok: true,
    outputDir,
    pages: pages.map(({ name, routeKey, file, images }) => ({
      name,
      routeKey,
      file,
      imageCount: images.length,
    })),
    warnings: allWarnings,
    sizeIssues,
  };
  fs.writeFileSync(path.join(outputDir, "normalize-report.json"), JSON.stringify(result, null, 2), "utf-8");
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main();