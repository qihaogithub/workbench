import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { EventEmitter } from 'events';
import { createSaveImageTool } from '../../src/backends/pi-tools/save-image-tool';
import type { AgentConfig } from '../../src/core/types';

vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({ version: 1, images: [] })),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/backends/pi-tools/global-image-store', () => ({
  uploadToGlobalImageStore: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { uploadToGlobalImageStore } from '../../src/backends/pi-tools/global-image-store';

class MockResponse extends EventEmitter {
  statusCode: number;
  headers: Record<string, string>;
  constructor(statusCode: number, headers: Record<string, string>) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
  }
}

class MockRequest extends EventEmitter {
  destroy = vi.fn();
}

const baseConfig: AgentConfig = {
  sessionId: 'test-session',
  workingDir: '/workspace/project-1',
};

function createTool(config: AgentConfig = baseConfig) {
  return createSaveImageTool(config);
}

function mockUploadSuccess(overrides: Record<string, unknown> = {}) {
  vi.mocked(uploadToGlobalImageStore).mockReturnValue({
    success: true,
    imageId: 'img_test123456',
    url: '/api/images/img_test123456',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    filename: 'test.png',
    sizeBytes: 4,
    mimeType: 'image/png',
    deduplicated: false,
    ...overrides,
  });
}

function mockUploadError(error: string) {
  vi.mocked(uploadToGlobalImageStore).mockReturnValue({
    success: false,
    error,
  });
}

describe('createSaveImageTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('参数校验', () => {
    it('非法文件名应被拒绝', async () => {
      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'aW1hZ2U=',
        filename: '../../../etc/passwd',
      } as any);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid filename');
    });

    it('不支持的文件格式应被拒绝', async () => {
      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'aW1hZ2U=',
        filename: 'document.pdf',
      } as any);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unsupported image format');
    });

    it('支持 png/jpg/gif/webp/svg 格式', async () => {
      mockUploadSuccess();
      const formats = ['test.png', 'test.jpg', 'test.jpeg', 'test.gif', 'test.webp', 'test.svg'];
      for (const filename of formats) {
        const tool = createTool();
        const result = await tool.execute('id', {
          source: 'base64',
          data: 'dGVzdA==',
          filename,
        } as any);
        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('Image saved');
      }
    });
  });

  describe('Base64 来源', () => {
    it('应正确解码 Base64 并保存到全局图床', async () => {
      mockUploadSuccess();

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdCBpbWFnZSBkYXRh',
        filename: 'test-image.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/^Image saved: \/api\/images\/img_test/);
      expect(result.details.url).toBe('/api/images/img_test123456');
      expect(result.details.format).toBe('png');
      expect(result.details.source).toBe('base64');
      expect(result.details.imageId).toBe('img_test123456');
      expect(uploadToGlobalImageStore).toHaveBeenCalled();
    });

    it('空 Base64 数据应被拒绝', async () => {
      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: '',
        filename: 'test.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Empty Base64 data');
    });

    it('directory 参数应被忽略（统一保存到全局图床）', async () => {
      mockUploadSuccess();

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
        directory: 'assets/images',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/^Image saved: \/api\/images\/img_test/);
      expect(uploadToGlobalImageStore).toHaveBeenCalled();
    });

    it('缺少项目工作区时应拒绝保存', async () => {
      const tool = createTool({ sessionId: 'test-session' });
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.details.error).toBe('missing_working_dir');
    });
  });

  describe('去重', () => {
    it('相同内容图片应复用已有文件', async () => {
      mockUploadSuccess({ deduplicated: true });

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'duplicate.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('(已存在，复用)');
      expect(result.details.reused).toBe(true);
    });
  });

  describe('文件大小限制', () => {
    it('超过 10MB 的图片应被拒绝', async () => {
      mockUploadError('Image too large (>10MB)');
      const tool = createTool();
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'A');
      const largeData = largeBuffer.toString('base64');

      const result = await tool.execute('id', {
        source: 'base64',
        data: largeData,
        filename: 'large.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('too large');
    });
  });

  describe('URL 来源 (mock)', () => {
    it('非法 URL 格式应被拒绝', async () => {
      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'url',
        data: 'not-a-valid-url',
        filename: 'test.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid URL format');
    });

    it('非 http/https 协议应被拒绝', async () => {
      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'url',
        data: 'file:///etc/passwd',
        filename: 'test.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Only http:// and https://');
    });
  });

  describe('文件写入错误处理', () => {
    it('全局图床上传失败应返回错误', async () => {
      mockUploadError('Disk full');

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'test.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Disk full');
    });
  });

  describe('项目图片清单', () => {
    it('配置了 projectId 时应更新项目 images.json', async () => {
      mockUploadSuccess();

      const tool = createTool({
        ...baseConfig,
        projectId: 'test-project',
        demoId: 'page-1',
      });
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(fs.writeFileSync).toHaveBeenCalled();
      const calls = (fs.writeFileSync as any).mock.calls;
      const projectManifestCall = calls.find((c: any) =>
        String(c[0]).includes('/projects/test-project/images.json')
      );
      expect(projectManifestCall).toBeTruthy();
    });

    it('只有页面 demoId 时不应创建项目 images.json', async () => {
      mockUploadSuccess();
      (fs.existsSync as any).mockImplementation((target: string) => {
        const normalized = String(target).replace(/\\/g, '/');
        return normalized.endsWith('/assets/images');
      });

      const tool = createTool({
        ...baseConfig,
        demoId: 'page-1',
      });
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
      } as any);

      expect(result.isError).toBeFalsy();
      // addProjectImageManifestEntry 不应被调用（因为没有 projectId）
      const calls = (fs.writeFileSync as any).mock.calls;
      const projectManifestCall = calls.find((c: any) =>
        String(c[0]).includes('/projects/')
      );
      expect(projectManifestCall).toBeFalsy();
    });

    it('缺少 projectId 时应从工作区元数据解析项目 images.json', async () => {
      mockUploadSuccess();
      (fs.existsSync as any).mockImplementation((target: string) => {
        const normalized = String(target).replace(/\\/g, '/');
        return (
          normalized.endsWith('/.workspace.json') ||
          normalized.endsWith('/projects/proj_1/project.json')
        );
      });
      (fs.readFileSync as any).mockImplementation((target: string) => {
        const normalized = String(target).replace(/\\/g, '/');
        if (normalized.endsWith('/.workspace.json')) {
          return JSON.stringify({ projectId: 'proj_1' });
        }
        return JSON.stringify({ version: 1, images: [] });
      });

      const tool = createTool({
        ...baseConfig,
        demoId: 'page-1',
      });
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
      } as any);

      expect(result.isError).toBeFalsy();
      const calls = (fs.writeFileSync as any).mock.calls;
      const projectManifestCall = calls.find((c: any) =>
        String(c[0]).includes('/projects/proj_1/images.json')
      );
      expect(projectManifestCall).toBeTruthy();
    });
  });

  describe('受管资产来源', () => {
    it('source=assetId 时应直接复用项目 images.json 中的资产', async () => {
      (fs.existsSync as any).mockImplementation((target: string) => {
        const normalized = String(target).replace(/\\/g, '/');
        return (
          normalized.endsWith('/projects/test-project/images.json') ||
          normalized.endsWith('/workspace/project-1/assets/images/abc123def456-hero.png')
        );
      });
      (fs.readFileSync as any).mockImplementation((target: string) => {
        const normalized = String(target).replace(/\\/g, '/');
        if (normalized.endsWith('/projects/test-project/images.json')) {
          return JSON.stringify({
            images: [
              {
                id: 'abc123def456',
                filename: 'abc123def456-hero.png',
                url: 'assets/images/abc123def456-hero.png',
                size: 16,
                format: 'png',
                createdAt: 1,
                createdBy: 'user',
                contentHash: 'abc123def4567890',
              },
            ],
          });
        }
        return JSON.stringify({ version: 1, images: [] });
      });

      const tool = createTool({ ...baseConfig, projectId: 'test-project' });
      const result = await tool.execute('id', {
        source: 'assetId',
        assetId: 'asset_abc123def456',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.details.path).toBe('assets/images/abc123def456-hero.png');
      expect(result.details.relativePathFromPage).toBe('../../assets/images/abc123def456-hero.png');
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('source=sessionAsset 时应保存到全局图床', async () => {
      mockUploadSuccess();
      (fs.promises.readFile as any).mockResolvedValue(Buffer.from('session-image'));
      (fs.existsSync as any).mockImplementation((target: string) => {
        const normalized = String(target).replace(/\\/g, '/');
        return (
          normalized.endsWith('/sessions/session-1/assets/upload.png') ||
          normalized.endsWith('/projects/test-project/project.json')
        );
      });

      const tool = createTool({ ...baseConfig, projectId: 'test-project' });
      const result = await tool.execute('id', {
        source: 'sessionAsset',
        url: '/api/sessions/session-1/assets/upload.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.details.source).toBe('sessionAsset');
      expect(result.details.url).toBe('/api/images/img_test123456');
      expect(result.details.imageId).toBe('img_test123456');
      expect(fs.promises.readFile).toHaveBeenCalled();
    });
  });
});
