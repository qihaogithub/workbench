import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SinglePagePreview } from "./SinglePagePreview";
import type { PreviewStagePage } from "./preview-stage-types";

vi.mock("./IframePreviewFrame", () => ({
  IframePreviewFrame: ({
    src,
    title,
    previewSize,
    configData,
  }: {
    src: string;
    title: string;
    previewSize?: { width?: string | number };
    configData?: Record<string, unknown>;
  }) => (
    <div
      data-testid="iframe-renderer"
      data-src={src}
      data-title={title}
      data-width={previewSize?.width}
      data-theme={configData?.theme}
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

function createPage(
  overrides: Partial<PreviewStagePage> = {},
): PreviewStagePage {
  return {
    id: "page-1",
    name: "页面一",
    order: 0,
    runtimeType: "high-fidelity-react",
    configData: { theme: "dark" },
    previewSize: { width: 960, height: 640 },
    ...overrides,
  };
}

describe("SinglePagePreview", () => {
  it("优先分发发布 iframe 并透传页面公共属性", () => {
    render(
      <SinglePagePreview
        page={createPage({
          iframeUrl: "/published/iframe.html",
          compiledJsUrl: "/published/module.js",
        })}
      />,
    );

    const renderer = screen.getByTestId("iframe-renderer");
    expect(renderer).toHaveAttribute("data-src", "/published/iframe.html");
    expect(renderer).toHaveAttribute("data-title", "页面一");
    expect(renderer).toHaveAttribute("data-width", "960");
    expect(renderer).toHaveAttribute("data-theme", "dark");
    expect(
      screen.queryByTestId("high-fidelity-renderer"),
    ).not.toBeInTheDocument();
  });

  it("按 runtime 分发原型页和草图页", () => {
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
    const sketch = screen.getByTestId("sketch-renderer");
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
});
