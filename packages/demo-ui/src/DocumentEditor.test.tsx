import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DocumentEditor } from "./DocumentEditor";

describe("DocumentEditor（Milkdown 集成）", () => {
  it("挂载并实时渲染 Markdown 为富文本", async () => {
    const onChange = vi.fn();
    render(
      <DocumentEditor value="# 标题\n\n这是**加粗**正文。" onChange={onChange} />,
    );

    await waitFor(() => {
      expect(document.querySelector("h1")).toBeTruthy();
    });

    expect(document.querySelector("h1")?.tagName).toBe("H1");
    expect(document.body.textContent).toContain("标题");
    expect(document.body.textContent).toContain("加粗");
    expect(document.querySelector("[data-document-editor='crepe']")).toBeTruthy();
    expect(document.querySelector(".crepe")).toBeTruthy();
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

  it("空内容时显示占位提示", async () => {
    render(<DocumentEditor value="" onChange={() => {}} placeholder="输入内容..." />);

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
      <DocumentEditor value="正文" onChange={() => {}} readOnly placeholder="不要显示" />,
    );

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeTruthy();
    });
    expect(document.querySelector("[data-placeholder='不要显示']")).toBeNull();
    expect(document.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe(
      "false",
    );
  });

  it("在根节点暴露只读状态供原生 TopBar 样式切换", async () => {
    const { rerender } = render(
      <DocumentEditor value="正文" onChange={() => {}} />,
    );

    await waitFor(() => {
      expect(document.querySelector(".ProseMirror")).toBeTruthy();
    });
    expect(
      document.querySelector("[data-document-editor='crepe']")?.getAttribute(
        "data-readonly",
      ),
    ).toBe("false");

    rerender(
      <DocumentEditor value="正文" onChange={() => {}} readOnly />,
    );

    expect(
      document.querySelector("[data-document-editor='crepe']")?.getAttribute(
        "data-readonly",
      ),
    ).toBe("true");
  });

  it("粘贴外网图片时先调用图床本地化处理器", async () => {
    const localizeRemoteImage = vi.fn().mockResolvedValue("/api/images/img_local");
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
});
