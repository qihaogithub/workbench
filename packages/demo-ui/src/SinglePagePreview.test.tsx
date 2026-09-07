import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SinglePagePreview } from "./SinglePagePreview";
import type { PreviewStagePage } from "./preview-stage-types";

vi.mock("./IframePreviewFrame", () => ({
  IframePreviewFrame: ({
    src,
    title,
    previewSize,
    configData,
    visibilityRegions,
  }: {
    src: string;
    title: string;
    previewSize?: { width?: string | number };
    configData?: Record<string, unknown>;
    visibilityRegions?: Record<string, { visible: boolean; enabled: boolean }>;
  }) => (
    <div
      data-testid="iframe-renderer"
      data-src={src}
      data-title={title}
      data-width={previewSize?.width}
      data-theme={configData?.theme}
      data-region-state={JSON.stringify(visibilityRegions)}
    />
  ),
}));

vi.mock("./PrototypePagePreview", () => ({
  PrototypePagePreview: ({
    html,
    css,
    previewSize,
  }: {
    html?: string;
    css?: string;
    previewSize?: { width?: string | number };
  }) => (
    <div
      data-testid="prototype-renderer"
      data-html={html}
      data-css={css}
      data-width={previewSize?.width}
    />
  ),
}));

vi.mock("./SketchPagePreview", () => ({
  SketchPagePreview: ({
    scene,
    fillContainer,
  }: {
    scene?: string;
    fillContainer?: boolean;
  }) => (
    <div
      data-testid="sketch-renderer"
      data-scene={scene}
      data-fill-container={String(fillContainer)}
    />
  ),
}));

vi.mock("./PreviewPanel", () => ({
  PreviewPanel: ({
    code,
    compiledJsUrl,
    demoId,
  }: {
    code?: string;
    compiledJsUrl?: string;
    demoId?: string;
  }) => (
    <div
      data-testid="high-fidelity-renderer"
      data-code={code}
      data-compiled-url={compiledJsUrl}
      data-demo-id={demoId}
    />
  ),
}));

vi.mock("./SandboxedHtmlFrame", () => ({
  SandboxedHtmlFrame: ({ executionUrl, title, heightBehavior }: { executionUrl: string; title: string; heightBehavior?: string }) => (
    <div data-testid="sandbox-renderer" data-url={executionUrl} data-title={title} data-height-behavior={heightBehavior} />
  ),
}));

function createPage(
  overrides: Partial<PreviewStagePage> = {},
): PreviewStagePage {
  return {
    id: "page-1",
    name: "页面一",
    order: 0,
    runtimeType: "high-fidelity-react",
    configData: { theme: "dark" },
    presentation: {
      version: 1,
      mode: "responsive-page",
      viewport: { width: 960, height: 640 },
      heightBehavior: "content",
      preset: "custom",
      source: "user",
    },
    previewSize: { width: 960, height: 640 },
    ...overrides,
  };
}

describe("SinglePagePreview", () => {
  it("编辑态单页预览粘贴 HTML 时请求导入", () => {
    const onRequestPasteHtmlContent = vi.fn();
    const html = "<!doctype html><html><body><main>Figma</main></body></html>";
    render(
      <SinglePagePreview
        page={createPage()}
        onRequestPasteHtmlContent={onRequestPasteHtmlContent}
      />,
    );

    fireEvent.paste(screen.getByTestId("single-page-preview-import-target"), {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? html : ""),
        files: [],
      },
    });

    expect(onRequestPasteHtmlContent).toHaveBeenCalledWith(html);
  });

  it("交互 HTML 显式使用 sandbox renderer，并优先于 iframe URL", () => {
    render(
      <SinglePagePreview
        page={createPage({
          runtimeType: "sandboxed-html" as PreviewStagePage["runtimeType"],
          iframeUrl: "/wrong-trusted-frame.html",
          sandboxExecutionUrl: "/sandbox/execution/opaque-id",
          sandboxChannelId: "channel-1",
          sandboxHtml: "<button>go</button>",
          presentation: {
            version: 1,
            mode: "fixed-canvas",
            viewport: { width: 960, height: 640 },
            heightBehavior: "fixed",
            preset: "custom",
            source: "figma",
          },
        })}
      />,
    );
    expect(screen.getByTestId("sandbox-renderer")).toHaveAttribute(
      "data-url",
      "/sandbox/execution/opaque-id",
    );
    expect(screen.queryByTestId("iframe-renderer")).not.toBeInTheDocument();
    expect(screen.getByTestId("sandbox-renderer")).toHaveAttribute("data-height-behavior", "fixed");
  });
  it("优先分发发布 iframe 并透传页面公共属性", () => {
    render(
      <SinglePagePreview
        page={createPage({
          iframeUrl: "/published/iframe.html",
          compiledJsUrl: "/published/module.js",
          visibilityRegions: {
            "page-1:member-panel": { visible: false, enabled: false },
            "page-2:ignored-panel": { visible: true, enabled: true },
          },
        })}
      />,
    );

    const renderer = screen.getByTestId("iframe-renderer");
    expect(renderer).toHaveAttribute("data-src", "/published/iframe.html");
    expect(renderer).toHaveAttribute("data-title", "页面一");
    expect(renderer).toHaveAttribute("data-width", "960");
    expect(renderer).toHaveAttribute("data-theme", "dark");
    expect(renderer).toHaveAttribute(
      "data-region-state",
      JSON.stringify({ "member-panel": { visible: false, enabled: false } }),
    );
    expect(
      screen.queryByTestId("high-fidelity-renderer"),
    ).not.toBeInTheDocument();
  });

  it("按 runtime 分发原型页和草图页", async () => {
    const { rerender } = render(
      <SinglePagePreview
        page={createPage({
          runtimeType: "prototype-html-css",
          prototypeHtml: "<main>原型</main>",
          prototypeCss: "main { color: red; }",
        })}
      />,
    );

    const prototype = screen.getByTestId("prototype-renderer");
    expect(prototype).toHaveAttribute("data-html", "<main>原型</main>");
    expect(prototype).toHaveAttribute("data-css", "main { color: red; }");
    expect(prototype).toHaveAttribute("data-width", "960");

    rerender(
      <SinglePagePreview
        page={createPage({
          runtimeType: "sketch-scene",
          sketchScene: '{"nodes":[]}',
        })}
      />,
    );
    const sketch = await screen.findByTestId("sketch-renderer");
    expect(sketch).toHaveAttribute("data-scene", '{"nodes":[]}');
    expect(sketch).toHaveAttribute("data-fill-container", "true");
  });

  it("在 compiled module 与创作源码间保持精确回退", () => {
    const { rerender } = render(
      <SinglePagePreview
        page={createPage({
          compiledJsUrl: "/published/module.js",
          code: "export default function Page() {}",
        })}
      />,
    );

    let renderer = screen.getByTestId("high-fidelity-renderer");
    expect(renderer).toHaveAttribute(
      "data-compiled-url",
      "/published/module.js",
    );
    expect(renderer).toHaveAttribute("data-demo-id", "page-1");

    rerender(
      <SinglePagePreview
        page={createPage({
          code: "export default function AuthoringPage() {}",
        })}
      />,
    );
    renderer = screen.getByTestId("high-fidelity-renderer");
    expect(renderer).toHaveAttribute(
      "data-code",
      "export default function AuthoringPage() {}",
    );
    expect(renderer).not.toHaveAttribute("data-compiled-url");
  });

  it("无可渲染页面时使用宿主空状态", () => {
    render(
      <SinglePagePreview
        page={createPage()}
        emptyState={<div>请先创建页面</div>}
      />,
    );

    expect(screen.getByText("请先创建页面")).toBeInTheDocument();
  });

  it("响应宿主控制的页面跳转热区激活状态", () => {
    const page = createPage();
    const { rerender } = render(
      <SinglePagePreview
        page={page}
        navigationEditable
        navigationActive={false}
        showNavigationTool={false}
      />,
    );

    expect(
      screen.queryByLabelText("绘制页面跳转热区"),
    ).not.toBeInTheDocument();

    rerender(
      <SinglePagePreview
        page={page}
        navigationEditable
        navigationActive
        showNavigationTool={false}
      />,
    );

    expect(screen.getByLabelText("绘制页面跳转热区")).toBeInTheDocument();
  });
});
