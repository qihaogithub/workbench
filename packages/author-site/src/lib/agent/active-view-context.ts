export interface ActiveViewContext {
  previewMode?: "single" | "canvas";
  activePageId?: string;
  activePageName?: string;
  focusedPageId?: string;
  focusedPageName?: string;
  focusedPagePaths?: {
    index?: string;
    schema?: string;
  };
  previewRuntimeError?: {
    stage?: string;
    pageId?: string;
    file?: string;
    message: string;
    instruction?: string;
  };
}

export function buildActiveViewContextPrefix(
  context?: ActiveViewContext,
): string {
  if (!context?.focusedPageId && !context?.activePageId) return "";

  const lines = [
    "## 当前用户视图（系统自动注入）",
    "",
    "这是用户当前正在查看/编辑的页面焦点信息，只作为理解指代词的线索，不限制你的修改范围。若用户明确要求其他页面、所有页面或全局配置，请按用户意图处理；若仍有疑问，请主动向用户简短提问。",
    `- 预览模式: ${context.previewMode ?? "unknown"}`,
  ];

  if (context.activePageId) {
    lines.push(
      `- 当前活动页面: ${context.activePageName ?? "未命名"} (${context.activePageId})`,
    );
  }

  if (context.focusedPageId) {
    lines.push(
      `- 当前焦点页面: ${context.focusedPageName ?? "未命名"} (${context.focusedPageId})`,
    );
  } else {
    lines.push("- 当前焦点页面: 未选择");
  }

  if (context.focusedPagePaths?.index) {
    lines.push(`- 当前焦点页面代码路径: ${context.focusedPagePaths.index}`);
  }
  if (context.focusedPagePaths?.schema) {
    lines.push(`- 当前焦点页面配置路径: ${context.focusedPagePaths.schema}`);
  }

  if (context.previewRuntimeError) {
    lines.push(
      "",
      "## 最近一次预览运行错误（系统内部回流给 AI）",
      "",
      "用户侧不会展示技术错误；以下信息用于你自动修复当前页面。优先修改对应页面代码，并避免再次使用未登记依赖或不存在的导出。",
      `- 错误阶段: ${context.previewRuntimeError.stage ?? "runtime"}`,
      `- 页面: ${context.previewRuntimeError.pageId ?? context.focusedPageId ?? "unknown"}`,
      `- 文件: ${context.previewRuntimeError.file ?? context.focusedPagePaths?.index ?? "unknown"}`,
      `- 错误信息: ${context.previewRuntimeError.message}`,
    );
    if (context.previewRuntimeError.instruction) {
      lines.push(`- 修复指引: ${context.previewRuntimeError.instruction}`);
    }
  }

  return `${lines.join("\n")}\n\n`;
}
