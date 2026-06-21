import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

const DEFAULT_SCREENSHOT_SERVICE_URL = 'http://localhost:3202';

const CaptureScreenshotParams = Type.Object({
  width: Type.Optional(
    Type.Number({
      description: 'Viewport width in pixels. Default 375.',
      minimum: 200,
      maximum: 1920,
      default: 375,
    }),
  ),
  height: Type.Optional(
    Type.Number({
      description: 'Viewport height in pixels. Default 812.',
      minimum: 200,
      maximum: 3000,
      default: 812,
    }),
  ),
  fullPage: Type.Optional(
    Type.Boolean({
      description: 'Capture the full scrollable page. Default true.',
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
  return path.resolve(filePath).split(/[\\/]+/).filter(Boolean);
}

function inferProjectId(workingDir: string): string | null {
  const parts = normalizePathParts(workingDir);

  for (let index = 0; index < parts.length - 1; index++) {
    if ((parts[index] === 'projects' || parts[index] === 'sessions') && parts[index + 1]?.startsWith('proj_')) {
      return parts[index + 1];
    }
  }

  return null;
}

function getScreenshotServiceUrl(): string {
  return (process.env.SCREENSHOT_SERVICE_URL || DEFAULT_SCREENSHOT_SERVICE_URL).replace(/\/$/, '');
}

function getDemoDir(workingDir: string, demoId: string): string {
  return path.join(workingDir, 'demos', demoId);
}

function readConfigDefaults(schemaPath: string): Record<string, unknown> {
  if (!fs.existsSync(schemaPath)) {
    return {};
  }

  try {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8')) as {
      properties?: Record<string, { default?: unknown }>;
    };
    const defaults: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(value, 'default')) {
        defaults[key] = value.default;
      }
    }
    return defaults;
  } catch (error) {
    logger.warn({ schemaPath, error }, 'captureScreenshot: failed to read config defaults');
    return {};
  }
}

async function readResponseJson(response: Response): Promise<ScreenshotGenerateResponse> {
  const payload = await response.json();
  if (typeof payload === 'object' && payload !== null && 'success' in payload) {
    return payload as ScreenshotGenerateResponse;
  }
  return {
    success: false,
    error: { code: 'INVALID_RESPONSE', message: 'Screenshot service returned an invalid response.' },
  };
}

export function createCaptureScreenshotTool(config: AgentConfig): AgentTool<typeof CaptureScreenshotParams> {
  return {
    name: 'captureScreenshot',
    label: 'Capture Screenshot',
    description:
      'Capture a PNG screenshot of the current preview page. Use it to inspect visual layout, styling, and responsive behavior. ' +
      'The screenshot is rendered by the screenshot service from the latest workspace files, so unsaved browser-only edits may not appear.',
    parameters: CaptureScreenshotParams,
    execute: async (_toolCallId: string, args: CaptureScreenshotParams) => {
      const workingDir = config.workingDir;
      const demoId = config.demoId;

      if (!workingDir || !demoId) {
        return {
          content: [{ type: 'text' as const, text: 'Error: captureScreenshot requires a bound workingDir and demoId.' }],
          details: { error: 'missing_context', workingDir: !!workingDir, demoId: !!demoId },
          isError: true,
        };
      }

      const projectId = inferProjectId(workingDir);
      if (!projectId) {
        return {
          content: [{ type: 'text' as const, text: `Error: unable to infer projectId from workingDir "${workingDir}".` }],
          details: { error: 'project_not_found', workingDir },
          isError: true,
        };
      }

      const demoDir = getDemoDir(workingDir, demoId);
      const codePath = path.join(demoDir, 'index.tsx');
      const schemaPath = path.join(demoDir, 'config.schema.json');

      if (!fs.existsSync(codePath)) {
        return {
          content: [{ type: 'text' as const, text: `Error: preview code file not found: demos/${demoId}/index.tsx` }],
          details: { error: 'code_file_not_found', path: codePath },
          isError: true,
        };
      }

      try {
        const width = args.width ?? 375;
        const height = args.height ?? 812;
        const fullPage = args.fullPage ?? true;
        const code = await fs.promises.readFile(codePath, 'utf-8');
        const configData = readConfigDefaults(schemaPath);
        const serviceUrl = getScreenshotServiceUrl();

        const generateResponse = await fetch(`${serviceUrl}/api/screenshots/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            pageId: demoId,
            code,
            configData,
            width,
            height,
            fullPage,
            sessionId: config.sessionId,
          }),
        });

        const result = await readResponseJson(generateResponse);
        if (!generateResponse.ok || !result.success || !result.data?.url) {
          const message = result.error?.message || `Screenshot service failed with HTTP ${generateResponse.status}`;
          return {
            content: [{ type: 'text' as const, text: `Error: ${message}` }],
            details: { error: result.error?.code || 'screenshot_failed', status: generateResponse.status },
            isError: true,
          };
        }

        const imageResponse = await fetch(`${serviceUrl}/api/screenshots/file/${projectId}/${demoId}?t=${Date.now()}`);
        if (!imageResponse.ok) {
          return {
            content: [{ type: 'text' as const, text: `Error: screenshot generated but image download failed with HTTP ${imageResponse.status}.` }],
            details: { error: 'image_download_failed', status: imageResponse.status },
            isError: true,
          };
        }

        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const base64 = buffer.toString('base64');
        const sizeKB = Math.round(buffer.length / 1024);

        return {
          content: [
            {
              type: 'text' as const,
              text: `Screenshot captured (${width}x${height}${fullPage ? ', full page' : ''}, ${sizeKB}KB).`,
            },
            {
              type: 'image' as const,
              data: base64,
              mimeType: 'image/png',
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
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message, demoId, workingDir }, 'captureScreenshot failed');
        return {
          content: [{ type: 'text' as const, text: `Error: Failed to capture screenshot: ${message}` }],
          details: { error: 'capture_failed', message },
          isError: true,
        };
      }
    },
  };
}
