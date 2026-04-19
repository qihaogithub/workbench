/**
 * JSON Schema 生成器
 * 从 TypeScript 接口/类型提取属性并生成 JSON Schema
 */

export interface SchemaProperty {
  type: string;
  title?: string;
  default?: unknown;
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  format?: string;
  items?: SchemaProperty;
}

export interface GeneratedSchema {
  $schema: string;
  title: string;
  type: string;
  properties: Record<string, SchemaProperty>;
  required: string[];
}

interface ParsedProperty {
  name: string;
  type: string;
  optional: boolean;
  defaultValue?: string;
}

/**
 * 从代码中提取 interface DemoProps 或 type DemoProps 的属性列表
 */
function extractInterfaceProperties(code: string): ParsedProperty[] | null {
  // 匹配 interface DemoProps { ... }
  const interfacePattern = /interface\s+\w*Props\s*\{([\s\S]*?)\n\}/;
  // 匹配 type DemoProps = { ... }
  const typePattern = /type\s+\w*Props\s*=\s*\{([\s\S]*?)\n\};/;

  const interfaceMatch = code.match(interfacePattern);
  const typeMatch = code.match(typePattern);

  const body = interfaceMatch?.[1] || typeMatch?.[1];
  if (!body) return null;

  const properties: ParsedProperty[] = [];

  // 按行解析属性
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // 匹配: propName?: type; 或 propName: type;
    const match = trimmed.match(/^(\w+)(\?)?:\s*(.+?);?\s*$/);
    if (!match) continue;

    const name = match[1];
    const optional = match[2] === '?';
    let typeStr = match[3].trim();

    // 去除末尾分号
    typeStr = typeStr.replace(/;$/, '');

    properties.push({
      name,
      type: typeStr,
      optional,
    });
  }

  return properties.length > 0 ? properties : null;
}

/**
 * 从函数参数解构中提取 props
 */
function extractDestructuredProps(code: string): ParsedProperty[] | null {
  const patterns = [
    /function\s+\w+\s*\(\s*\{\s*([^}]*?)\s*\}(?:\s*:\s*\w+)?\s*\)/,
    /const\s+\w+\s*=\s*\(\s*\{\s*([^}]*?)\s*\}(?:\s*:\s*\w+)?\s*\)\s*=>/,
    /export\s+default\s+function\s+\w+\s*\(\s*\{\s*([^}]*?)\s*\}(?:\s*:\s*\w+)?\s*\)/,
  ];

  for (const pattern of patterns) {
    const match = code.match(pattern);
    if (!match) continue;

    const destructured = match[1];
    const properties: ParsedProperty[] = [];

    // 解析每个解构项
    const items = destructured.split(',').map((s) => s.trim()).filter(Boolean);

    for (const item of items) {
      // 匹配: propName, propName = 'default', propName: Type
      const itemMatch = item.match(/^(\w+)(?:\s*:\s*[^=]+)?(?:\s*=\s*(.+))?$/);
      if (!itemMatch) continue;

      const name = itemMatch[1];
      const defaultValue = itemMatch[2]?.trim();

      // 推断类型
      let inferredType = 'string';
      if (defaultValue) {
        if (defaultValue === 'true' || defaultValue === 'false') {
          inferredType = 'boolean';
        } else if (/^\d+$/.test(defaultValue)) {
          inferredType = 'number';
        } else if (defaultValue.startsWith('[')) {
          inferredType = 'array';
        }
      }

      properties.push({
        name,
        type: inferredType,
        optional: true,
        defaultValue,
      });
    }

    if (properties.length > 0) {
      return properties;
    }
  }

  return null;
}

/**
 * 将 TypeScript 类型字符串映射为 JSON Schema 类型
 */
function mapTypeToSchema(tsType: string): Omit<SchemaProperty, 'title'> {
  const cleanType = tsType.trim();

  // boolean
  if (cleanType === 'boolean') {
    return { type: 'boolean' };
  }

  // number / integer
  if (cleanType === 'number' || cleanType === 'integer') {
    return { type: 'number' };
  }

  // string
  if (cleanType === 'string') {
    return { type: 'string' };
  }

  // 联合类型 'a' | 'b' | 'c'
  if (cleanType.includes("'")) {
    const enumValues: string[] = [];
    const quotePattern = /['"]([^'"]+)['"]/g;
    let match;
    while ((match = quotePattern.exec(cleanType)) !== null) {
      enumValues.push(match[1]);
    }
    if (enumValues.length > 0) {
      return { type: 'string', enum: enumValues };
    }
  }

  // 数组类型
  if (cleanType.endsWith('[]') || cleanType.startsWith('Array<')) {
    return { type: 'array', items: { type: 'string' } };
  }

  // 对象类型
  if (cleanType === 'Record<string, unknown>' || cleanType === 'object') {
    return { type: 'object' };
  }

  // 默认回退到 string
  return { type: 'string' };
}

/**
 * 为类型生成合理的默认值
 */
function getDefaultForType(prop: Omit<SchemaProperty, 'title'>): unknown {
  switch (prop.type) {
    case 'boolean':
      return false;
    case 'number':
      return 0;
    case 'array':
      return [];
    case 'object':
      return {};
    case 'string':
    default:
      if (prop.enum && prop.enum.length > 0) {
        return prop.enum[0];
      }
      return '';
  }
}

/**
 * 从代码生成 JSON Schema
 */
export function generateSchemaFromCode(code: string): GeneratedSchema | null {
  let properties = extractInterfaceProperties(code);

  // 如果找不到 interface，尝试从解构参数提取
  if (!properties) {
    properties = extractDestructuredProps(code);
  }

  if (!properties || properties.length === 0) {
    return null;
  }

  const schemaProperties: Record<string, SchemaProperty> = {};
  const required: string[] = [];

  for (const prop of properties) {
    const schemaProp = mapTypeToSchema(prop.type);

    schemaProperties[prop.name] = {
      ...schemaProp,
      title: prop.name,
      default: prop.defaultValue !== undefined
        ? parseDefaultValue(prop.defaultValue, schemaProp.type)
        : getDefaultForType(schemaProp),
    };

    if (!prop.optional) {
      required.push(prop.name);
    }
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Demo 配置',
    type: 'object',
    properties: schemaProperties,
    required,
  };
}

/**
 * 解析代码中的默认值字符串为实际值
 */
function parseDefaultValue(value: string, type: string): unknown {
  const trimmed = value.trim();

  if (type === 'boolean') {
    return trimmed === 'true';
  }

  if (type === 'number') {
    const num = parseFloat(trimmed);
    return isNaN(num) ? 0 : num;
  }

  if (type === 'array') {
    try {
      // 尝试解析数组字面量
      return JSON.parse(trimmed.replace(/'/g, '"'));
    } catch {
      return [];
    }
  }

  // 去除字符串引号
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

/**
 * 合并生成的 Schema 与现有 Schema
 * 保留现有 Schema 中的 ui 配置、default 等扩展字段
 */
export function mergeWithExistingSchema(
  generated: GeneratedSchema,
  existing: Record<string, unknown>,
): GeneratedSchema {
  const merged = { ...generated };

  if (existing.properties && typeof existing.properties === 'object') {
    const existingProps = existing.properties as Record<string, SchemaProperty>;

    for (const [key, prop] of Object.entries(merged.properties)) {
      const existingProp = existingProps[key];
      if (!existingProp) continue;

      // 保留现有配置中的扩展字段
      const keepFields = ['default', 'description', 'format', 'ui:widget', 'enumNames', 'minimum', 'maximum', 'maxLength'];
      const existingPropRecord = existingProp as unknown as Record<string, unknown>;
      const propRecord = prop as unknown as Record<string, unknown>;
      for (const field of keepFields) {
        if (existingPropRecord[field] !== undefined) {
          propRecord[field] = existingPropRecord[field];
        }
      }
    }
  }

  // 保留根级别的 $demo 配置
  if (existing.$demo) {
    (merged as Record<string, unknown>).$demo = existing.$demo;
  }

  return merged;
}
