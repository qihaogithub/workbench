import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, "dist");

const requiredAssets = [
  {
    path: "canvaskit.wasm",
    label: "CanvasKit wasm",
    minBytes: 1024,
    contentTypes: ["application/wasm"],
    validateHeader: (buffer) =>
      buffer.length >= 4 &&
      buffer[0] === 0x00 &&
      buffer[1] === 0x61 &&
      buffer[2] === 0x73 &&
      buffer[3] === 0x6d,
  },
  ...[
    "Inter-Regular.ttf",
    "Inter-Medium.ttf",
    "Inter-SemiBold.ttf",
    "Inter-Bold.ttf",
    "Inter-ExtraBold.ttf",
    "NotoNaskhArabic-Regular.ttf",
  ].map((fileName) => ({
    path: fileName,
    label: `font ${fileName}`,
    minBytes: 1024,
    contentTypes: ["font/ttf", "font/otf", "application/font-sfnt", "application/octet-stream"],
    validateHeader: (buffer) => {
      if (buffer.length < 4) return false;
      const tag = buffer.subarray(0, 4).toString("latin1");
      return tag === "OTTO" || tag === "true" || tag === "ttcf" || buffer.readUInt32BE(0) === 0x00010000;
    },
  })),
];

const requiredSdkFiles = [
  "index.html",
  "sdk/index.js",
  "sdk/index.d.ts",
  "sdk/adapter.js",
  "sdk/adapter.d.ts",
];

function fail(message) {
  console.error(`[openpencil-assets] ${message}`);
  process.exitCode = 1;
}

function assertLocalFile(relativePath, options = {}) {
  const filePath = join(distDir, relativePath);
  if (!existsSync(filePath)) {
    fail(`missing dist asset: ${relativePath}`);
    return;
  }

  const stat = statSync(filePath);
  const minBytes = options.minBytes ?? 1;
  if (stat.size < minBytes) {
    fail(`dist asset is unexpectedly small: ${relativePath} (${stat.size} bytes)`);
    return;
  }

  const buffer = readFileSync(filePath);
  const asciiPrefix = buffer.subarray(0, 32).toString("utf8").trimStart().toLowerCase();
  if (!options.allowHtml && (asciiPrefix.startsWith("<!doctype") || asciiPrefix.startsWith("<html"))) {
    fail(`dist asset looks like an HTML fallback: ${relativePath}`);
  }

  if (options.validateHeader && !options.validateHeader(buffer)) {
    fail(`dist asset has an unexpected binary header: ${relativePath}`);
  }
}

async function probeRemoteAsset(baseUrl, asset) {
  const url = new URL(asset.path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    fail(`remote asset request failed: ${url.href} (${response.status})`);
    return;
  }

  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (!contentType || !asset.contentTypes.includes(contentType)) {
    fail(
      `remote asset has unexpected Content-Type: ${url.href} (${contentType ?? "missing"})`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < asset.minBytes) {
    fail(`remote asset is unexpectedly small: ${url.href} (${buffer.length} bytes)`);
  }
  const asciiPrefix = buffer.subarray(0, 32).toString("utf8").trimStart().toLowerCase();
  if (asciiPrefix.startsWith("<!doctype") || asciiPrefix.startsWith("<html")) {
    fail(`remote asset looks like an HTML fallback: ${url.href}`);
  }
  if (!asset.validateHeader(buffer)) {
    fail(`remote asset has an unexpected binary header: ${url.href}`);
  }
}

for (const fileName of requiredSdkFiles) {
  assertLocalFile(fileName, { allowHtml: fileName === "index.html" });
}

for (const asset of requiredAssets) {
  assertLocalFile(asset.path, asset);
}

const remoteBaseUrl = process.env.OPENPENCIL_ASSET_BASE_URL;
if (remoteBaseUrl) {
  try {
    for (const asset of requiredAssets) {
      await probeRemoteAsset(remoteBaseUrl, asset);
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

if (!process.exitCode) {
  const remoteLabel = remoteBaseUrl ? ` and remote ${remoteBaseUrl}` : "";
  console.log(`[openpencil-assets] dist${remoteLabel} assets verified`);
}
