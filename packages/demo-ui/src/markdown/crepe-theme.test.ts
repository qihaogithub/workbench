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

  it("使用紧凑的 H1-H6 标题选择器宽度", () => {
    expect(theme).toMatch(
      /\.top-bar-heading-label\s*\{[^}]*min-width:\s*42px;/s,
    );
    expect(theme).toMatch(
      /\.heading-style-trigger\s*\{[^}]*min-width:\s*48px;/s,
    );
  });

  it("让原生标题下拉菜单在正文与溢出工具之上，并保留完整点击热区", () => {
    expect(theme).toMatch(
      /\.top-bar-heading-selector\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*30;/s,
    );
    expect(theme).toMatch(
      /\.top-bar-heading-button\s*\{[^}]*display:\s*flex;[^}]*cursor:\s*pointer;/s,
    );
    expect(theme).toMatch(
      /\.top-bar-heading-dropdown\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*31;/s,
    );
    expect(theme).toMatch(
      /\.top-bar-heading-option\s*\{[^}]*width:\s*100%;[^}]*cursor:\s*pointer;/s,
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
    expect(theme).toMatch(
      /\.milkdown-top-bar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*20;/s,
    );
  });

  it("让嵌入式只读正文退出自身滚动，由外层文档区承载滚动", () => {
    expect(theme).toMatch(
      /\[data-scrollable=["']false["']\][^{]*>\s*\.crepe,[\s\S]*?\[data-scrollable=["']false["']\][^{]*\.milkdown\s*\{[^}]*height:\s*auto\s*!important;[^}]*overflow-x:\s*visible\s*!important;[^}]*overflow-y:\s*visible\s*!important;/s,
    );
  });

  it("让编辑器宽度受宿主容器约束，并让工具栏浮层保持可交互", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow-x:\s*hidden;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\s+>\s*\.crepe,[\s\S]*?\.document-editor-crepe\s+\.milkdown\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\s+\.milkdown\s+\.ProseMirror\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*880px;[^}]*margin:\s*0\s+auto;/s,
    );
    expect(theme).toMatch(
      /\.milkdown-top-bar\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;[^}]*max-width:\s*100%;[^}]*overflow:\s*visible;/s,
    );
    expect(theme).toMatch(
      /\.top-bar-inner\s*\{[^}]*position:\s*relative;[^}]*padding-right:\s*48px;[^}]*overflow:\s*visible;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\s*>\s*\.top-bar-overflow\s*\{[^}]*position:\s*absolute;[^}]*top:\s*6px;[^}]*right:\s*8px;[^}]*z-index:\s*(?:[2-9]\d|\d{3,});/s,
    );
  });

  it("让收纳项真正退出布局，避免主题 display 覆盖 hidden 语义", () => {
    expect(theme).toMatch(
      /\.top-bar-inner\s*>\s*\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/s,
    );
  });

  it("对齐浮动标题触发器，并允许其菜单逃离工具栏裁切", () => {
    expect(theme).toMatch(
      /\.milkdown-toolbar\s*\{[^}]*overflow:\s*visible;/s,
    );
    expect(theme).toMatch(
      /\.heading-style-selector\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*margin:\s*6px;/s,
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

  it("让脱离 Milkdown 作用域的溢出工具图标仍使用主题色", () => {
    expect(theme).toMatch(
      /\.top-bar-overflow-item\s+svg[^{]*\{[^}]*color:\s*var\(--crepe-color-on-surface\);[^}]*fill:\s*var\(--crepe-color-on-surface\);/s,
    );
    expect(theme).toMatch(
      /\.top-bar-overflow-item:hover\s+svg[^{]*\{[^}]*color:\s*var\(--crepe-color-primary\);[^}]*fill:\s*var\(--crepe-color-primary\);/s,
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
