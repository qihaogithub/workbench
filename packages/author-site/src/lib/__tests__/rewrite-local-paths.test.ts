import {
  rewriteCompiledLocalAssetPaths,
  rewriteLocalAssetPaths,
} from '@/lib/rewrite-local-paths';

describe('rewriteLocalAssetPaths', () => {
  const sessionId = 'test-session-123';
  const basePath = 'demos/demo_abc/';

  describe('基础路径改写', () => {
    it('改写 ./images/xxx.png 单引号', () => {
      const code = `_jsx("img", { src: './images/hero.png' })`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`src: '/api/sessions/${sessionId}/workspace/demos/demo_abc/images/hero.png'`);
    });

    it('改写 ./images/xxx.png 双引号', () => {
      const code = `_jsx("img", { src: "./images/hero.png" })`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`src: "/api/sessions/${sessionId}/workspace/demos/demo_abc/images/hero.png"`);
    });

    it('改写 ../ 上级目录路径', () => {
      const code = `_jsx("img", { src: '../assets/bg.jpg' })`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`src: '/api/sessions/${sessionId}/workspace/demos/assets/bg.jpg'`);
    });

    it('改写 ../../ 向上两级', () => {
      const code = `_jsx("img", { src: '../../images/bg.jpg' })`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`src: '/api/sessions/${sessionId}/workspace/images/bg.jpg'`);
    });

    it('不改写非图片路径', () => {
      const code = `import X from './components/X'`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toBe(code);
    });

    it('不改写绝对路径', () => {
      const code = `_jsx("img", { src: '/images/hero.png' })`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toBe(code);
    });

    it('不改写 http URL', () => {
      const code = `_jsx("img", { src: 'https://cdn.example.com/img.png' })`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toBe(code);
    });
  });

  describe('CSS url() 改写', () => {
    it('改写 url(./xxx.png) 无引号', () => {
      const code = `style: { backgroundImage: 'url(./images/bg.png)' }`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`url(/api/sessions/${sessionId}/workspace/demos/demo_abc/images/bg.png)`);
    });

    it('改写 url(../xxx.jpg) 上级目录', () => {
      const code = `style: { backgroundImage: 'url(../assets/bg.jpg)' }`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`url(/api/sessions/${sessionId}/workspace/demos/assets/bg.jpg)`);
    });

    it('不改写非图片 url()', () => {
      const code = `url(./styles/font.woff)`;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toBe(code);
    });
  });

  describe('模板字符串', () => {
    it('改写模板字符串中的纯图片路径', () => {
      const code = 'const img = `./images/hero.png`';
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`/api/sessions/${sessionId}/workspace/demos/demo_abc/images/hero.png`);
    });
  });

  describe('多图片', () => {
    it('同时改写多个图片路径', () => {
      const code = `
        const a = './images/a.png';
        const b = './images/b.jpg';
        const c = './images/c.webp';
      `;
      const result = rewriteLocalAssetPaths(code, basePath, sessionId);
      expect(result).toContain(`/api/sessions/${sessionId}/workspace/demos/demo_abc/images/a.png`);
      expect(result).toContain(`/api/sessions/${sessionId}/workspace/demos/demo_abc/images/b.jpg`);
      expect(result).toContain(`/api/sessions/${sessionId}/workspace/demos/demo_abc/images/c.webp`);
    });
  });

  describe('编译结果改写', () => {
    it('重新计算模块 hash 且不污染原编译缓存对象', () => {
      const original = {
        compiledCode: `_jsx("img", { src: '../../assets/images/hero.png' })`,
        dependencies: [],
        cssImports: [],
        moduleHash: 'original-hash',
      };

      const rewritten = rewriteCompiledLocalAssetPaths(
        original,
        'demo_abc',
        sessionId,
      );

      expect(rewritten).not.toBe(original);
      expect(rewritten.compiledCode).toContain(
        `/api/sessions/${sessionId}/workspace/assets/images/hero.png`,
      );
      expect(rewritten.moduleHash).toMatch(/^[a-f0-9]{64}$/);
      expect(original.compiledCode).toContain('../../assets/images/hero.png');
      expect(original.moduleHash).toBe('original-hash');
    });

    it('没有页面上下文或没有改写时复用原结果', () => {
      const original = {
        compiledCode: `_jsx("div", { children: 'ok' })`,
        dependencies: [],
        cssImports: [],
        moduleHash: 'original-hash',
      };

      expect(rewriteCompiledLocalAssetPaths(original, undefined, sessionId)).toBe(original);
      expect(rewriteCompiledLocalAssetPaths(original, 'demo_abc', sessionId)).toBe(original);
    });
  });
});
