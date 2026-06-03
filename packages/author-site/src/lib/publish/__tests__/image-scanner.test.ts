import { extractImageReferences, isLocalPath } from '../image-scanner';

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

  it('提取多种类型引用', () => {
    const content = `
      import hero from "./images/hero.png";
      <img src="./thumbnail.jpg" />
      <div style={{ backgroundImage: "url('./bg.svg')" }} />
    `;
    const refs = extractImageReferences(content, sourceFile);
    expect(refs).toHaveLength(3);
  });
});
