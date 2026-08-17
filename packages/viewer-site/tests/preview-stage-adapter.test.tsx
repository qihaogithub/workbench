import { describe, expect, it } from "vitest";

import type { PublishedDemoPage } from "@/lib/api";
import {
  createPublishedPreviewStagePage,
  resolvePrototypeDataUrls,
} from "@/lib/preview-stage-adapter";

function createPage(
  overrides: Partial<PublishedDemoPage> = {},
): PublishedDemoPage {
  return {
    id: "page-1",
    name: "页面一",
    order: 0,
    parentId: null,
    runtimeType: "high-fidelity-react",
    ...overrides,
  };
}

describe("published preview stage adapter", () => {
  it("高保真页保留发布 iframe 优先与 compiled module 回退", () => {
    const page = createPublishedPreviewStagePage({
      projectId: "project-1",
      page: createPage({
        iframeHtmlPath: "demos/page-1/iframe.html",
        compiledJsPath: "demos/page-1/compiled.js",
      }),
      configData: { theme: "dark" },
      schema: "{}",
    });

    expect(page.iframeUrl).toContain(
      "/data/project-1/demos/page-1/iframe.html",
    );
    expect(page.compiledJsUrl).toContain(
      "/data/project-1/demos/page-1/compiled.js",
    );
    expect(page.configData).toEqual({ theme: "dark" });
    expect(page.schema).toBe("{}");
  });

  it("原型页不携带历史高保真发布入口", () => {
    const page = createPublishedPreviewStagePage({
      projectId: "project-1",
      page: createPage({
        runtimeType: "prototype-html-css",
        iframeHtmlPath: "demos/page-1/iframe.html",
        compiledJsPath: "demos/page-1/compiled.js",
        prototypeHtml: "<main>原型</main>",
        prototypeCss: "main { color: red; }",
      }),
    });

    expect(page.prototypeHtml).toBe("<main>原型</main>");
    expect(page.prototypeCss).toBe("main { color: red; }");
    expect(page.iframeUrl).toBeUndefined();
    expect(page.compiledJsUrl).toBeUndefined();
  });

  it("开发浏览端将原型资源指向数据源，而不是 viewer 自身端口", () => {
    const html = resolvePrototypeDataUrls(
      '<img src="/data/project-1/assets/images/icon.png" />',
      "http://localhost:4200",
    );
    const css = resolvePrototypeDataUrls(
      '.hero { background-image: url("/data/project-1/assets/images/bg.png"); }',
      "http://localhost:4200",
    );

    expect(html).toContain(
      'src="http://localhost:4200/data/project-1/assets/images/icon.png"',
    );
    expect(css).toContain(
      'url("http://localhost:4200/data/project-1/assets/images/bg.png")',
    );
  });

  it("生产同源浏览端保留 /data 资源路径", () => {
    expect(
      resolvePrototypeDataUrls(
        '<img src="/data/project-1/assets/images/icon.png" />',
        "",
      ),
    ).toBe('<img src="/data/project-1/assets/images/icon.png" />');
  });

  it("草图页只序列化草图运行时数据", () => {
    const page = createPublishedPreviewStagePage({
      projectId: "project-1",
      page: createPage({
        runtimeType: "sketch-scene",
        iframeHtmlPath: "demos/page-1/iframe.html",
        sketchScene: {
          version: 1,
          pageSize: { width: 100, height: 100 },
          nodes: [
            {
              id: "rect-1",
              type: "rect",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
            },
          ],
        },
      }),
    });

    expect(page.sketchScene).toContain('"id":"rect-1"');
    expect(page.iframeUrl).toBeUndefined();
    expect(page.compiledJsUrl).toBeUndefined();
  });
});
