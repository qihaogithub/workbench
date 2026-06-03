import { replacePathsInContent } from '../path-replacer';

describe('replacePathsInContent', () => {
  const sourceFile = '/workspace/demos/home/index.tsx';
  const urlMap = new Map([
    ['./images/hero.png', 'https://oss.example.com/projects/p1/images/hero-abcd.png'],
    ['./bg.jpg', 'https://oss.example.com/projects/p1/images/bg-efgh.jpg'],
    ['./assets/logo.svg', 'https://oss.example.com/projects/p1/images/logo-ijkl.svg'],
  ]);

  it('替换 <img> 标签中的路径', () => {
    const content = '<img src="./images/hero.png" alt="Hero" />';
    const result = replacePathsInContent(content, urlMap, sourceFile);
    expect(result).toContain('https://oss.example.com/projects/p1/images/hero-abcd.png');
    expect(result).not.toContain('./images/hero.png');
  });

  it('替换 CSS url() 中的路径', () => {
    const content = 'background-image: url("./bg.jpg")';
    const result = replacePathsInContent(content, urlMap, sourceFile);
    expect(result).toContain('url("https://oss.example.com/projects/p1/images/bg-efgh.jpg")');
  });

  it('替换 import 语句中的路径', () => {
    const content = 'import logo from "./assets/logo.svg"';
    const result = replacePathsInContent(content, urlMap, sourceFile);
    expect(result).toContain('https://oss.example.com/projects/p1/images/logo-ijkl.svg');
  });

  it('不在映射中的路径保持不变', () => {
    const content = '<img src="./images/unknown.png" />';
    const result = replacePathsInContent(content, urlMap, sourceFile);
    expect(result).toContain('./images/unknown.png');
  });

  it('已包含 HTTPS 的路径不会被错误替换', () => {
    const content = '<img src="https://cdn.example.com/photo.png" />';
    const result = replacePathsInContent(content, urlMap, sourceFile);
    expect(result).toContain('https://cdn.example.com/photo.png');
  });

  it('空映射不应改变内容', () => {
    const content = '<img src="./images/test.png" />';
    const result = replacePathsInContent(content, new Map(), sourceFile);
    expect(result).toBe(content);
  });
});
