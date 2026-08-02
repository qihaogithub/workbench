/**
 * batch-generate-image-alt.mjs
 *
 * 批量为项目存量图片生成 alt 描述。
 * 用法：node scripts/batch-generate-image-alt.mjs [--dry-run] [--project <projectId>]
 *
 * 环境变量：
 *   PI_AGENT_API_KEY        必填，vision model API key
 *   PI_AGENT_PROVIDER       选填，默认 "anthropic"
 *   PI_AGENT_MODEL          选填，vision model ID（需要支持图片输入）
 *   PI_AGENT_BASE_URL       选填，自定义 API 基础地址（OpenAI 兼容格式）
 *   IMAGE_DESCRIPTION_MODEL 选填，优先使用的识图模型（格式 provider/modelId）
 *   IMAGE_DESCRIPTION_TIMEOUT 选填，单张超时毫秒，默认 15000
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const PROJECTS_DIR = path.join(DATA_DIR, "projects");
const IMAGE_STORE_DIR = path.join(DATA_DIR, "image-store");
const BLOBS_DIR = path.join(IMAGE_STORE_DIR, "blobs");

const DRY_RUN = process.argv.includes("--dry-run");
const FILTER_PROJECT = (() => {
  const idx = process.argv.indexOf("--project");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// Vision model config
const PI_AGENT_API_KEY = process.env.PI_AGENT_API_KEY || "";
const PI_AGENT_PROVIDER = process.env.PI_AGENT_PROVIDER || "anthropic";
const PI_AGENT_MODEL = process.env.PI_AGENT_MODEL || "claude-sonnet-4-20250514";
const PI_AGENT_BASE_URL = process.env.PI_AGENT_BASE_URL || "";
const IMAGE_DESCRIPTION_MODEL = process.env.IMAGE_DESCRIPTION_MODEL || "";
const TIMEOUT_MS = Number(process.env.IMAGE_DESCRIPTION_TIMEOUT) || 15000;

const MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

const ALT_PROMPT = `简要描述这张图片的内容，用于网页无障碍 alt 文本。
- 30 字以内
- 使用中文
- 只描述画面中的客观内容（主体、动作、场景），不做艺术评价
- 如果图片包含文字，引用原文`;

function resolveVisionModel() {
  if (IMAGE_DESCRIPTION_MODEL) {
    const parts = IMAGE_DESCRIPTION_MODEL.split("/");
    if (parts.length === 2) {
      return { provider: parts[0], modelId: parts[1] };
    }
  }
  const parts = PI_AGENT_MODEL.split("/");
  if (parts.length === 2) {
    return { provider: parts[0], modelId: parts[1] };
  }
  return { provider: PI_AGENT_PROVIDER, modelId: PI_AGENT_MODEL };
}

function resolveBaseUrl() {
  if (IMAGE_DESCRIPTION_MODEL) {
    return PI_AGENT_BASE_URL;
  }
  return PI_AGENT_BASE_URL;
}

function resolveApiKey() {
  const { provider } = resolveVisionModel();
  const providerKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  return providerKey || PI_AGENT_API_KEY;
}

async function describeImage(base64Data, mimeType) {
  const { provider, modelId } = resolveVisionModel();
  const baseUrl = resolveBaseUrl();
  const apiKey = resolveApiKey();

  if (!apiKey) {
    throw new Error("No API key configured. Set PI_AGENT_API_KEY or provider-specific key.");
  }

  if (baseUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: ALT_PROMPT },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType};base64,${base64Data}` },
                },
              ],
            },
          ],
          max_tokens: 200,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Vision API ${res.status}: ${text.slice(0, 200)}`);
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content?.trim() || null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // No baseUrl: use Anthropic Messages API format
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64Data,
                },
              },
              { type: "text", text: ALT_PROMPT },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
    }

    const json = await res.json();
    return json.content?.[0]?.text?.trim() || null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Discover all project manifests
function findAllProjectManifests() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const projects = [];
  for (const entry of fs.readdirSync(PROJECTS_DIR)) {
    const manifestPath = path.join(PROJECTS_DIR, entry, "images.json");
    if (fs.existsSync(manifestPath)) {
      projects.push({ projectId: entry, manifestPath });
    }
  }
  return projects;
}

function findBlobPath(contentHash, filename) {
  const ext = path.extname(filename).slice(1).toLowerCase();
  const blobFilename = `${contentHash.slice(0, 16)}.${ext}`;
  const blobPath = path.join(BLOBS_DIR, blobFilename);
  return fs.existsSync(blobPath) ? blobPath : null;
}

async function main() {
  if (!PI_AGENT_API_KEY) {
    console.error("Error: PI_AGENT_API_KEY is not set.");
    console.error("Usage: PI_AGENT_API_KEY=sk-... node scripts/batch-generate-image-alt.mjs");
    process.exit(1);
  }

  const { provider, modelId } = resolveVisionModel();
  const baseUrl = resolveBaseUrl();
  console.log(`Vision model: ${provider}/${modelId}`);
  if (baseUrl) console.log(`Base URL: ${baseUrl}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  if (DRY_RUN) console.log("Mode: DRY RUN (no changes will be written)");
  console.log("");

  const projects = findAllProjectManifests();
  if (FILTER_PROJECT) {
    const filtered = projects.filter((p) => p.projectId === FILTER_PROJECT);
    if (filtered.length === 0) {
      console.error(`Project ${FILTER_PROJECT} not found or has no images.json`);
      process.exit(1);
    }
    projects.splice(0, projects.length, ...filtered);
  }

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalCached = 0;

  for (const { projectId, manifestPath } of projects) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const imagesWithoutAlt = manifest.images.filter((img) => !img.alt);

    if (imagesWithoutAlt.length === 0) {
      totalSkipped += manifest.images.length;
      continue;
    }

    console.log(`[${projectId}] ${imagesWithoutAlt.length}/${manifest.images.length} images need alt`);

    let projectUpdated = 0;
    let projectFailed = 0;

    for (const img of imagesWithoutAlt) {
      if (!img.contentHash || !img.filename) {
        projectFailed++;
        continue;
      }

      const blobPath = findBlobPath(img.contentHash, img.filename);
      if (!blobPath) {
        projectFailed++;
        continue;
      }

      try {
        const buffer = fs.readFileSync(blobPath);
        const ext = path.extname(img.filename).slice(1).toLowerCase();
        const mimeType = MIME_TYPES[`.${ext}`] || "image/png";
        const base64 = buffer.toString("base64");

        const alt = await describeImage(base64, mimeType);
        if (alt) {
          img.alt = alt;
          projectUpdated++;
          process.stdout.write(`  ✓ ${img.filename}: ${alt.slice(0, 50)}\n`);
        } else {
          projectFailed++;
          process.stdout.write(`  ✗ ${img.filename}: empty response\n`);
        }
      } catch (err) {
        projectFailed++;
        process.stdout.write(`  ✗ ${img.filename}: ${err.message}\n`);
      }
    }

    if (projectUpdated > 0 && !DRY_RUN) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    }

    totalUpdated += projectUpdated;
    totalFailed += projectFailed;
    totalSkipped += manifest.images.length - imagesWithoutAlt.length;
  }

  console.log(`\nDone. updated=${totalUpdated} skipped=${totalSkipped} failed=${totalFailed}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
