import { describe, it, expect } from "vitest";
import {
  sanitizeNoteHtml,
  renderNoteMarkdown,
  stripMarkdown,
} from "./note-html";

describe("sanitizeNoteHtml", () => {
  it("允许常规富文本标签与属性", () => {
    const html = '<p><strong>加粗</strong> 与 <a href="https://example.com">链接</a></p>';
    const out = sanitizeNoteHtml(html);
    expect(out).toContain("<strong>加粗</strong>");
    expect(out).toContain('<a href="https://example.com"');
  });

  it("允许图片标签但保留受控 src", () => {
    const out = sanitizeNoteHtml('<img src="/api/images/img_1" alt="x">');
    expect(out).toContain('<img src="/api/images/img_1"');
  });

  it("允许视频标签与控制器属性", () => {
    const out = sanitizeNoteHtml('<video controls src="/api/attachments/v1"></video>');
    expect(out).toContain("<video");
    expect(out).toContain("controls");
    expect(out).toContain('src="/api/attachments/v1"');
  });

  it("剥离外部/协议相对 src 以防范 XSS", () => {
    expect(sanitizeNoteHtml('<img src="https://evil.com/x.png">')).not.toContain("src=");
    expect(sanitizeNoteHtml("<img src=\"//evil.com/x.png\">")).not.toContain("src=");
    expect(sanitizeNoteHtml('<img src="javascript:alert(1)">')).not.toContain("src=");
  });
});

describe("renderNoteMarkdown", () => {
  it("渲染图片与链接 Markdown 为受控 HTML", () => {
    const html = renderNoteMarkdown("![图](/api/images/img_1)\n\n[pdf](/api/attachments/a1)");
    expect(html).toContain('<img src="/api/images/img_1"');
    expect(html).toContain('<a href="/api/attachments/a1"');
  });

  it("渲染内联 video 标签", () => {
    const html = renderNoteMarkdown('<video controls src="/api/attachments/v1"></video>');
    expect(html).toContain("<video");
    expect(html).toContain('src="/api/attachments/v1"');
  });

  it("剥离外部图片 src", () => {
    const html = renderNoteMarkdown('![外](https://evil.com/x.png)');
    expect(html).not.toContain("evil.com");
  });

  it("空内容返回空字符串", () => {
    expect(renderNoteMarkdown("")).toBe("");
  });
});

describe("stripMarkdown", () => {
  it("提取纯文本并忽略图片与链接语法", () => {
    expect(stripMarkdown("# 标题\n\n![图](/api/a) 说明 [链接](/api/b)")).toContain("标题");
    expect(stripMarkdown("# 标题\n\n![图](/api/a) 说明")).not.toContain("/api");
  });

  it("空或纯空白视为空", () => {
    expect(stripMarkdown("   ")).toBe("");
    expect(stripMarkdown("")).toBe("");
  });
});