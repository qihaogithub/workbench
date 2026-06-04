import { extractImageReferences, isLocalPath, isApiImagePath } from '../image-scanner';

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
    expect(refs[0].absolutePath).toContain('data/images/a1b2c3d4-hero.png');
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

  it('跳过 HTTPS 图片 URL', () => {
    const content = '<img src="https://cdn.example.com/photo.png" />';
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(0);
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
      <div style={{ backgroundImage: "url('./bg.svg')" }} />
    `;
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(4);
  });
});
