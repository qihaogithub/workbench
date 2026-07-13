import * as fs from "fs";
import * as path from "path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";
import { loadConfig } from "../../utils/config";
import { logger } from "../../utils/logger";

const CaptureScreenshotParams = Type.Object({
  width: Type.Optional(
    Type.Number({
      description: "Viewport width in pixels. Default 375.",
      minimum: 200,
      maximum: 1920,
      default: 375,
    }),
  ),
  height: Type.Optional(
    Type.Number({
      description: "Viewport height in pixels. Default 812.",
      minimum: 200,
      maximum: 3000,
      default: 812,
    }),
  ),
  fullPage: Type.Optional(
    Type.Boolean({
      description: "Capture the full scrollable page. Default true.",
      default: true,
    }),
  ),
});

type CaptureScreenshotParams = Static<typeof CaptureScreenshotParams>;

interface ScreenshotGenerateResponse {
  success: boolean;
  data?: {
    url?: string;
    hash?: string;
    elapsed?: number;
    cached?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

function normalizePathParts(filePath: string): string[] {
  return path
    .resolve(filePath)
    .split(/[\\/]+/)
    .filter(Boolean);
}

function inferProjectId(workingDir: string): string | null {
  const parts = normalizePathParts(workingDir);

  for (let index = 0; index < parts.length - 1; index++) {
    if (
      (parts[index] === "projects" || parts[index] === "sessions") &&
      parts[index + 1]?.startsWith("proj_")
    ) {
      return parts[index + 1];
    }
  }

  return null;
}

function getScreenshotServiceUrl(): string {
  return loadConfig().screenshotServiceUrl.replace(/\/+$/, "");
}

function getDemoDir(workingDir: string, demoId: string): string {
  return path.join(workingDir, "demos", demoId);
}

function readConfigDefaults(schemaPath: string): Record<string, unknown> {
  if (!fs.existsSync(schemaPath)) {
    return {};
  }

  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8")) as {
      properties?: Record<string, { default?: unknown }>;
    };
    const defaults: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, "default")) {
        defaults[key] = value.default;
      }
    }
    return defaults;
  } catch (error) {
    logger.warn(
      { schemaPath, error },
      "captureScreenshot: failed to read config defaults",
    );
    return {};
  }
}

async function readResponseJson(
  response: Response,
): Promise<ScreenshotGenerateResponse> {
  const payload = await response.json();
  if (typeof payload === "object" && payload !== null && "success" in payload) {
    return payload as ScreenshotGenerateResponse;
  }
  return {
    success: false,
    error: {
      code: "INVALID_RESPONSE",
      message: "Screenshot service returned an invalid response.",
    },
  };
}

// --- Asset inlining for prototype screenshot rendering ---

const INLINE_IMAGE_EXT_RE =
  /\.(png|jpe?g|gif|webp|svg|bmp|ico)(\?[^'")\s]*)?$/i;
const INLINE_HTML_ASSET_ATTR_RE = /\b(src|href|poster)=("|')([^"']+)(\2)/gi;
const INLINE_CSS_URL_RE = /url\((['"]?)([^"'`)]+)(\1)\)/gi;
const INLINE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const MIME_TYPE_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

function resolveRelativePath(relativePath: string, basePath: string): string {
  const parts = basePath.split("/").filter(Boolean);
  const relativeParts = relativePath.split("/");
  for (const part of relativeParts) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      if (parts.length === 0) return relativePath;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

async function resolveToDataUri(
  value: string,
  demoPageRelPath: string,
  workspaceAbsPath: string,
): Promise<string> {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!/^\.\.?\/[^'")\s]*$/u.test(trimmed)) return value;
  if (!INLINE_IMAGE_EXT_RE.test(trimmed)) return value;

  const cleanPath = trimmed.split("?")[0];
  const resolvedRelPath = resolveRelativePath(cleanPath, demoPageRelPath);
  const absPath = path.join(workspaceAbsPath, resolvedRelPath);

  const wsPrefix = workspaceAbsPath.endsWith(path.sep)
    ? workspaceAbsPath
    : workspaceAbsPath + path.sep;
  if (!absPath.startsWith(wsPrefix) && absPath !== workspaceAbsPath) {
    return value;
  }

  try {
    const stat = await fs.promises.stat(absPath).catch(() => null);
    if (!stat?.isFile()) return value;
    if (stat.size > INLINE_MAX_BYTES) return value;
    const ext = path.extname(absPath).toLowerCase();
    const mime = MIME_TYPE_MAP[ext];
    if (!mime) return value;
    const buffer = await fs.promises.readFile(absPath);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return value;
  }
}

async function inlineRelativeImageAssets(
  content: string,
  demoPageRelPath: string,
  workspaceAbsPath: string,
): Promise<string> {
  let result = content;

  // Inline HTML asset attributes (src, href, poster)
  // Process matches from back to front so earlier replacements don't shift later offsets.
  const htmlMatches = [...result.matchAll(INLINE_HTML_ASSET_ATTR_RE)].sort(
    (a, b) => (b.index ?? 0) - (a.index ?? 0),
  );
  for (const m of htmlMatches) {
    const [fullMatch, attr, quote, attrValue, endQuote] = m;
    // Skip if the attribute value is already a data URI
    if (attrValue.startsWith("data:")) continue;
    const inlined = await resolveToDataUri(
      attrValue,
      demoPageRelPath,
      workspaceAbsPath,
    );
    if (inlined !== attrValue) {
      const start = m.index!;
      result =
        result.slice(0, start) +
        `${attr}=${quote}${inlined}${endQuote}` +
        result.slice(start + fullMatch.length);
    }
  }

  // Inline CSS url() references
  for (const m of result.matchAll(INLINE_CSS_URL_RE)) {
    const [fullMatch, quote, urlValue, endQuote] = m;
    // Skip url() that is part of an existing data URI or follows a boundary char
    const charBefore = m.index! > 0 ? result[m.index! - 1] : "";
    if (charBefore === ";" || charBefore === ":") continue;
    if (urlValue.startsWith("data:")) continue;
    const inlined = await resolveToDataUri(
      urlValue,
      demoPageRelPath,
      workspaceAbsPath,
    );
    if (inlined !== urlValue) {
      const actualIndex = result.indexOf(fullMatch, m.index);
      result =
        result.slice(0, actualIndex) +
        `url(${quote}${inlined}${endQuote})` +
        result.slice(actualIndex + fullMatch.length);
    }
  }

  return result;
}

export function createCaptureScreenshotTool(
  config: AgentConfig,
): AgentTool<typeof CaptureScreenshotParams> {
  return {
    name: "captureScreenshot",
    label: "Capture Screenshot",
    description:
      "Capture a PNG screenshot of the current preview page. Use it to inspect visual layout, styling, and responsive behavior. " +
      "The screenshot is rendered by the screenshot service from the latest workspace files, so unsaved browser-only edits may not appear.",
    parameters: CaptureScreenshotParams,
    execute: async (_toolCallId: string, args: CaptureScreenshotParams) => {
      const workingDir = config.workingDir;
      const demoId = config.demoId;

      if (!workingDir || !demoId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: captureScreenshot requires a bound workingDir and demoId.",
            },
          ],
          details: {
            error: "missing_context",
            workingDir: !!workingDir,
            demoId: !!demoId,
          },
          isError: true,
        };
      }

      const projectId = inferProjectId(workingDir);
      if (!projectId) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: unable to infer projectId from workingDir "${workingDir}".`,
            },
          ],
          details: { error: "project_not_found", workingDir },
          isError: true,
        };
      }

      const demoDir = getDemoDir(workingDir, demoId);
      const prototypeHtmlPath = path.join(demoDir, "prototype.html");
      const prototypeCssPath = path.join(demoDir, "prototype.css");
      const codePath = path.join(demoDir, "index.tsx");
      const schemaPath = path.join(demoDir, "config.schema.json");

      const isPrototypePage = fs.existsSync(prototypeHtmlPath);
      const isCodePage = !isPrototypePage && fs.existsSync(codePath);

      if (!isPrototypePage && !isCodePage) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: preview code file not found: demos/${demoId}/index.tsx`,
            },
          ],
          details: { error: "code_file_not_found", path: codePath },
          isError: true,
        };
      }

      try {
        const width = args.width ?? 375;
        const height = args.height ?? 812;
        const fullPage = args.fullPage ?? true;
        const configData = readConfigDefaults(schemaPath);
        const serviceUrl = getScreenshotServiceUrl();

        let requestBody: Record<string, unknown>;

        if (isPrototypePage) {
          const rawHtml = await fs.promises.readFile(
            prototypeHtmlPath,
            "utf-8",
          );
          const rawCss = fs.existsSync(prototypeCssPath)
            ? await fs.promises.readFile(prototypeCssPath, "utf-8")
            : "";

          // Inline relative image paths as base64 data URIs so the
          // screenshot service (separate process) can render them.
          const demoPageRelPath = `demos/${demoId}/`;
          const prototypeHtml = await inlineRelativeImageAssets(
            rawHtml,
            demoPageRelPath,
            workingDir,
          );
          const prototypeCss = rawCss
            ? await inlineRelativeImageAssets(
                rawCss,
                demoPageRelPath,
                workingDir,
              )
            : rawCss;

          requestBody = {
            projectId,
            pageId: demoId,
            runtimeType: "prototype-html-css",
            prototypeHtml,
            prototypeCss,
            configData,
            width,
            height,
            fullPage,
            sessionId: config.sessionId,
          };
        } else {
          const code = await fs.promises.readFile(codePath, "utf-8");
          requestBody = {
            projectId,
            pageId: demoId,
            code,
            configData,
            width,
            height,
            fullPage,
            sessionId: config.sessionId,
          };
        }

        const generateResponse = await fetch(
          `${serviceUrl}/api/screenshots/generate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          },
        );

        const result = await readResponseJson(generateResponse);
        if (!generateResponse.ok || !result.success || !result.data?.url) {
          const message =
            result.error?.message ||
            `Screenshot service failed with HTTP ${generateResponse.status}`;
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            details: {
              error: result.error?.code || "screenshot_failed",
              status: generateResponse.status,
            },
            isError: true,
          };
        }

        const imageResponse = await fetch(
          `${serviceUrl}/api/screenshots/file/${projectId}/${demoId}?t=${Date.now()}`,
        );
        if (!imageResponse.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: screenshot generated but image download failed with HTTP ${imageResponse.status}.`,
              },
            ],
            details: {
              error: "image_download_failed",
              status: imageResponse.status,
            },
            isError: true,
          };
        }

        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const base64 = buffer.toString("base64");
        const sizeKB = Math.round(buffer.length / 1024);

        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot captured (${width}x${height}${fullPage ? ", full page" : ""}, ${sizeKB}KB).`,
            },
            {
              type: "image" as const,
              data: base64,
              mimeType: "image/png",
            },
          ],
          details: {
            projectId,
            demoId,
            width,
            height,
            fullPage,
            sizeKB,
            cached: result.data.cached ?? false,
            elapsed: result.data.elapsed,
            hash: result.data.hash,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error(
          { error: message, demoId, workingDir },
          "captureScreenshot failed",
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to capture screenshot: ${message}`,
            },
          ],
          details: { error: "capture_failed", message },
          isError: true,
        };
      }
    },
  };
}
