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
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(JSON.stringify({ images: [] })),
  writeFileSync: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

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
};

function createTool(config: AgentConfig = baseConfig) {
  return createSaveImageTool(config);
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
      const formats = ['test.png', 'test.jpg', 'test.jpeg', 'test.gif', 'test.webp', 'test.svg'];
      for (const filename of formats) {
        (fs.promises.mkdir as any).mockResolvedValue(undefined);
        (fs.promises.writeFile as any).mockResolvedValue(undefined);

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
    it('应正确解码并保存 Base64 图片，返回绝对 URL', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockResolvedValue(undefined);

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdCBpbWFnZSBkYXRh',
        filename: 'test-image.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toMatch(/^Image saved: \/api\/images\/[a-f0-9]{12}-test-image\.png$/);
      expect(result.details.format).toBe('png');
      expect(result.details.source).toBe('base64');
      expect(result.details.sha256).toHaveLength(12);
      expect(fs.promises.writeFile).toHaveBeenCalled();
      const writeCall = (fs.promises.writeFile as any).mock.calls[0];
      expect(String(writeCall[0]).replace(/\\/g, '/')).toMatch(/images\/[a-f0-9]{12}-test-image\.png$/);
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

    it('directory 参数应被忽略（图床统一存储）', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockResolvedValue(undefined);

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
        directory: 'assets/images',
      } as any);

      expect(result.isError).toBeFalsy();
      const writeCall = (fs.promises.writeFile as any).mock.calls[0];
      expect(String(writeCall[0]).replace(/\\/g, '/')).toMatch(/images\/[a-f0-9]{12}-hero\.png$/);
    });
  });

  describe('去重', () => {
    it('相同内容图片应复用已有文件', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockResolvedValue(undefined);
      (fs.existsSync as any).mockReturnValue(true);

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'duplicate.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(result.content[0].text).toContain('Image saved');
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('文件大小限制', () => {
    it('超过 10MB 的图片应被拒绝', async () => {
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
    it('写入失败应返回错误', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockRejectedValue(new Error('Disk full'));
      (fs.existsSync as any).mockReturnValue(false);

      const tool = createTool();
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'test.png',
      } as any);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error saving image');
    });
  });

  describe('项目图片清单', () => {
    it('配置了 demoId 时应更新 images.json', async () => {
      (fs.promises.mkdir as any).mockResolvedValue(undefined);
      (fs.promises.writeFile as any).mockResolvedValue(undefined);

      const tool = createTool({
        ...baseConfig,
        demoId: 'test-project',
      });
      const result = await tool.execute('id', {
        source: 'base64',
        data: 'dGVzdA==',
        filename: 'hero.png',
      } as any);

      expect(result.isError).toBeFalsy();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });
});
