import {
  buildPreviewResourceFingerprint,
  clearPreviewResourceCacheForTests,
  extractPreviewImageUrls,
  getPreviewResourceCacheStats,
  prewarmPreviewImageUrls,
} from "@workbench/demo-ui";

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = "auto";

  set src(value: string) {
    setTimeout(() => {
      if (value.includes("fail")) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    }, 0);
  }

  decode() {
    return Promise.resolve();
  }
}

describe("preview-resource-cache", () => {
  const originalImage = global.Image;

  beforeEach(() => {
    clearPreviewResourceCacheForTests();
    global.Image = MockImage as unknown as typeof Image;
  });

  afterEach(() => {
    clearPreviewResourceCacheForTests();
    global.Image = originalImage;
  });

  it("从配置和代码中提取、归一化并去重图片资源", () => {
    const urls = extractPreviewImageUrls({
      code: 'const a = "./local.svg"; const b = "not-image.txt";',
      configData: {
        hero: "../assets/hero.png",
        icon: "/api/sessions/s1/workspace/icon.jpg",
        remote: "https://cdn.example.com/banner.webp?x=1",
        duplicate: "../assets/hero.png",
      },
      sessionId: "session_1",
      demoId: "page_1",
      origin: "http://localhost:3200",
    });

    expect(urls).toEqual([
      "http://localhost:3200/api/sessions/s1/workspace/icon.jpg",
      "http://localhost:3200/api/sessions/session_1/workspace/demos/assets/hero.png",
      "http://localhost:3200/api/sessions/session_1/workspace/demos/page_1/local.svg",
      "https://cdn.example.com/banner.webp?x=1",
    ]);
  });

  it("资源指纹随图片资源变化而变化", () => {
    const base = {
      pageId: "page_1",
      code: "export default function Demo() { return null; }",
      previewSize: { width: 375, height: 812 },
      sessionId: "session_1",
      demoId: "page_1",
      origin: "http://localhost:3200",
    };

    const first = buildPreviewResourceFingerprint({
      ...base,
      configData: { image: "./a.png" },
    });
    const second = buildPreviewResourceFingerprint({
      ...base,
      configData: { image: "./b.png" },
    });

    expect(first).not.toBe(second);
  });

  it("预热失败不抛出，并按 LRU 限制缓存体积", async () => {
    const urls = Array.from(
      { length: 85 },
      (_, index) => `https://cdn.example.com/${index}.png`,
    );
    urls.push("https://cdn.example.com/fail.png");

    await expect(prewarmPreviewImageUrls(urls)).resolves.toBeUndefined();

    const stats = getPreviewResourceCacheStats();
    expect(stats.size).toBeLessThanOrEqual(80);
    expect(stats.loaded).toBeGreaterThan(0);
  });
});
