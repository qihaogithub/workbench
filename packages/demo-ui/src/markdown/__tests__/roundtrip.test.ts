import { describe, expect, it } from "vitest";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";

function createEditor(markdown: string) {
  const root = document.createElement("div");
  document.body.appendChild(root);
  return {
    root,
    editor: Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, markdown);
      })
      .use(commonmark)
      .use(gfm),
  };
}

async function roundtrip(markdown: string): Promise<string> {
  const { editor, root } = createEditor(markdown);
  await editor.create();
  const out = editor.action(getMarkdown());
  editor.destroy();
  root.remove();
  return out;
}

/**
 * 用 Milkdown 的规范化输出作为输入，断言「解析 → 序列化」幂等（内容无损）。
 * Markdown 的 `-`/`*`、`---`/`--` 等写法在同一语义下会被收敛为一种规范形式，
 * 因此用规范形式测试幂等，比断言任意输入原样往返更有意义。
 */
describe("Markdown 往返一致性（幂等）", () => {
  it("标题与段落", async () => {
    const input = "# 一级标题\n\n这是**加粗**和*斜体*的段落。";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("有序/无序/嵌套列表", async () => {
    const input =
      "* 苹果\n* 香蕉\n  * 子项一\n  * 子项二\n\n1. 第一\n2. 第二";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("任务列表", async () => {
    const input = "* [x] 已完成\n* [ ] 未完成";
    const out = await roundtrip(input);
    expect(out).toContain("[x] 已完成");
    expect(out).toContain("[ ] 未完成");
  });

  it("代码块与语言标注", async () => {
    const input = "```typescript\nconst a: number = 1;\n```\n\n行内 `code` 保留。";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("引用块", async () => {
    const input = "> 引用内容\n> 第二行";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("表格", async () => {
    const input = "| 姓名 | 年龄 |\n| -- | -- |\n| 张三 | 18 |\n| 李四 | 20 |";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("链接与图片", async () => {
    const input =
      "[文档](https://example.com)\n\n![图片](https://img.example.com/a.png)";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("删除线", async () => {
    const input = "~~删除的文本~~";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("分隔线", async () => {
    const input = "***";
    expect(await roundtrip(input)).toBe(input + "\n");
  });

  it("- 与 * 无序列表收敛为同一语义", async () => {
    expect(await roundtrip("- 苹果\n- 香蕉")).toBe("* 苹果\n* 香蕉\n");
    expect(await roundtrip("* 苹果\n* 香蕉")).toBe("* 苹果\n* 香蕉\n");
  });
});