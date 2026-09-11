import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const theme = readFileSync("src/markdown/crepe-theme.css", "utf8");

describe("Crepe 宿主主题契约", () => {
  it("只在只读状态隐藏原生 TopBar", () => {
    expect(theme).toMatch(
      /\[data-readonly=["']true["']\][^{]*\.milkdown-top-bar\s*\{[^}]*display:\s*none/s,
    );
    expect(theme).toMatch(
      /\[data-readonly=["']true["']\]\s+\.document-block-handle\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    );
    expect(theme).toMatch(
      /\[data-readonly=["']true["']\][\s\S]*?\.document-selection-toolbar\s*\{[^}]*display:\s*none\s*!important;/s,
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
      /\.top-bar-item:has\(\[data-document-heading-trigger\]\)\s*\{[^}]*min-width:\s*70px;/s,
    );
    expect(theme).toMatch(
      /\.document-selection-toolbar-heading\s*\{[^}]*min-width:\s*64px;/s,
    );
    expect(theme).toMatch(
      /\.top-bar-item:has\(\[data-document-insert-trigger\]\)\s*\{[^}]*min-width:\s*72px;/s,
    );
  });

  it("标题下拉复用本地浮层，不再维护原生下拉的另一套定位样式", () => {
    expect(theme).not.toContain(".top-bar-heading-dropdown");
    expect(theme).toContain("[data-document-heading-trigger]");
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

  it("让编辑器宽度受宿主容器约束，并让原生 TopBar 自适应换行", () => {
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
      /\.top-bar-inner\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*visible;[^}]*flex-wrap:\s*nowrap;/s,
    );
  });

  it("让原生 TopBar 的隐藏节点遵循原生 hidden 语义", () => {
    expect(theme).toMatch(
      /\.top-bar-inner\s*>\s*\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/s,
    );
  });

  it("对齐浮动标题选择器，并让选区工具栏支持横向滚动", () => {
    expect(theme).toMatch(
      /\.document-selection-toolbar\s*\{[^}]*display:\s*inline-flex;[^}]*overflow-x:\s*auto;/s,
    );
  });

  it("让编辑器浮层独立定位，并禁止使用位移补丁解决遮挡", () => {
    expect(theme).toMatch(
      /\.document-editor-overlays\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\s+\.document-selection-toolbar\s*\{[^}]*position:\s*absolute;/s,
    );
    expect(theme).not.toMatch(
      /document-selection-toolbar-shift-y|transform:\s*translateY/,
    );
  });

  it("为块菜单提供不透明表面、固定最大高度和独立滚动区", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\s+\.document-block-menu\s*\{[^}]*max-height:\s*min\([^}]*var\(--document-editor-block-menu-max-height\)[^}]*overflow:\s*hidden;[^}]*border:\s*1px\s+solid\s+var\(--crepe-color-outline\);[^}]*background:\s*var\(--crepe-color-surface\);[^}]*box-shadow:\s*var\(--crepe-shadow-2\);/s,
    );
    expect(theme).toMatch(
      /\.document-block-menu-groups\s*\{[^}]*overflow-y:\s*auto;[^}]*min-height:\s*0;/s,
    );
    expect(theme).toMatch(/--document-editor-block-menu-max-height:\s*360px;/);
  });

  it("为 TopBar 插入面板提供搜索、网格、列表和窄屏滚动样式", () => {
    expect(theme).toMatch(
      /\.document-topbar-insert-menu\s*\{[^}]*max-height:\s*min\(72vh,\s*560px\);[^}]*overflow-y:\s*auto;/s,
    );
    expect(theme).toMatch(
      /\.document-insert-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(7,/s,
    );
    expect(theme).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.document-insert-grid\s*\{[^}]*repeat\(4,/s,
    );
    expect(theme).toMatch(
      /\.document-insert-item\s*\{[^}]*cursor:\s*pointer;/s,
    );
    expect(theme).toMatch(
      /\.document-insert-grid\s+\.document-insert-item\s*\{[^}]*min-height:\s*40px;/s,
    );
  });

  it("将 TopBar 的 Lucide 直达图标收敛到统一尺寸", () => {
    expect(theme).toMatch(
      /\.milkdown-top-bar\s+\.top-bar-item\s+svg\[data-lucide\]\s*\{[^}]*width:\s*var\(--document-editor-icon-size\);[^}]*height:\s*var\(--document-editor-icon-size\);/s,
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

  it("让 Lucide 图标保持描边渲染并继承当前主题颜色", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\s+svg\[data-lucide\]\s*\{[^}]*fill:\s*none\s*!important;[^}]*stroke:\s*currentColor\s*!important;/s,
    );
  });

  it("保留 Crepe 对表格单元格和节点类型各自的选中反馈", () => {
    expect(theme).not.toMatch(/\.ProseMirror-selectednode\s*\{[^}]*outline:/s);
    expect(theme).not.toMatch(/\.selectedCell(?:::after)?\s*\{/s);
    expect(theme).not.toMatch(/\b(?:th|td)\s*\{[^}]*border:/s);
  });

  it("将单一块手柄统一为 32px 命中区与 16px 图标", () => {
    expect(theme).toMatch(
      /\.document-block-handle\s*\{[^}]*width:\s*var\(--document-editor-handle-size\);[^}]*height:\s*var\(--document-editor-handle-size\);/s,
    );
    expect(theme).toMatch(
      /\.document-block-handle-icon,[\s\S]*?width:\s*var\(--document-editor-icon-size\);[\s\S]*?height:\s*var\(--document-editor-icon-size\);/s,
    );
    expect(theme).not.toMatch(/\.operation-item/);
  });

  it("隐藏块手柄时保留尺寸供 BlockProvider 测量", () => {
    expect(theme).toMatch(
      /\.document-block-handle\[data-show=["']false["']\]\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    );
    expect(theme).not.toMatch(
      /\.document-block-handle\[data-show=["']false["']\][^{]*\{[^}]*display:\s*none/s,
    );
  });

  it("保留单一手柄的键盘可操作性，并不再隐藏或转发原生控件", () => {
    expect(theme).toMatch(
      /\.document-block-handle-trigger\s*\{[^}]*cursor:\s*grab;/s,
    );
    expect(theme).toMatch(
      /\.document-editor-overlays\s+\[data-safe="false"\]\s*\{[^}]*visibility:\s*hidden;/s,
    );
    expect(theme).not.toMatch(/operation-item|synthetic|MutationObserver/);
  });

  it("为紧凑正文保留 32px/28px 手柄沟槽并收紧编辑区内边距", () => {
    expect(theme).toMatch(/--document-editor-gutter:\s*32px;/);
    expect(theme).toMatch(/--document-editor-mobile-gutter:\s*28px;/);
    expect(theme).toMatch(/--document-editor-padding-top:\s*12px;/);
    expect(theme).toMatch(/--document-editor-padding-bottom:\s*24px;/);
  });

  it("收紧普通段落与连续列表项的垂直节奏并统一标记列", () => {
    expect(theme).toMatch(
      /\.ProseMirror\s*>\s*\*\s*\+\s*\*\s*\{[^}]*margin-top:\s*var\(--document-editor-block-gap\);/s,
    );
    expect(theme).toMatch(
      /\.ProseMirror\s+p\s*\{[^}]*margin-block:\s*0\.25em;/s,
    );
    expect(theme).toMatch(
      /\.milkdown-list-item-block\s+\.children\s*>\s*p\s*\{[^}]*margin:\s*0;/s,
    );
    expect(theme).toMatch(
      /\.milkdown-list-item-block\s*\+\s*\.milkdown-list-item-block\s*\{[^}]*margin-top:\s*4px;/s,
    );
    expect(theme).toMatch(/--document-editor-list-marker-size:\s*24px;/);
    expect(theme).toMatch(
      /\.milkdown-list-item-block[\s\S]*?\.label-wrapper[\s\S]*?width:\s*var\(--document-editor-list-marker-size\);/s,
    );
  });

  it("为批注简版编辑器提供单行自动增高和八行滚动上限", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\[data-auto-grow=["']true["']\][^{]*\{[^}]*overflow:\s*visible/s,
    );
    expect(theme).toMatch(
      /\.document-editor-crepe\[data-auto-grow=["']true["']\][^}]*\.ProseMirror\s*\{[^}]*min-height:\s*24px;[^}]*max-height:\s*176px;[^}]*overflow-y:\s*auto;/s,
    );
  });

  it("隐藏批注编辑器左侧的块级拖拽手柄", () => {
    expect(theme).toMatch(
      /\.document-editor-crepe\.config-comment-editor\s+\.document-block-handle\s*\{[^}]*display:\s*none\s*!important;/s,
    );
  });
});
