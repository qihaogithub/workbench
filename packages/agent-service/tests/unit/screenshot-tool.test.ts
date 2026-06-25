import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCaptureScreenshotTool } from '../../src/backends/pi-tools/screenshot-tool';

describe('createCaptureScreenshotTool', () => {
  const originalFetch = global.fetch;
  const originalScreenshotServiceUrl = process.env.SCREENSHOT_SERVICE_URL;
  const tempDirs: string[] = [];

  afterEach(async () => {
    global.fetch = originalFetch;
    if (originalScreenshotServiceUrl === undefined) {
      delete process.env.SCREENSHOT_SERVICE_URL;
    } else {
      process.env.SCREENSHOT_SERVICE_URL = originalScreenshotServiceUrl;
    }
    vi.restoreAllMocks();

    for (const dir of tempDirs.splice(0)) {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });

  async function createWorkspace() {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'owb-shot-'));
    tempDirs.push(root);
    const workingDir = path.join(root, 'data', 'sessions', 'proj_test', 'session_test');
    const demoDir = path.join(workingDir, 'demos', 'demo_test');
    await fs.promises.mkdir(demoDir, { recursive: true });
    await fs.promises.writeFile(path.join(demoDir, 'index.tsx'), 'export default function Demo(){ return <div /> }', 'utf-8');
    await fs.promises.writeFile(
      path.join(demoDir, 'config.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: {
          title: { type: 'string', default: 'Hello' },
        },
      }),
      'utf-8',
    );
    return workingDir;
  }

  it('应调用截图服务并返回图片内容', async () => {
    const workingDir = await createWorkspace();
    process.env.SCREENSHOT_SERVICE_URL = 'http://shot.local/';
    const png = Buffer.from('png-bytes');

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          success: true,
          data: { url: '/api/screenshots/file/proj_test/demo_test', hash: 'abc', elapsed: 12, cached: false },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
      .mockResolvedValueOnce(
        new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } }),
      );
    global.fetch = fetchMock;

    const tool = createCaptureScreenshotTool({
      sessionId: 'session_test',
      workingDir,
      demoId: 'demo_test',
    });

    const result = await tool.execute('tool_call_1', { width: 400, height: 800, fullPage: true });

    expect(result.isError).toBeFalsy();
    expect(result.content[1]).toEqual({
      type: 'image',
      data: png.toString('base64'),
      mimeType: 'image/png',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://shot.local/api/screenshots/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"fullPage":true'),
      }),
    );
  });

  it('缺少页面代码文件时应返回错误', async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'owb-shot-'));
    tempDirs.push(root);
    const workingDir = path.join(root, 'data', 'sessions', 'proj_test', 'session_test');

    const tool = createCaptureScreenshotTool({
      sessionId: 'session_test',
      workingDir,
      demoId: 'missing_demo',
    });

    const result = await tool.execute('tool_call_1', {});

    expect(result.isError).toBe(true);
    expect(result.details).toEqual(expect.objectContaining({ error: 'code_file_not_found' }));
  });
});
