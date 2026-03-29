/**
 * 一致性校验服务
 * 用于校验 JSON Schema 语法和 Props 与 Schema 的一致性
 */

export interface ValidationError {
  type: 'json_syntax' | 'props_mismatch' | 'required_missing' | 'interface_not_found';
  message: string;
  line?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * 校验 JSON Schema 语法
 * @param schema JSON Schema 字符串
 * @returns 校验错误，如果没有错误返回 null
 */
export function validateJsonSyntax(schema: string): ValidationError | null {
  try {
    JSON.parse(schema);
    return null;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    // 尝试提取行号信息
    const lineMatch = errorMessage.match(/position\s+(\d+)/);
    const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

    return {
      type: 'json_syntax',
      message: `JSON 语法错误: ${errorMessage}`,
      line,
    };
  }
}

/**
 * 从 React 组件代码中提取 interface DemoProps 的属性名列表
 * @param code React 组件代码
 * @returns 属性名列表，如果没有找到 interface 返回 null
 */
function extractPropsFromCode(code: string): string[] | null {
  // 匹配 interface DemoProps { ... } 或 type DemoProps = { ... }
  const interfacePattern = /interface\s+DemoProps\s*\{([^}]+)\}/;
  const typePattern = /type\s+DemoProps\s*=\s*\{([^}]+)\}/;

  const interfaceMatch = code.match(interfacePattern);
  const typeMatch = code.match(typePattern);

  const propsBlock = interfaceMatch?.[1] || typeMatch?.[1];

  if (!propsBlock) {
    return null;
  }

  // 提取属性名（支持可选属性标记 ?）
  const propPattern = /(\w+)\??\s*:/g;
  const props: string[] = [];
  let match;

  while ((match = propPattern.exec(propsBlock)) !== null) {
    props.push(match[1]);
  }

  return props;
}

/**
 * 从解构赋值中提取 props（如：function Demo({ title, description })）
 * @param code React 组件代码
 * @returns 属性名列表
 */
function extractPropsFromDestructuring(code: string): string[] | null {
  // 匹配函数组件的解构赋值
  const patterns = [
    /function\s+\w+\s*\(\s*\{\s*([^}]+)\s*\}/,
    /const\s+\w+\s*=\s*\(\s*\{\s*([^}]+)\s*\}\s*\)/,
    /export\s+default\s+function\s+\w+\s*\(\s*\{\s*([^}]+)\s*\}/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      const destructured = match[1];
      // 提取属性名，支持默认值（如：title = 'default'）
      const propPattern = /(\w+)(?:\s*[=:]|\s*$)/g;
      const props: string[] = [];
      let propMatch;

      while ((propMatch = propPattern.exec(destructured)) !== null) {
        props.push(propMatch[1]);
      }

      if (props.length > 0) {
        return props;
      }
    }
  }

  return null;
}

/**
 * 从 JSON Schema 中提取 properties 的键名
 * @param schema JSON Schema 字符串
 * @returns 键名列表，如果解析失败返回 null
 */
function extractPropertiesFromSchema(schema: string): string[] | null {
  try {
    const parsed = JSON.parse(schema);

    if (!parsed.properties || typeof parsed.properties !== 'object') {
      return [];
    }

    return Object.keys(parsed.properties);
  } catch {
    return null;
  }
}

/**
 * 从 JSON Schema 中提取 required 字段
 * @param schema JSON Schema 字符串
 * @returns required 字段列表，如果没有返回空数组
 */
function extractRequiredFromSchema(schema: string): string[] {
  try {
    const parsed = JSON.parse(schema);
    return Array.isArray(parsed.required) ? parsed.required : [];
  } catch {
    return [];
  }
}

/**
 * 校验 Props 与 Schema 的一致性
 * @param code React 组件代码
 * @param schema JSON Schema 字符串
 * @returns 校验错误列表
 */
export function validatePropsSchema(code: string, schema: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. 提取代码中的 props
  let codeProps = extractPropsFromCode(code);

  // 如果没有找到 interface，尝试从解构赋值中提取
  if (!codeProps || codeProps.length === 0) {
    codeProps = extractPropsFromDestructuring(code);
  }

  // 2. 提取 schema 中的 properties
  const schemaProps = extractPropertiesFromSchema(schema);

  if (schemaProps === null) {
    errors.push({
      type: 'json_syntax',
      message: '无法解析 Schema 中的 properties',
    });
    return errors;
  }

  // 3. 如果没有找到 interface 且代码中有 props 使用，记录警告
  if (!codeProps) {
    // 检查代码中是否使用了 props
    const hasPropsUsage = /props\.\w+/.test(code) || /\{\s*\w+\s*\}/.test(code);

    if (hasPropsUsage) {
      errors.push({
        type: 'interface_not_found',
        message: '未找到 DemoProps 接口定义，无法校验 props 一致性',
      });
    }

    // 继续校验 required 字段
    const requiredFields = extractRequiredFromSchema(schema);
    for (const field of requiredFields) {
      if (!schemaProps.includes(field)) {
        errors.push({
          type: 'required_missing',
          message: `required 字段 "${field}" 未在 properties 中定义`,
        });
      }
    }

    return errors;
  }

  // 4. 对比 code props 和 schema properties
  const codePropsSet = new Set(codeProps);
  const schemaPropsSet = new Set(schemaProps);

  // 检查 code 中有但 schema 中没有的 props
  for (const prop of codeProps) {
    if (!schemaPropsSet.has(prop)) {
      errors.push({
        type: 'props_mismatch',
        message: `代码中的 props "${prop}" 未在 Schema 的 properties 中定义`,
      });
    }
  }

  // 检查 schema 中有但 code 中没有的 props
  for (const prop of schemaProps) {
    if (!codePropsSet.has(prop)) {
      errors.push({
        type: 'props_mismatch',
        message: `Schema 中的 property "${prop}" 未在代码的 DemoProps 中定义`,
      });
    }
  }

  // 5. 校验 required 字段是否都存在于 properties 中
  const requiredFields = extractRequiredFromSchema(schema);
  for (const field of requiredFields) {
    if (!schemaPropsSet.has(field)) {
      errors.push({
        type: 'required_missing',
        message: `required 字段 "${field}" 未在 properties 中定义`,
      });
    }
  }

  return errors;
}

/**
 * 执行完整的校验流程
 * @param code React 组件代码
 * @param schema JSON Schema 字符串
 * @returns 完整的校验结果
 */
export function validateAll(code: string, schema: string): ValidationResult {
  const errors: ValidationError[] = [];

  // 1. 校验 JSON Schema 语法
  const jsonError = validateJsonSyntax(schema);
  if (jsonError) {
    errors.push(jsonError);
    // JSON 语法错误时，不继续校验 props 一致性
    return {
      isValid: false,
      errors,
    };
  }

  // 2. 校验 Props 与 Schema 一致性
  const propsErrors = validatePropsSchema(code, schema);
  errors.push(...propsErrors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 快速校验 - 仅校验 JSON 语法
 * @param schema JSON Schema 字符串
 * @returns 是否有效
 */
export function isValidJson(schema: string): boolean {
  return validateJsonSyntax(schema) === null;
}

/**
 * 获取 Schema 的默认值
 * @param schema JSON Schema 字符串
 * @returns 默认值对象
 */
export function getDefaultValues(schema: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(schema);
    const defaults: Record<string, unknown> = {};

    if (parsed.properties && typeof parsed.properties === 'object') {
      for (const [key, value] of Object.entries(parsed.properties)) {
        const prop = value as { default?: unknown };
        if (prop.default !== undefined) {
          defaults[key] = prop.default;
        }
      }
    }

    return defaults;
  } catch {
    return {};
  }
}
