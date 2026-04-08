/**
 * 混合格式解析器
 * 用于解析和构建 Figma 导出的分隔符格式
 */

export interface ParsedContent {
  code: string;
  schema: string;
  success: boolean;
  error?: string;
}

// 分隔符常量
const CODE_START_MARKER = "=== DEMO CODE ===";
const SCHEMA_START_MARKER = "=== DEMO SCHEMA ===";
const END_MARKER = "=== END ===";

/**
 * 解析 Figma 导出的分隔符格式文本
 * @param text 包含分隔符的完整文本
 * @returns 解析结果，包含 code、schema 和状态
 */
export function parseFigmaText(text: string): ParsedContent {
  // 去除首尾空白
  const trimmedText = text.trim();

  // 检查必需的分隔符
  const codeStartIndex = trimmedText.indexOf(CODE_START_MARKER);
  const schemaStartIndex = trimmedText.indexOf(SCHEMA_START_MARKER);
  const endIndex = trimmedText.indexOf(END_MARKER);

  // 验证分隔符存在性
  if (codeStartIndex === -1) {
    return {
      code: "",
      schema: "",
      success: false,
      error: `缺少 ${CODE_START_MARKER} 分隔符`,
    };
  }

  if (schemaStartIndex === -1) {
    return {
      code: "",
      schema: "",
      success: false,
      error: `缺少 ${SCHEMA_START_MARKER} 分隔符`,
    };
  }

  // 验证分隔符顺序
  if (codeStartIndex >= schemaStartIndex) {
    return {
      code: "",
      schema: "",
      success: false,
      error: "分隔符顺序错误：CODE 分隔符必须在 SCHEMA 分隔符之前",
    };
  }

  // 提取 CODE 内容
  const codeStart = codeStartIndex + CODE_START_MARKER.length;
  const codeEnd = schemaStartIndex;
  const code = trimmedText.substring(codeStart, codeEnd).trim();

  // 提取 SCHEMA 内容
  const schemaStart = schemaStartIndex + SCHEMA_START_MARKER.length;
  const schemaEnd = endIndex !== -1 ? endIndex : trimmedText.length;
  const schema = trimmedText.substring(schemaStart, schemaEnd).trim();

  // 验证内容非空
  if (!code) {
    return {
      code: "",
      schema: "",
      success: false,
      error: "CODE 部分不能为空",
    };
  }

  if (!schema) {
    return {
      code: "",
      schema: "",
      success: false,
      error: "SCHEMA 部分不能为空",
    };
  }

  return {
    code,
    schema,
    success: true,
  };
}

/**
 * 将 code 和 schema 拼接为 Figma 导出格式
 * @param code React 组件代码
 * @param schema JSON Schema 配置
 * @returns 拼接后的分隔符格式文本
 */
export function buildFigmaText(code: string, schema: string): string {
  const trimmedCode = code.trim();
  const trimmedSchema = schema.trim();

  return `${CODE_START_MARKER}
${trimmedCode}
${SCHEMA_START_MARKER}
${trimmedSchema}
${END_MARKER}`;
}

/**
 * 检查文本是否为有效的 Figma 导出格式
 * @param text 待检查的文本
 * @returns 是否为有效格式
 */
export function isValidFigmaFormat(text: string): boolean {
  const trimmedText = text.trim();

  const hasCodeMarker = trimmedText.includes(CODE_START_MARKER);
  const hasSchemaMarker = trimmedText.includes(SCHEMA_START_MARKER);

  if (!hasCodeMarker || !hasSchemaMarker) {
    return false;
  }

  const codeIndex = trimmedText.indexOf(CODE_START_MARKER);
  const schemaIndex = trimmedText.indexOf(SCHEMA_START_MARKER);

  return codeIndex < schemaIndex;
}

/**
 * 尝试修复常见格式问题
 * @param text 待修复的文本
 * @returns 修复后的文本
 */
export function fixFigmaTextFormat(text: string): string {
  let fixed = text.trim();

  // 统一换行符
  fixed = fixed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 如果缺少 CODE 标记但内容看起来像代码，添加标记
  if (!fixed.includes(CODE_START_MARKER)) {
    // 尝试检测是否是合并的格式
    const lines = fixed.split("\n");
    let codeEndLine = -1;

    // 查找 JSON 开始的位置（通常是 schema 的开始）
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "{" || line.startsWith("{")) {
        codeEndLine = i;
        break;
      }
    }

    if (codeEndLine > 0) {
      const codePart = lines.slice(0, codeEndLine).join("\n").trim();
      const schemaPart = lines.slice(codeEndLine).join("\n").trim();
      return buildFigmaText(codePart, schemaPart);
    }
  }

  return fixed;
}

/**
 * 从 Figma 格式文本中提取 code 部分
 * @param text Figma 格式文本
 * @returns 提取的代码内容，如果解析失败返回 undefined
 */
export function extractCodeFromFigma(text: string): string | undefined {
  try {
    const result = parseFigmaText(text);
    return result.success ? result.code : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 从 Figma 格式文本中提取 schema 部分
 * @param text Figma 格式文本
 * @returns 提取的 schema 内容，如果解析失败返回 undefined
 */
export function extractSchemaFromFigma(text: string): string | undefined {
  try {
    const result = parseFigmaText(text);
    return result.success ? result.schema : undefined;
  } catch {
    return undefined;
  }
}
