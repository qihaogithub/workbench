import fs from 'fs';
import os from 'os';
import path from 'path';
import dns from 'dns/promises';
import { processImagesForPublish } from '../image-processor';

jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

const lookupMock = dns.lookup as unknown as jest.Mock;

function createWorkspace(): { root: string; workspacePath: string; publishDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-images-'));
  const workspacePath = path.join(root, 'workspace');
  const publishDir = path.join(root, 'published', 'proj_1');
  fs.mkdirSync(path.join(workspacePath, 'demos', 'page_1'), { recursive: true });
  fs.mkdirSync(publishDir, { recursive: true });
  return { root, workspacePath, publishDir };
}

function createFetchResponse(
  body: Buffer | string,
  contentType: string,
): Pick<Response, 'headers' | 'ok' | 'status' | 'arrayBuffer'> {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const arrayBuffer = new ArrayBuffer(buffer.length);
  new Uint8Array(arrayBuffer).set(buffer);
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'content-length') return String(buffer.length);
        return null;
      },
    } as Headers,
    arrayBuffer: async () => arrayBuffer,
  };
}

describe('processImagesForPublish', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 as const }]);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('下载外部图片到发布目录并返回本项目 data URL', async () => {
    const { workspacePath, publishDir } = createWorkspace();
    fs.writeFileSync(
      path.join(workspacePath, 'demos', 'page_1', 'prototype.html'),
      '<img src="https://cdn.example.com/hero.png" />',
      'utf-8',
    );
    global.fetch = jest.fn().mockResolvedValue(
      createFetchResponse(Buffer.from('image-data'), 'image/png'),
    );

    const result = await processImagesForPublish({
      projectId: 'proj_1',
      workspacePath,
      publishDir,
    });

    expect(result.success).toBe(true);
    const replacement = result.urlMap.get('https://cdn.example.com/hero.png');
    expect(replacement).toMatch(/^\/data\/proj_1\/assets\/images\/.+\.png$/);
    expect(fs.existsSync(path.join(publishDir, 'assets', 'images'))).toBe(true);
    expect(fs.readdirSync(path.join(publishDir, 'assets', 'images'))).toHaveLength(1);
  });

  it('外部图片 content-type 非图片时不阻断发布并保留原 URL', async () => {
    const { workspacePath, publishDir } = createWorkspace();
    fs.writeFileSync(
      path.join(workspacePath, 'demos', 'page_1', 'prototype.css'),
      '.hero { background-image: url("https://cdn.example.com/not-image"); }',
      'utf-8',
    );
    global.fetch = jest.fn().mockResolvedValue(
      createFetchResponse('not image', 'text/html'),
    );

    const result = await processImagesForPublish({
      projectId: 'proj_1',
      workspacePath,
      publishDir,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.urlMap.has('https://cdn.example.com/not-image')).toBe(false);
  });

  it('外部图片解析到私网地址时不请求也不阻断发布', async () => {
    const { workspacePath, publishDir } = createWorkspace();
    fs.writeFileSync(
      path.join(workspacePath, 'demos', 'page_1', 'prototype.html'),
      '<img src="https://internal.example.com/secret.png" />',
      'utf-8',
    );
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 as const }]);
    global.fetch = jest.fn();

    const result = await processImagesForPublish({
      projectId: 'proj_1',
      workspacePath,
      publishDir,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.urlMap.has('https://internal.example.com/secret.png')).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
