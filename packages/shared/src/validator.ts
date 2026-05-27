/**
 * 代码与 Schema 校验逻辑（从 author-site/lib/validator.ts 迁移）
 *
 * 仅包含纯校验函数，不依赖 author-site 特定类型（如 PreviewSize）。
 * 工具函数 getPreviewSize / getOrderable / getDefaultValues 仍保留在 author-site 中。
 */

export type ValidationErrorType =
  | "json_syntax"
  | "props_code_not_in_schema"
  | "props_schema_not_in_code"
  | "required_missing"
  | "interface_not_found";

export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  severity: "error" | "warning" | "info";
  line?: number;
  location?: {
    type: "code" | "schema";
    line?: number;
    column?: number;
  };
  field?: {
    name: string;
    path?: string;
  };
  fixSuggestion?: {
    action:
      | "add_to_schema"
      | "remove_from_schema"
      | "fix_json"
      | "add_interface"
      | "remove_from_required";
    description: string;
    example?: string;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

/**
 * validate_demo 工具返回的单项检查结果
 */
export interface ValidationCheck {
  name: string;
  passed: boolean;
  issues: ValidationCheckIssue[];
}

export interface ValidationCheckIssue {
  severity: "error" | "warning" | "info";
  message: string;
  location?: {
    file: string;
    line?: number;
  };
  fix_suggestion?: string;
}

/**
 * validate_demo 工具返回的完整结果
 */
export interface ValidateDemoResult {
  passed: boolean;
  checks: ValidationCheck[];
}

function positionToLineColumn(
  text: string,
  position: number,
): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < position && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

export function validateJsonSyntax(schema: string): ValidationError | null {
  try {
    JSON.parse(schema);
    return null;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);

    const positionMatch = errorMessage.match(/position\s+(\d+)/);
    let location: ValidationError["location"];

    if (positionMatch) {
      const pos = parseInt(positionMatch[1], 10);
      const { line, column } = positionToLineColumn(schema, pos);
      location = { type: "schema", line, column };
    }

    return {
      type: "json_syntax",
      message: `JSON 语法错误: ${errorMessage}`,
      severity: "error",
      location,
      fixSuggestion: {
        action: "fix_json",
        description: "检查 JSON 语法完整性，确保所有括号和引号正确闭合",
      },
    };
  }
}

function extractPropsFromCode(code: string): string[] | null {
  const interfacePattern = /interface\s+DemoProps\s*\{([^}]+)\}/;
  const typePattern = /type\s+DemoProps\s*=\s*\{([^}]+)\}/;

  const interfaceMatch = code.match(interfacePattern);
  const typeMatch = code.match(typePattern);

  const propsBlock = interfaceMatch?.[1] || typeMatch?.[1];

  if (!propsBlock) {
    return null;
  }

  const propPattern = /(\w+)\??\s*:/g;
  const props: string[] = [];
  let match;

  while ((match = propPattern.exec(propsBlock)) !== null) {
    props.push(match[1]);
  }

  return props;
}

function extractPropsFromDestructuring(code: string): string[] | null {
  const patterns = [
    /function\s+\w+\s*\(\s*\{([^}]*)\}/,
    /const\s+\w+\s*=\s*\(\s*\{([^}]*)\}\s*\)/,
    /export\s+default\s+function\s+\w+\s*\(\s*\{([^}]*)\}/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (match) {
      const destructured = match[1];
      const propPattern = /(\w+)(?:\??:?[^,=]*)?(?:\s*=\s*[^,]+)?/g;
      const props: string[] = [];
      let propMatch;

      while ((propMatch = propPattern.exec(destructured)) !== null) {
        const propName = propMatch[1];
        if (
          propName &&
          !["type", "interface", "const", "let", "var"].includes(propName)
        ) {
          props.push(propName);
        }
      }

      if (props.length > 0) {
        return props;
      }
    }
  }

  return null;
}

function extractPropertiesFromSchema(schema: string): string[] | null {
  try {
    const parsed = JSON.parse(schema);

    if (!parsed.properties || typeof parsed.properties !== "object") {
      return [];
    }

    return Object.keys(parsed.properties);
  } catch {
    return null;
  }
}

function extractRequiredFromSchema(schema: string): string[] {
  try {
    const parsed = JSON.parse(schema);
    return Array.isArray(parsed.required) ? parsed.required : [];
  } catch {
    return [];
  }
}

export function validatePropsSchema(
  code: string,
  schema: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const codePropsFromInterface = extractPropsFromCode(code);
  const codePropsFromDestructuring = extractPropsFromDestructuring(code);

  // 优先使用接口提取，降级使用解构提取
  const codeProps = codePropsFromInterface || codePropsFromDestructuring;
  const usedFallback =
    !codePropsFromInterface && codePropsFromDestructuring !== null;

  const schemaProps = extractPropertiesFromSchema(schema);

  if (schemaProps === null) {
    errors.push({
      type: "json_syntax",
      message: "无法解析 Schema 中的 properties",
      severity: "error",
      location: { type: "schema" },
      fixSuggestion: {
        action: "fix_json",
        description: "检查 JSON 语法完整性，确保所有括号和引号正确闭合",
      },
    });
    return errors;
  }

  if (!codeProps) {
    // 完全无法提取 props 信息
    const hasPropsUsage = /props\.\w+/.test(code) || /\{\s*\w+\s*\}/.test(code);

    if (hasPropsUsage) {
      errors.push({
        type: "interface_not_found",
        message: "无法提取 props 信息，强烈建议添加 DemoProps 接口定义",
        severity: "warning",
        location: { type: "code" },
        fixSuggestion: {
          action: "add_interface",
          description:
            "添加 interface DemoProps { ... } 或 type DemoProps = { ... }",
          example: `interface DemoProps {\n  title: string;\n}`,
        },
      });
    }

    const requiredFields = extractRequiredFromSchema(schema);
    for (const field of requiredFields) {
      if (!schemaProps.includes(field)) {
        errors.push({
          type: "required_missing",
          message: `required 字段 "${field}" 未在 properties 中定义`,
          severity: "error",
          location: { type: "schema" },
          field: { name: field, path: `required.${field}` },
          fixSuggestion: {
            action: "remove_from_required",
            description: `从 required 数组中移除 "${field}"，或在 properties 中添加该字段定义`,
            example: `在 properties 中添加:\n"${field}": { "type": "string" }`,
          },
        });
      }
    }

    return errors;
  }

  // 降级提取成功时，附加 info 提示建议添加接口定义
  if (usedFallback) {
    errors.push({
      type: "interface_not_found",
      message: "建议添加 DemoProps 接口定义，以获得更完整的类型检查",
      severity: "info",
      location: { type: "code" },
      fixSuggestion: {
        action: "add_interface",
        description:
          "添加 interface DemoProps { ... } 或 type DemoProps = { ... }",
        example: `interface DemoProps {\n  title: string;\n}`,
      },
    });
  }

  const codePropsSet = new Set(codeProps);
  const schemaPropsSet = new Set(schemaProps);

  for (const prop of codeProps) {
    if (!schemaPropsSet.has(prop) && !prop.startsWith("__")) {
      errors.push({
        type: "props_code_not_in_schema",
        message: `代码中的 props "${prop}" 未在 Schema 的 properties 中定义`,
        severity: "warning",
        location: { type: "code" },
        field: { name: prop, path: `DemoProps.${prop}` },
        fixSuggestion: {
          action: "add_to_schema",
          description: `在 Schema 的 properties 中添加 "${prop}" 字段`,
          example: `"${prop}": { "type": "string" }`,
        },
      });
    }
  }

  for (const prop of schemaProps) {
    if (!codePropsSet.has(prop) && !prop.startsWith("__")) {
      errors.push({
        type: "props_schema_not_in_code",
        message: `Schema 中的 property "${prop}" 未在代码的 DemoProps 中定义`,
        severity: "info",
        location: { type: "schema" },
        field: { name: prop, path: `properties.${prop}` },
        fixSuggestion: {
          action: "remove_from_schema",
          description: `从 Schema 的 properties 中移除 "${prop}"，或在代码中使用它`,
        },
      });
    }
  }

  const requiredFields = extractRequiredFromSchema(schema);
  for (const field of requiredFields) {
    if (!schemaPropsSet.has(field)) {
      errors.push({
        type: "required_missing",
        message: `required 字段 "${field}" 未在 properties 中定义`,
        severity: "error",
        location: { type: "schema" },
        field: { name: field, path: `required.${field}` },
        fixSuggestion: {
          action: "remove_from_required",
          description: `从 required 数组中移除 "${field}"，或在 properties 中添加该字段定义`,
          example: `在 properties 中添加:\n"${field}": { "type": "string" }`,
        },
      });
    }
  }

  return errors;
}

export function validateAll(code: string, schema: string): ValidationResult {
  const errors: ValidationError[] = [];

  const jsonError = validateJsonSyntax(schema);
  if (jsonError) {
    errors.push(jsonError);
    return {
      isValid: false,
      errors,
    };
  }

  const propsErrors = validatePropsSchema(code, schema);
  errors.push(...propsErrors);

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function isValidJson(schema: string): boolean {
  return validateJsonSyntax(schema) === null;
}

/**
 * 将 ValidationResult 转换为 validate_demo 工具的结构化返回格式
 */
export function formatValidateDemoResult(
  result: ValidationResult,
  demoId: string,
): ValidateDemoResult {
  const checks: ValidationCheck[] = [];

  // JSON 语法检查
  const jsonErrors = result.errors.filter((e) => e.type === "json_syntax");
  checks.push({
    name: "json_syntax",
    passed: jsonErrors.length === 0,
    issues: jsonErrors.map((e) => ({
      severity: e.severity,
      message: e.message,
      location: {
        file: `demos/${demoId}/config.schema.json`,
        line: e.location?.line,
      },
      fix_suggestion: e.fixSuggestion?.description,
    })),
  });

  // Props 一致性检查
  const propsErrors = result.errors.filter(
    (e) =>
      e.type === "props_code_not_in_schema" ||
      e.type === "props_schema_not_in_code",
  );
  checks.push({
    name: "props_consistency",
    passed: propsErrors.length === 0,
    issues: propsErrors.map((e) => ({
      severity: e.severity,
      message: e.message,
      location: {
        file:
          e.location?.type === "code"
            ? `demos/${demoId}/index.tsx`
            : `demos/${demoId}/config.schema.json`,
        line: e.location?.line,
      },
      fix_suggestion: e.fixSuggestion?.description,
    })),
  });

  // required 完整性检查
  const requiredErrors = result.errors.filter(
    (e) => e.type === "required_missing",
  );
  checks.push({
    name: "required_integrity",
    passed: requiredErrors.length === 0,
    issues: requiredErrors.map((e) => ({
      severity: e.severity,
      message: e.message,
      location: {
        file: `demos/${demoId}/config.schema.json`,
        line: e.location?.line,
      },
      fix_suggestion: e.fixSuggestion?.description,
    })),
  });

  // 组件结构检查
  const interfaceErrors = result.errors.filter(
    (e) => e.type === "interface_not_found",
  );
  checks.push({
    name: "component_structure",
    passed: interfaceErrors.length === 0,
    issues: interfaceErrors.map((e) => ({
      severity: e.severity,
      message: e.message,
      location: {
        file: `demos/${demoId}/index.tsx`,
        line: e.location?.line,
      },
      fix_suggestion: e.fixSuggestion?.description,
    })),
  });

  return {
    passed: result.isValid,
    checks,
  };
}
