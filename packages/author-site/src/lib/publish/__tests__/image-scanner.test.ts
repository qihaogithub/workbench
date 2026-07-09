import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  extractImageReferences,
  isApiImagePath,
  isExternalImageUrl,
  isLocalPath,
  isSessionAssetPath,
  scanImageReferences,
} from '../image-scanner';

describe('isLocalPath', () => {
  it('本地相对路径返回 true', () => {
    expect(isLocalPath('./images/hero.png')).toBe(true);
  });

  it('绝对路径返回 true', () => {
    expect(isLocalPath('/assets/bg.jpg')).toBe(true);
  });

  it('https URL 返回 false', () => {
    expect(isLocalPath('https://example.com/image.png')).toBe(false);
  });

  it('data URI 返回 false', () => {
    expect(isLocalPath('data:image/png;base64,...')).toBe(false);
  });

  it('占位图服务返回 false', () => {
    expect(isLocalPath('https://placehold.co/600x400')).toBe(false);
    expect(isLocalPath('https://placeholder.com/600x400')).toBe(false);
  });

  it('非图片扩展名返回 false', () => {
    expect(isLocalPath('./styles/main.css')).toBe(false);
    expect(isLocalPath('./data.json')).toBe(false);
  });

  it('支持 png/jpg/gif/webp/svg', () => {
    expect(isLocalPath('photo.png')).toBe(true);
    expect(isLocalPath('photo.jpg')).toBe(true);
    expect(isLocalPath('photo.jpeg')).toBe(true);
    expect(isLocalPath('photo.gif')).toBe(true);
    expect(isLocalPath('photo.webp')).toBe(true);
    expect(isLocalPath('photo.svg')).toBe(true);
  });

  it('/api/images/ 路径返回 false（属于图床路径，不是本地路径）', () => {
    expect(isLocalPath('/api/images/a1b2c3d4-hero.png')).toBe(false);
  });
});

describe('isApiImagePath', () => {
  it('/api/images/ 路径返回 true', () => {
    expect(isApiImagePath('/api/images/a1b2c3d4-hero.png')).toBe(true);
    expect(isApiImagePath('/api/images/abc123-photo.jpg')).toBe(true);
  });

  it('非 /api/images/ 前缀返回 false', () => {
    expect(isApiImagePath('./images/hero.png')).toBe(false);
    expect(isApiImagePath('/assets/bg.jpg')).toBe(false);
    expect(isApiImagePath('https://example.com/image.png')).toBe(false);
  });

  it('/api/images/ 路径但无图片扩展名返回 false', () => {
    expect(isApiImagePath('/api/images/data.json')).toBe(false);
  });
});

describe('isSessionAssetPath', () => {
  it('/api/sessions/:id/assets 图片路径返回 true', () => {
    expect(isSessionAssetPath('/api/sessions/session-1/assets/popup.png')).toBe(true);
    expect(isSessionAssetPath('/api/sessions/session-1/assets/popup.webp?x=1')).toBe(true);
  });

  it('非图片会话资源返回 false', () => {
    expect(isSessionAssetPath('/api/sessions/session-1/assets/popup.json')).toBe(false);
    expect(isSessionAssetPath('/api/images/popup.png')).toBe(false);
  });
});

describe('isExternalImageUrl', () => {
  it('HTTP/HTTPS URL 返回 true', () => {
    expect(isExternalImageUrl('https://cdn.example.com/image.png')).toBe(true);
    expect(isExternalImageUrl('http://cdn.example.com/image')).toBe(true);
  });

  it('非 HTTP 图片 URL 返回 false', () => {
    expect(isExternalImageUrl('./images/hero.png')).toBe(false);
    expect(isExternalImageUrl('data:image/png;base64,...')).toBe(false);
  });
});

describe('extractImageReferences', () => {
  const sourceFile = '/workspace/demos/home/index.tsx';

  it('提取 <img> 标签中的本地图片', () => {
    const content = '<img src="./images/hero.png" alt="Hero" />';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: './images/hero.png',
      type: 'img-src',
    });
  });

  it('提取 <img> 标签中的图床图片', () => {
    const content = '<img src="/api/images/a1b2c3d4-hero.png" alt="Hero" />';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: '/api/images/a1b2c3d4-hero.png',
      type: 'img-src',
    });
    expect(refs[0].absolutePath.replace(/\\/g, '/')).toContain('data/images/a1b2c3d4-hero.png');
  });

  it('提取 CSS url() 中的图床图片', () => {
    const content = 'style={{ backgroundImage: "url(\'/api/images/abc123-bg.jpg\')" }}';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: '/api/images/abc123-bg.jpg',
      type: 'css-url',
    });
  });

  it('提取 CSS url() 中的本地图片', () => {
    const content = 'style={{ backgroundImage: "url(\'./bg.jpg\')" }}';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: './bg.jpg',
      type: 'css-url',
    });
  });

  it('提取 import 语句中的图片', () => {
    const content = 'import logo from "./assets/logo.svg"';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: './assets/logo.svg',
      type: 'import',
    });
  });

  it('提取 HTTPS 图片 URL', () => {
    const content = '<img src="https://cdn.example.com/photo.png" />';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: 'https://cdn.example.com/photo.png',
      absolutePath: 'https://cdn.example.com/photo.png',
      type: 'external-url',
    });
  });

  it('提取配置字符串中的 HTTPS 图片 URL', () => {
    const content = '{"default": "https://cdn.example.com/config-hero.webp"}';
    const refs = extractImageReferences(content, '/workspace/project.config.schema.json');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: 'https://cdn.example.com/config-hero.webp',
      type: 'external-url',
    });
  });

  it('提取配置值字符串中的会话图片 URL', () => {
    const content = '{"modalImage": "/api/sessions/session-1/assets/popup.png"}';
    const refs = extractImageReferences(content, '/workspace/project.config.values.json');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      originalPath: '/api/sessions/session-1/assets/popup.png',
      type: 'img-src',
    });
  });

  it('跳过 data URI 图片', () => {
    const content = '<img src="data:image/png;base64,iVBOR..." />';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(0);
  });

  it('提取多种类型引用（含图床路径）', () => {
    const content = `
      import hero from "./images/hero.png";
      <img src="./thumbnail.jpg" />
      <img src="/api/images/a1b2c3d4-product.png" />
      <img src="https://cdn.example.com/banner.webp" />
      <div style={{ backgroundImage: "url('./bg.svg')" }} />
    `;
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(5);
  });
});

describe('scanImageReferences', () => {
  it('扫描 workspace 根目录的项目级配置值图片', () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'image-scan-'));
    try {
      fs.mkdirSync(path.join(workspacePath, 'demos'), { recursive: true });
      fs.writeFileSync(
        path.join(workspacePath, 'project.config.values.json'),
        JSON.stringify({ modalImage: 'https://cdn.example.com/shared-popup.png' }),
        'utf-8',
      );

      const refs = scanImageReferences(workspacePath);
      expect(refs).toContainEqual(expect.objectContaining({
        originalPath: 'https://cdn.example.com/shared-popup.png',
        sourceFile: path.join(workspacePath, 'project.config.values.json'),
      }));
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  it('项目级运行值覆盖 schema default 时不再扫描旧默认图片', () => {
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'image-scan-'));
    try {
      fs.mkdirSync(path.join(workspacePath, 'demos'), { recursive: true });
      fs.writeFileSync(
        path.join(workspacePath, 'project.config.schema.json'),
        JSON.stringify({
          type: 'object',
          properties: {
            modalImage: {
              type: 'string',
              default: 'https://cdn.example.com/old-popup.png',
            },
            untouchedImage: {
              type: 'string',
              default: 'https://cdn.example.com/kept-default.webp',
            },
          },
        }),
        'utf-8',
      );
      fs.writeFileSync(
        path.join(workspacePath, 'project.config.values.json'),
        JSON.stringify({
          modalImage: '/api/sessions/session-1/assets/new-popup.png',
        }),
        'utf-8',
      );

      const refs = scanImageReferences(workspacePath);
      expect(refs).toContainEqual(expect.objectContaining({
        originalPath: '/api/sessions/session-1/assets/new-popup.png',
        sourceFile: path.join(workspacePath, 'project.config.values.json'),
      }));
      expect(refs).toContainEqual(expect.objectContaining({
        originalPath: 'https://cdn.example.com/kept-default.webp',
        sourceFile: path.join(workspacePath, 'project.config.schema.json'),
      }));
      expect(refs).not.toContainEqual(expect.objectContaining({
        originalPath: 'https://cdn.example.com/old-popup.png',
      }));
    } finally {
      fs.rmSync(workspacePath, { recursive: true, force: true });
    }
  });
});
