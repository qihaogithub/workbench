#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const PRESETS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

function positiveDimension(value) {
  const number = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function presetFor(width, height) {
  return Object.entries(PRESETS).find(
    ([, value]) => value.width === width && value.height === height,
  )?.[0] ?? "custom";
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return undefined;
  }
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function migratePresentationSchema(schema, context = {}) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
  const demo =
    schema.$demo && typeof schema.$demo === "object" && !Array.isArray(schema.$demo)
      ? { ...schema.$demo }
      : {};
  if (demo.presentation) return null;

  const legacy =
    demo.previewSize && typeof demo.previewSize === "object" && !Array.isArray(demo.previewSize)
      ? demo.previewSize
      : {};
  const metaViewport = context.metaViewport ?? {};
  const width =
    positiveDimension(legacy.width) ??
    positiveDimension(metaViewport.width) ??
    (context.runtimeType === "sandboxed-html" ? PRESETS.desktop.width : 375);
  const height =
    positiveDimension(legacy.height) ??
    positiveDimension(metaViewport.height) ??
    (context.runtimeType === "sandboxed-html" ? PRESETS.desktop.height : 812);
  const fixed = context.isFigma === true;
  const source = fixed
    ? "figma"
    : positiveDimension(metaViewport.width) && positiveDimension(metaViewport.height)
      ? "html-meta"
      : Object.keys(legacy).length > 0
        ? "user"
        : "recommended";

  delete demo.previewSize;
  demo.presentation = {
    version: 1,
    mode: fixed ? "fixed-canvas" : "responsive-page",
    viewport: { width, height },
    heightBehavior: fixed ? "fixed" : "content",
    preset: presetFor(width, height),
    source,
  };
  return { ...schema, $demo: demo };
}

function runtimeContext(schemaPath) {
  const pageDir = path.dirname(schemaPath);
  const sandboxPath = path.join(pageDir, "sandbox.html");
  const prototypePath = path.join(pageDir, "prototype.html");
  const sandboxHtml = readText(sandboxPath);
  const prototypeHtml = readText(prototypePath);
  const source = sandboxHtml || prototypeHtml;
  const runtimeType = sandboxHtml
    ? "sandboxed-html"
    : prototypeHtml
      ? "prototype-html-css"
      : fs.existsSync(path.join(pageDir, "sketch.scene.json"))
        ? "sketch-scene"
        : "high-fidelity-react";
  const htmlMeta = readJson(path.join(pageDir, "html-import.meta.json"));
  const prototypeMeta = readJson(path.join(pageDir, "prototype.meta.json"));
  return {
    runtimeType,
    isFigma: /\.figma-export\b|\bdata-layer\s*=|class=["'][^"']*figma-export/i.test(source),
    metaViewport:
      htmlMeta?.viewport ??
      htmlMeta?.detectedViewport ??
      (prototypeMeta
        ? { width: prototypeMeta.width, height: prototypeMeta.height }
        : undefined),
  };
}

function collectSchemas(root, result = []) {
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) collectSchemas(target, result);
    else if (entry.isFile() && entry.name === "config.schema.json") result.push(target);
  }
  return result;
}

export function migratePresentationFiles(root, apply = false) {
  const report = { scanned: 0, changed: 0, invalid: 0 };
  for (const schemaPath of collectSchemas(root)) {
    report.scanned += 1;
    const schema = readJson(schemaPath);
    if (!schema) {
      report.invalid += 1;
      continue;
    }
    const migrated = migratePresentationSchema(schema, runtimeContext(schemaPath));
    if (!migrated) continue;
    report.changed += 1;
    if (apply) {
      fs.writeFileSync(schemaPath, `${JSON.stringify(migrated, null, 2)}\n`, "utf8");
    }
  }
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes("--apply");
  const dataDirIndex = process.argv.indexOf("--data-dir");
  const root =
    dataDirIndex >= 0 && process.argv[dataDirIndex + 1]
      ? path.resolve(process.argv[dataDirIndex + 1])
      : DEFAULT_ROOT;
  const report = migratePresentationFiles(root, apply);
  process.stdout.write(
    `${JSON.stringify({ mode: apply ? "apply" : "dry-run", root, ...report }, null, 2)}\n`,
  );
}
