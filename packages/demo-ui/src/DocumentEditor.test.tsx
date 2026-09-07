import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { DocumentEditor } from "./DocumentEditor";

if (!Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: () => [],
  });
}
if (!Range.prototype.getBoundingClientRect) {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
    }),
  });
}

describe("DocumentEditor（Milkdown 集成）", () => {
  it("挂载并实时渲染 Markdown 为富文本", async () => {
    const onChange = vi.fn();
    render(
      <DocumentEditor
        value="# 标题\n\n这是**加粗**正文。"
        onChange={onChange}
      />,
    );

    await waitFor(() => {
      expect(document.querySelector("h1")).toBeTruthy();
    });

    expect(document.querySelector("h1")?.tagName).toBe("H1");
    expect(document.body.textContent).toContain("标题");
    expect(document.body.textContent).toContain("加粗");
    expect(
      document.querySelector("[data-document-editor='crepe']"),
    ).toBeTruthy();
    expect(document.querySelector(".crepe")).toBeTruthy();
    expect(document.querySelector(".document-editor-overlays")).toBeTruthy();
    expect(document.querySelector(".document-selection-toolbar")).toBeTruthy();
    await waitFor(() => {
      expect(
        document.querySelectorAll("[data-block-handle-trigger]"),
      ).toHaveLength(1);
      expect(document.querySelectorAll(".document-insert-menu")).toHaveLength(
        1,
      );
      expect(
        document.querySelectorAll(".document-topbar-heading-menu"),
      ).toHaveLength(1);
      expect(
        document.querySelectorAll(".document-selection-heading-menu"),
      ).toHaveLength(1);
    });
    expect(document.querySelector(".operation-item")).toBeNull();
  });

  it("StrictMode 重挂载后只保留一个可编辑正文并恢复焦点", async () => {
    render(
      <StrictMode>
        <DocumentEditor value="StrictMode 正文" onChange={() => {}} autoFocus />
      </StrictMode>,
    );

    await waitFor(() => {
      const editor = document.querySelector<HTMLElement>(".ProseMirror");
      expect(document.querySelectorAll(".ProseMirror")).toHaveLength(1);
      expect(editor).toHaveAttribute("contenteditable", "true");
      expect(document.activeElement).toBe(editor);
    });
  });

  it("外部 value 更新时同步到现有编辑器", async () => {
    const { rerender } = render(
      <DocumentEditor value="# 初始标题" onChange={() => {}} />,
    );

    await waitFor(() => {
      expect(document.body.textContent).toContain("初始标题");
    });

    rerender(<DocumentEditor value="# 更新标题" onChange={() => {}} />);

    await waitFor(() => {
      expect(document.body.textContent).toContain("更新标题");
    });
    expect(document.body.textContent).not.toContain("初始标题");
  });

  it("编辑器尚未完成初始化时也能安全同步外部 value", async () => {
    const { rerender } = render(
      <DocumentEditor value="初始内容" onChange={() => {}} />,
    );

    // The first render starts Crepe asynchronously. Updating the controlled
    // value before that promise settles must wait for the ready editor rather
    // than calling an action against a context without editorViewCtx.
    rerender(<DocumentEditor value="更新内容" onChange={() => {}} />);

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")?.textContent).toContain(
        "更新内容",
      );
    });
  });

  it("结构性外部更新不会构造非法开放 Slice", async () => {
    const { rerender } = render(
      <DocumentEditor value={"第一段\n\n第二段"} onChange={() => {}} />,
    );

    const editor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".ProseMirror");
      expect(element).toBeTruthy();
      expect(element?.textContent).toContain("第二段");
      return element!;
    });

    rerender(<DocumentEditor value="第一段" onChange={() => {}} />);

    await waitFor(() => {
      expect(editor.textContent).toContain("第一段");
      expect(editor.textContent).not.toContain("第二段");
    });
  }, 15_000);

  it("外部内容更新不会回写成新的自动保存变更", async () => {
    const onChange = vi.fn();
    const initial = "这是需要继续编辑的一段正文。";
    const { rerender } = render(
      <DocumentEditor value={initial} onChange={onChange} />,
    );

    const editor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".ProseMirror");
      expect(element).toBeTruthy();
      return element!;
    });
    await waitFor(() => expect(editor.textContent).toContain("继续编辑"));
    onChange.mockClear();

    rerender(<DocumentEditor value={`前缀：${initial}`} onChange={onChange} />);

    await waitFor(() => expect(editor.textContent).toContain("前缀："));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("相同 Markdown 的父级重渲染保持当前光标位置", async () => {
    const value = "这是一段足够长的正文，用于放置光标。";
    const { rerender } = render(
      <DocumentEditor value={value} onChange={() => {}} />,
    );
    const editor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".ProseMirror");
      expect(element).toBeTruthy();
      return element!;
    });
    const textNode = editor.querySelector("p")?.firstChild;
    expect(textNode).toBeTruthy();

    const selection = window.getSelection();
    expect(selection).toBeTruthy();
    const range = document.createRange();
    range.setStart(textNode!, 10);
    range.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(range);
    const { anchorNode, anchorOffset } = selection!;

    rerender(<DocumentEditor value={value} onChange={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(selection!.anchorNode).toBe(anchorNode);
    expect(selection!.anchorOffset).toBe(anchorOffset);
  });

  it("空内容时显示占位提示", async () => {
    render(
      <DocumentEditor value="" onChange={() => {}} placeholder="输入内容..." />,
    );

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeTruthy();
    });
    expect(
      document
        .querySelector(".crepe-placeholder")
        ?.getAttribute("data-placeholder"),
    ).toBe("输入内容...");
  });

  it("只读模式不渲染占位", async () => {
    render(
      <DocumentEditor
        value="正文"
        onChange={() => {}}
        readOnly
        placeholder="不要显示"
      />,
    );

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeTruthy();
    });
    expect(document.querySelector("[data-placeholder='不要显示']")).toBeNull();
    expect(
      document.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    ).toBe("false");
  });

  it("在根节点暴露只读状态供原生 TopBar 样式切换", async () => {
    const { rerender } = render(
      <DocumentEditor value="正文" onChange={() => {}} />,
    );

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeTruthy();
    });
    expect(
      document
        .querySelector("[data-document-editor='crepe']")
        ?.getAttribute("data-readonly"),
    ).toBe("false");

    rerender(<DocumentEditor value="正文" onChange={() => {}} readOnly />);

    expect(
      document
        .querySelector("[data-document-editor='crepe']")
        ?.getAttribute("data-readonly"),
    ).toBe("true");
  });

  it("按持久化目标宽度渲染图片，并把窄容器适配交给 CSS 上限", async () => {
    render(
      <DocumentEditor
        value={'![width:360](/api/images/example.png "示例图片")'}
        onChange={() => {}}
      />,
    );

    const wrapper = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        ".milkdown-image-block .image-wrapper",
      );
      expect(element).toBeTruthy();
      return element!;
    });

    expect(wrapper.style.width).toBe("min(360px, 100%)");
    expect(wrapper.querySelector("img")?.style.width).toBe("100%");
  });

  it("粘贴外网图片时先调用图床本地化处理器", async () => {
    const localizeRemoteImage = vi
      .fn()
      .mockResolvedValue("/api/images/img_local");
    render(
      <DocumentEditor
        value=""
        onChange={() => {}}
        localizeRemoteImage={localizeRemoteImage}
      />,
    );

    const editor = await waitFor(() => {
      const element = document.querySelector(".ProseMirror");
      expect(element).toBeTruthy();
      return element!;
    });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/html"
            ? '<img src="https://cdn.example.com/hero.png">'
            : "",
      },
    });
    editor.dispatchEvent(event);

    await waitFor(() => {
      expect(localizeRemoteImage).toHaveBeenCalledWith(
        "https://cdn.example.com/hero.png",
      );
    });
  });

  it("富文本粘贴在本地化立即返回时替换编辑器当前 Markdown", async () => {
    const localizeRemoteImage = vi
      .fn()
      .mockResolvedValue("/api/images/hero-local.png");
    const onChange = vi.fn();
    render(
      <DocumentEditor
        value=""
        onChange={onChange}
        localizeRemoteImage={localizeRemoteImage}
      />,
    );

    const editor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".ProseMirror");
      expect(element).toBeTruthy();
      return element!;
    });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/html"
            ? '<article><h2>文章标题</h2><p>正文内容</p><img src="https://cdn.example.com/hero.png"></article>'
            : "",
      },
    });
    editor.dispatchEvent(event);

    await waitFor(() => {
      expect(localizeRemoteImage).toHaveBeenCalledWith(
        "https://cdn.example.com/hero.png",
      );
    });
    await waitFor(() => {
      const markdown = onChange.mock.calls.at(-1)?.[0] as string | undefined;
      expect(markdown).toContain("/api/images/hero-local.png");
      expect(markdown).not.toContain("https://cdn.example.com/hero.png");
    });
  });

  it("只读编辑器粘贴外链图片时不调用本地化处理器", async () => {
    const localizeRemoteImage = vi
      .fn()
      .mockResolvedValue("/api/images/should-not-use.png");
    render(
      <DocumentEditor
        value="正文"
        onChange={() => {}}
        readOnly
        localizeRemoteImage={localizeRemoteImage}
      />,
    );
    const editor = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(".ProseMirror");
      expect(element).toBeTruthy();
      return element!;
    });
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        getData: (type: string) =>
          type === "text/html"
            ? '<img src="https://cdn.example.com/hero.png">'
            : "",
      },
    });
    editor.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(localizeRemoteImage).not.toHaveBeenCalled();
  });
});
