import { describe, it, expect } from "vitest";
import {
  encodeMarkdownReferenceUri,
  serializeMarkdownReference,
  type MarkdownReferenceTarget,
} from "@workbench/shared/markdown-reference";
import {
  sanitizeNoteHtml,
  renderNoteMarkdown,
  renderPageRequirementsMarkdown,
  stripMarkdown,
} from "./note-html";

describe("sanitizeNoteHtml", () => {
  it("允许常规富文本标签与属性", () => {
    const html =
      '<p><strong>加粗</strong> 与 <a href="https://example.com">链接</a></p>';
    const out = sanitizeNoteHtml(html);
    expect(out).toContain("<strong>加粗</strong>");
    expect(out).toContain('<a href="https://example.com"');
  });

  it("允许图片标签但保留受控 src", () => {
    const out = sanitizeNoteHtml('<img src="/api/images/img_1" alt="x">');
    expect(out).toContain('<img src="/api/images/img_1"');
  });

  it("可将全局图床地址指向浏览端数据源", () => {
    const out = sanitizeNoteHtml('<img src="/api/images/img_1" alt="x">', {
      mediaBaseUrl: "http://localhost:3200/",
    });
    expect(out).toContain('src="http://localhost:3200/api/images/img_1"');
  });

  it("允许视频标签与控制器属性", () => {
    const out = sanitizeNoteHtml(
      '<video controls src="/api/attachments/v1"></video>',
    );
    expect(out).toContain("<video");
    expect(out).toContain("controls");
    expect(out).toContain('src="/api/attachments/v1"');
  });

  it("剥离外部/协议相对 src 以防范 XSS", () => {
    expect(
      sanitizeNoteHtml('<img src="https://evil.com/x.png">'),
    ).not.toContain("src=");
    expect(sanitizeNoteHtml('<img src="//evil.com/x.png">')).not.toContain(
      "src=",
    );
    expect(sanitizeNoteHtml('<img src="javascript:alert(1)">')).not.toContain(
      "src=",
    );
  });
});

describe("renderNoteMarkdown", () => {
  it("渲染图片与链接 Markdown 为受控 HTML", () => {
    const html = renderNoteMarkdown(
      "![图](/api/images/img_1)\n\n[pdf](/api/attachments/a1)",
    );
    expect(html).toContain('<img src="/api/images/img_1"');
    expect(html).toContain('<a href="/api/attachments/a1"');
  });

  it("渲染内联 video 标签", () => {
    const html = renderNoteMarkdown(
      '<video controls src="/api/attachments/v1"></video>',
    );
    expect(html).toContain("<video");
    expect(html).toContain('src="/api/attachments/v1"');
  });

  it("剥离外部图片 src", () => {
    const html = renderNoteMarkdown("![外](https://evil.com/x.png)");
    expect(html).not.toContain("evil.com");
  });

  it("空内容返回空字符串", () => {
    expect(renderNoteMarkdown("")).toBe("");
  });
});

describe("renderPageRequirementsMarkdown", () => {
  it("把行内软引用渲染为携带 data-ref-key 的 chip", () => {
    const html = renderPageRequirementsMarkdown(
      "@[页面标题](title) 需突出显示。",
    );
    expect(html).toContain('<span class="pr-ref" data-ref-key="title">');
    expect(html).toContain("页面标题");
  });

  it("普通 Markdown 链接不被渲染为 chip", () => {
    const html = renderPageRequirementsMarkdown("[普通链接](https://a.com)");
    expect(html).not.toContain("pr-ref");
  });

  it("将 canonical wb 引用渲染为带 URI 和类型的安全行内引用", () => {
    const html = renderPageRequirementsMarkdown(
      "参见 [首页](wb://page/project-1/home)。",
    );
    expect(html).toContain(
      '<span class="pr-reference wb-reference" data-reference-uri="wb://page/project-1/home" data-reference-kind="page" aria-label="首页">首页</span>',
    );
    expect(html).not.toContain('href="wb://');
  });

  it("资源规范展示可保留 HTTPS 图片，默认仍移除外部媒体", () => {
    const markdown = "![规范图](https://example.com/spec.png)";
    expect(renderPageRequirementsMarkdown(markdown)).not.toContain(
      'src="https://example.com/spec.png"',
    );
    expect(
      renderPageRequirementsMarkdown(markdown, { allowExternalMedia: true }),
    ).toContain('src="https://example.com/spec.png"');
  });

  it("将图片的持久化目标宽度带到只读渲染，并为历史图片标记默认尺寸策略", () => {
    const sized = renderPageRequirementsMarkdown(
      "![width:360](https://example.com/spec.png)",
      { allowExternalMedia: true },
    );
    const legacy = renderPageRequirementsMarkdown(
      "![1.00](https://example.com/spec.png)",
      { allowExternalMedia: true },
    );

    expect(sized).toContain('data-image-width="360"');
    expect(sized).toContain("width: min(360px, 100%)");
    expect(legacy).toContain('data-image-width="default"');
  });

  it("空内容返回空字符串", () => {
    expect(renderPageRequirementsMarkdown("")).toBe("");
  });
});

describe("readonly reference presentation", () => {
  const targets: MarkdownReferenceTarget[] = [
    { kind: "project", projectId: "项目" },
    { kind: "page", projectId: "项目", pageId: "页面" },
    {
      kind: "config",
      projectId: "项目",
      pageId: "页面",
      fieldPath: "group/title",
    },
    { kind: "document", projectId: "项目", docId: "知识" },
    {
      kind: "document",
      projectId: "项目",
      docId: "memory",
      documentKind: "memory",
    },
  ];
  for (const render of [renderNoteMarkdown, renderPageRequirementsMarkdown]) {
    it(`${render.name} preserves snapshots and uses decoded kinds without navigation or availability claims`, () => {
      for (const target of targets) {
        const snapshot = 'Stored "name" <img src=x onerror=alert(1)> & text';
        const html = render(serializeMarkdownReference(target, snapshot));
        const template = document.createElement("template");
        template.innerHTML = html;
        const reference = template.content.querySelector(
          "span.pr-reference.wb-reference",
        )!;
        expect(reference).not.toBeNull();
        expect(reference.textContent).toBe(snapshot);
        expect(reference.getAttribute("aria-label")).toBe(snapshot);
        expect(reference.getAttribute("data-reference-kind")).toBe(target.kind);
        expect(reference.getAttribute("data-reference-uri")).toBe(
          encodeMarkdownReferenceUri(target),
        );
        expect(reference.hasAttribute("data-reference-status")).toBe(false);
        expect(
          template.content.querySelector("img, a[href^='wb:']"),
        ).toBeNull();
      }
    });
    it(`${render.name} leaves code, external links, and malformed reference URIs out of presentation`, () => {
      const html = render(
        "`[code](wb://page/p/x)`\n\n[bad](wb://config/p/x) [web](https://example.com)",
      );
      expect(html).not.toContain('class="pr-reference');
      expect(html).toContain('href="https://example.com"');
    });
  }
});

describe("stripMarkdown", () => {
  it("提取纯文本并忽略图片与链接语法", () => {
    expect(
      stripMarkdown("# 标题\n\n![图](/api/a) 说明 [链接](/api/b)"),
    ).toContain("标题");
    expect(stripMarkdown("# 标题\n\n![图](/api/a) 说明")).not.toContain("/api");
  });

  it("空或纯空白视为空", () => {
    expect(stripMarkdown("   ")).toBe("");
    expect(stripMarkdown("")).toBe("");
  });
});
