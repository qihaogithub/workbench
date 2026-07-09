/**
 * Markdown Code Block 格式解析器
 * 用于解析和构建 Figma 插件导出的 Markdown Code Block 格式
 *
 * 格式规范：
 * # Workbench Export
 * ## Component Code
 * ```tsx
 * {code}
 * ```
 * ## Schema Config
 * ```json
 * {schema}
 * ```
 */

export interface ParsedMarkdownContent {
  code: string;
  schema: string;
  success: boolean;
  error?: string;
}

export type ParsedFigmaImportContent =
  | {
      kind: "react";
      code: string;
      schema: string;
      success: true;
    }
  | {
      kind: "prototype";
      prototypeHtml: string;
      prototypeCss: string;
      success: true;
    }
  | {
      kind: "unknown";
      code: "";
      schema: "";
      prototypeHtml: "";
      prototypeCss: "";
      success: false;
      error: string;
    };

const MARKDOWN_TITLE = "# Workbench Export";
const CODE_SECTION = "## Component Code";
const SCHEMA_SECTION = "## Schema Config";

function looksLikeHtmlDocument(text: string): boolean {
  const trimmedText = text.trim();
  if (!trimmedText) return false;
  if (/^<!doctype\s+html\b/i.test(trimmedText)) return true;
  if (/<html[\s>]/i.test(trimmedText)) return true;
  return /<(body|main|section|div|style|svg|img)[\s>]/i.test(trimmedText);
}

/**
 * 从 Markdown 文本中提取 fenced code block 内容
 * 查找 ```language 到 ``` 之间的内容（逐行解析，正确处理嵌套/空代码块）
 */
function extractFencedBlock(
  text: string,
  startPos: number,
  language: string,
): { content: string } | null {
  // 从 startPos 开始查找代码块开始标记 ```language
  const openFence = `\`\`\`${language}`;
  const openIdx = text.indexOf(openFence, startPos);
  let contentStart: number;

  if (openIdx !== -1) {
    // 找到带语言标记的 fence，跳到该行末尾
    const nlIdx = text.indexOf("\n", openIdx);
    if (nlIdx === -1) return null; // fence 后没有内容
    contentStart = nlIdx + 1;
  } else {
    // 尝试不带语言标记的代码块 ```
    const fallbackIdx = text.indexOf("```", startPos);
    if (fallbackIdx === -1) return null;
    const nlIdx = text.indexOf("\n", fallbackIdx);
    if (nlIdx === -1) return null;
    contentStart = nlIdx + 1;
  }

  // 逐行扫描，找到闭合的 ``` 行（仅包含 ``` 加可选空白）
  const remaining = text.substring(contentStart);
  const lines = remaining.split("\n");
  const contentLines: string[] = [];

  for (const line of lines) {
    if (/^```\s*$/.test(line)) {
      return { content: contentLines.join("\n").trim() };
    }
    contentLines.push(line);
  }

  return null;
}

/**
 * 解析 Figma Markdown Code Block 格式文本
 * @param text 包含 Markdown Code Block 的完整文本
 * @returns 解析结果，包含 code、schema 和状态
 */
export function parseFigmaMarkdown(text: string): ParsedMarkdownContent {
  const trimmedText = text.trim();

  // 1. 查找 ## Component Code 区块
  const codeSectionIndex = trimmedText.indexOf(CODE_SECTION);
  if (codeSectionIndex === -1) {
    return {
      code: "",
      schema: "",
      success: false,
      error: `缺少 "${CODE_SECTION}" 区块标题`,
    };
  }

  // 2. 查找 ## Schema Config 区块
  const schemaSectionIndex = trimmedText.indexOf(SCHEMA_SECTION);
  if (schemaSectionIndex === -1) {
    return {
      code: "",
      schema: "",
      success: false,
      error: `缺少 "${SCHEMA_SECTION}" 区块标题`,
    };
  }

  // 3. 验证区块顺序（Component Code 应在 Schema Config 之前）
  if (codeSectionIndex >= schemaSectionIndex) {
    return {
      code: "",
      schema: "",
      success: false,
      error: `区块顺序错误："${CODE_SECTION}" 必须在 "${SCHEMA_SECTION}" 之前`,
    };
  }

  // 4. 提取 Component Code 区块的 tsx 代码块
  const codeResult = extractFencedBlock(
    trimmedText,
    codeSectionIndex + CODE_SECTION.length,
    "tsx",
  );
  if (!codeResult || !codeResult.content) {
    return {
      code: "",
      schema: "",
      success: false,
      error: "未找到 Component Code 中的 tsx 代码块",
    };
  }
  const code = codeResult.content;

  // 5. 提取 Schema Config 区块的 json 代码块
  const schemaResult = extractFencedBlock(
    trimmedText,
    schemaSectionIndex + SCHEMA_SECTION.length,
    "json",
  );
  if (!schemaResult || !schemaResult.content) {
    return {
      code: "",
      schema: "",
      success: false,
      error: "未找到 Schema Config 中的 json 代码块",
    };
  }
  const schema = schemaResult.content;

  // 6. 验证 schema 为合法 JSON
  try {
    JSON.parse(schema);
  } catch {
    return {
      code: "",
      schema: "",
      success: false,
      error: "Schema Config 中的内容不是合法的 JSON",
    };
  }

  return {
    code,
    schema,
    success: true,
  };
}

/**
 * 将 code 和 schema 组装为 Markdown Code Block 格式
 * @param code React 组件代码
 * @param schema JSON Schema 配置
 * @returns 组装后的 Markdown 格式文本
 */
export function buildFigmaMarkdown(code: string, schema: string): string {
  const trimmedCode = code.trim();
  const trimmedSchema = schema.trim();

  return `${MARKDOWN_TITLE}

${CODE_SECTION}

\`\`\`tsx
${trimmedCode}
\`\`\`

${SCHEMA_SECTION}

\`\`\`json
${trimmedSchema}
\`\`\``;
}

/**
 * 检查文本是否为 Figma Markdown Code Block 格式
 * @param text 待检查的文本
 * @returns 是否为有效格式
 */
export function isFigmaMarkdownFormat(text: string): boolean {
  const trimmedText = text.trim();

  const hasTitle = trimmedText.includes(MARKDOWN_TITLE);
  const hasCodeSection = trimmedText.includes(CODE_SECTION);
  const hasSchemaSection = trimmedText.includes(SCHEMA_SECTION);

  // 至少需要包含两个区块标题（标题可选）
  if (!hasCodeSection || !hasSchemaSection) {
    return false;
  }

  const codeIndex = trimmedText.indexOf(CODE_SECTION);
  const schemaIndex = trimmedText.indexOf(SCHEMA_SECTION);

  // 区块顺序必须正确
  return codeIndex < schemaIndex;
}

export function parseFigmaImportContent(text: string): ParsedFigmaImportContent {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return {
      kind: "unknown",
      code: "",
      schema: "",
      prototypeHtml: "",
      prototypeCss: "",
      success: false,
      error: "导入内容不能为空",
    };
  }

  const markdown = parseFigmaMarkdown(trimmedText);
  if (markdown.success) {
    return {
      kind: "react",
      code: markdown.code,
      schema: markdown.schema,
      success: true,
    };
  }

  if (
    trimmedText.includes(MARKDOWN_TITLE) ||
    trimmedText.includes(CODE_SECTION) ||
    trimmedText.includes(SCHEMA_SECTION)
  ) {
    return {
      kind: "unknown",
      code: "",
      schema: "",
      prototypeHtml: "",
      prototypeCss: "",
      success: false,
      error: markdown.error || "请确认旧版 Workbench Export Markdown 格式完整",
    };
  }

  if (looksLikeHtmlDocument(trimmedText)) {
    return {
      kind: "prototype",
      prototypeHtml: trimmedText,
      prototypeCss: "",
      success: true,
    };
  }

  return {
    kind: "unknown",
    code: "",
    schema: "",
    prototypeHtml: "",
    prototypeCss: "",
    success: false,
    error: markdown.error || "请确认内容为 Figma 插件导出的 HTML 或旧版 Markdown 格式",
  };
}
