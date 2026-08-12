import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const theme = readFileSync("src/markdown/crepe-theme.css", "utf8");

describe("Crepe 宿主主题契约", () => {
  it("只在只读状态隐藏原生 TopBar", () => {
    expect(theme).toMatch(
      /\[data-readonly=["']true["']\][^{]*\.milkdown-top-bar\s*\{[^}]*display:\s*none/s,
    );
  });

  it("提供完整且可随宿主明暗模式变化的 Frame 主题令牌", () => {
    expect(theme).toMatch(
      /--crepe-color-background:\s*color-mix\([^;]+var\(--background\)[^;]+var\(--foreground\)[^;]+;/,
    );
    expect(theme).toMatch(
      /--crepe-color-outline:\s*color-mix\([^;]+var\(--background\)[^;]+var\(--foreground\)[^;]+;/,
    );
    expect(theme).toMatch(/--crepe-color-inline-area:\s*[^;]+;/);
    expect(theme).toMatch(/--crepe-base-font-size:\s*16px;/);
    expect(theme).toMatch(/--crepe-font-default:\s*[^;]+;/);
    expect(theme).toMatch(/--crepe-font-title:\s*var\(--crepe-font-default\);/);
    expect(theme).toMatch(/"PingFang SC"/);
    expect(theme).toMatch(/"Microsoft YaHei"/);
    expect(theme).toMatch(/--crepe-shadow-1:\s*[^;]+;/);
    expect(theme).toMatch(/--crepe-shadow-2:\s*[^;]+;/);
  });

  it("让标题和正文使用同一套中文系统字体", () => {
    expect(theme).toMatch(
      /\.ProseMirror\s+h1,[\s\S]*?font-family:\s*var\(--crepe-font-default\);/,
    );
  });

  it("让正文、浮动工具栏和 TopBar 使用同一套 Crepe 表面层级", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\s+\.milkdown\s*\{[^}]*background:\s*var\(--crepe-color-background\)/s,
    );
    expect(theme).toMatch(
      /\.milkdown-top-bar\s*\{[^}]*border-bottom:\s*1px solid var\(--crepe-color-surface-low\)[^}]*background:\s*var\(--crepe-color-surface\)/s,
    );
    expect(theme).toMatch(
      /\.milkdown-toolbar[^}]*\{[^}]*background:\s*var\(--crepe-color-surface\)/s,
    );
  });

  it("将超长正文限制在 Milkdown 滚动容器内，并保留 TopBar 的 sticky 定位", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\s*>\s*\.crepe,[\s\S]*?\.document-editor-crepe\s+\.milkdown\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s,
    );
  });

  it("让编辑器宽度受宿主容器约束，并阻止整体横向滚动", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*hidden;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\s+>\s*\.crepe,[\s\S]*?\.document-editor-crepe\s+\.milkdown\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\s+\.milkdown\s+\.ProseMirror\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s,
    );
    expect(theme).toMatch(
      /\.milkdown-top-bar\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;/s,
    );
  });

  it("为原生工具按钮提供明确的默认、悬停和选中状态", () => {
    expect(theme).toMatch(
      /\.milkdown-toolbar\s+\.toolbar-item\s+svg[^{]*\{[^}]*(?:color|fill):\s*var\(--crepe-color-on-surface\)/s,
    );
    expect(theme).toMatch(
      /\.top-bar-item:hover[^}]*\.toolbar-item:hover[^}]*\{[^}]*background:\s*var\(--crepe-color-hover\)/s,
    );
    expect(theme).toMatch(
      /\.top-bar-item\.active[^}]*\.toolbar-item\.active[^}]*\{[^}]*background:\s*var\(--crepe-color-selected\)/s,
    );
  });

  it("保留 Crepe 对表格单元格和节点类型各自的选中反馈", () => {
    expect(theme).not.toMatch(
      /\.ProseMirror-selectednode\s*\{[^}]*outline:/s,
    );
    expect(theme).not.toMatch(/\.selectedCell(?:::after)?\s*\{/s);
    expect(theme).not.toMatch(/\b(?:th|td)\s*\{[^}]*border:/s);
  });

  it("将加号和拖拽入口统一收紧为 22px 按钮与 14px 图标", () => {
    expect(theme).toMatch(
      /\.milkdown-block-handle\s+\.operation-item\s*\{[^}]*width:\s*22px;[^}]*height:\s*22px;/s,
    );
    expect(theme).toMatch(
      /\.milkdown-block-handle\s+\.operation-item\s+svg\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;/s,
    );
  });

  it("为两个块操作按钮保留不会被宿主裁切的左侧沟槽", () => {
    expect(theme).toMatch(
      /\.ProseMirror\s*\{[^}]*padding:\s*16px\s+64px\s+40px;/s,
    );
    expect(theme).toMatch(
      /@media\s*\(max-width:\s*640px\)[^{]*\{[\s\S]*?\.ProseMirror\s*\{[^}]*padding:\s*12px\s+56px\s+32px;/s,
    );
  });
});
