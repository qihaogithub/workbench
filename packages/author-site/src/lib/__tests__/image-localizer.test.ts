import fs from "fs";
import os from "os";
import path from "path";

describe("image-localizer", () => {
  let dataDir: string;
  let localizer: typeof import("@/lib/image-localizer");

  const png1x1Base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ow-img-localizer-"));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    jest.restoreAllMocks();
    Reflect.deleteProperty(global, "fetch");
  });

  async function loadLocalizer() {
    localizer = await import("@/lib/image-localizer");
  }

  describe("extractImageReferences", () => {
    beforeEach(async () => {
      await loadLocalizer();
    });

    it("提取 <img src> 中的外部 URL", () => {
      const html = `<img src="https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/abc.png" />`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual([
        "https://figma-alpha-api.s3.us-west-2.amazonaws.com/images/abc.png",
      ]);
    });

    it("提取 <img src> 中的 base64 图片", () => {
      const html = `<img src="data:image/png;base64,iVBORw0KGgo=" />`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
    });

    it("提取 <source srcset> 中的第一个 URL", () => {
      const html = `<source srcset="https://cdn.example.com/img.png 1x, https://cdn.example.com/img@2x.png 2x">`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toContain("https://cdn.example.com/img.png");
    });

    it("提取 SVG <image href> 中的 URL", () => {
      const html = `<svg><image href="https://figma.com/img.svg" /></svg>`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual(["https://figma.com/img.svg"]);
    });

    it("提取 style 中 url() 的图片 URL", () => {
      const html = `<div style="background-image: url(https://cdn.example.com/bg.jpg)"></div>`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual(["https://cdn.example.com/bg.jpg"]);
    });

    it("提取 <style> 块中 url() 的图片 URL", () => {
      const html = `<style>.bg { background: url(https://cdn.example.com/bg.png); }</style>`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual(["https://cdn.example.com/bg.png"]);
    });

    it("忽略本地相对路径", () => {
      const html = `<img src="./images/local.png" /><img src="../assets/img.jpg" />`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual([]);
    });

    it("忽略本站绝对路径", () => {
      const html = `<img src="/api/images/img_abc" />`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual([]);
    });

    it("去重：同一 URL 只出现一次", () => {
      const html = `
        <img src="https://cdn.example.com/img.png" />
        <img src="https://cdn.example.com/img.png" />
        <div style="background: url(https://cdn.example.com/img.png)"></div>
      `;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual(["https://cdn.example.com/img.png"]);
    });

    it("从 Figma CDN 提取 URL", () => {
      const html = `<img src="https://s3-us-west-2.amazonaws.com/images.figma.com/uploads/abc123/image.png" />`;
      const refs = localizer.extractImageReferences(html);
      expect(refs).toEqual([
        "https://s3-us-west-2.amazonaws.com/images.figma.com/uploads/abc123/image.png",
      ]);
    });
  });

  describe("localizeHtmlImages", () => {
    function mockFetchSuccess(contentType = "image/png") {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(
        ((_input: RequestInfo | URL, _init?: RequestInit) => {
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () =>
              Promise.resolve(Buffer.from(png1x1Base64, "base64").buffer),
            headers: new Map([["content-type", contentType]]),
          });
        }) as unknown as typeof fetch,
      );
    }

    function mockFetchFail(status: number) {
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(
        ((_input: RequestInfo | URL, _init?: RequestInit) => {
          return Promise.resolve({ ok: false, status, headers: new Map() });
        }) as unknown as typeof fetch,
      );
    }

    beforeEach(async () => {
      await loadLocalizer();
    });

    it("无图片的 HTML 直接返回原内容", async () => {
      const html = "<html><body>Hello</body></html>";
      const result = await localizer.localizeHtmlImages(html, "test-project");
      expect(result.html).toBe(html);
      expect(result.result.total).toBe(0);
      expect(result.result.succeeded).toBe(0);
      expect(result.result.failed).toBe(0);
    });

    it("成功下载并替换外部 URL", async () => {
      mockFetchSuccess();

      const html = `<img src="https://cdn.example.com/img.png" />`;
      const result = await localizer.localizeHtmlImages(html, "test-project");

      expect(result.result.total).toBe(1);
      expect(result.result.succeeded).toBe(1);
      expect(result.result.failed).toBe(0);
      expect(result.html).toContain(`<img src="/api/images/img_`);
      expect(result.html).not.toContain("https://cdn.example.com/img.png");
      expect(
        fs.existsSync(path.join(dataDir, "image-store", "blobs")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(dataDir, "image-store", "manifest.json")),
      ).toBe(true);
    });

    it("成功解码并替换 Base64 图片", async () => {
      const dataUri = `data:image/png;base64,${png1x1Base64}`;
      const html = `<img src="${dataUri}" />`;
      const result = await localizer.localizeHtmlImages(html, "test-project");

      expect(result.result.total).toBe(1);
      expect(result.result.succeeded).toBe(1);
      expect(result.result.failed).toBe(0);
      expect(result.html).toContain(`<img src="/api/images/img_`);
      expect(result.html).not.toContain(dataUri);
    });

    it("多张图片并行下载并按并发限制分批", async () => {
      mockFetchSuccess();

      const urls = Array.from(
        { length: 7 },
        (_, i) => `https://cdn.example.com/img${i}.png`,
      );
      const images = urls.map((url) => `<img src="${url}" />`).join("\n");
      const html = `<html><body>${images}</body></html>`;
      const result = await localizer.localizeHtmlImages(html, "test-project");

      expect(result.result.total).toBe(7);
      expect(result.result.succeeded).toBe(7);
      expect(result.result.failed).toBe(0);
      for (const url of urls) {
        expect(result.html).not.toContain(url);
      }
    });

    it("下载失败时保留原 URL", async () => {
      mockFetchFail(403);

      const html = `<img src="https://cdn.example.com/forbidden.png" />`;
      const result = await localizer.localizeHtmlImages(html, "test-project");

      expect(result.result.total).toBe(1);
      expect(result.result.succeeded).toBe(0);
      expect(result.result.failed).toBe(1);
      expect(result.result.failures[0].originalUrl).toBe(
        "https://cdn.example.com/forbidden.png",
      );
      expect(result.result.failures[0].reason).toContain("403");
      expect(result.html).toBe(html);
    });

    it("部分成功时替换成功图片并保留失败图片", async () => {
      let callCount = 0;
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(
        ((_input: RequestInfo | URL, _init?: RequestInit) => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              status: 200,
              arrayBuffer: () =>
                Promise.resolve(Buffer.from(png1x1Base64, "base64").buffer),
              headers: new Map([["content-type", "image/png"]]),
            });
          }
          return Promise.resolve({
            ok: false,
            status: 500,
            headers: new Map(),
          });
        }) as unknown as typeof fetch,
      );

      const originalHtml = [
        `<img src="https://cdn.example.com/ok.png" />`,
        `<img src="https://cdn.example.com/fail.png" />`,
      ].join("\n");

      const result = await localizer.localizeHtmlImages(
        originalHtml,
        "test-project",
      );

      expect(result.result.total).toBe(2);
      expect(result.result.succeeded).toBe(1);
      expect(result.result.failed).toBe(1);
      expect(result.html).toContain("/api/images/img_");
      expect(result.html).toContain("https://cdn.example.com/fail.png");
      expect(result.html).not.toContain("https://cdn.example.com/ok.png");
    });

    it("SHA-256 去重：相同内容不重复存储", async () => {
      mockFetchSuccess();

      const html = [
        `<img src="https://cdn.example.com/img1.png" />`,
        `<img src="https://cdn.example.com/img2.png" />`,
      ].join("\n");
      const result = await localizer.localizeHtmlImages(html, "test-project");

      expect(result.result.total).toBe(2);
      expect(result.result.succeeded).toBe(2);

      const blobFiles = fs.readdirSync(
        path.join(dataDir, "image-store", "blobs"),
      );
      expect(blobFiles.length).toBe(1);
    });

    it("不同 URL 指向不同内容分开存储", async () => {
      const mockBody1 = Buffer.from("different-content-a-12345abcde");
      const mockBody2 = Buffer.from("different-content-b-67890vwxyz");

      let callCount = 0;
      (global as unknown as { fetch: typeof fetch }).fetch = jest.fn(
        ((_input: RequestInfo | URL, _init?: RequestInit) => {
          callCount++;
          const buffer = callCount === 1 ? mockBody1 : mockBody2;
          return Promise.resolve({
            ok: true,
            status: 200,
            arrayBuffer: () => Promise.resolve(buffer.buffer),
            headers: new Map([["content-type", "image/png"]]),
          });
        }) as unknown as typeof fetch,
      );

      const html = `
        <img src="https://cdn.example.com/a.png" />
        <img src="https://cdn.example.com/b.png" />
      `;
      const result = await localizer.localizeHtmlImages(html, "test-project");

      expect(result.result.succeeded).toBe(2);
      expect(result.result.failed).toBe(0);
      expect(result.html).not.toContain("https://cdn.example.com/a.png");
      expect(result.html).not.toContain("https://cdn.example.com/b.png");
      expect(result.html).toMatch(/\/api\/images\/img_/g);
    });
  });
});
