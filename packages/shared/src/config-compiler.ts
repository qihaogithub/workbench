import { parse } from "acorn";
import type { Node } from "acorn";

const VALID_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "text",
  "color",
  "image",
  "imageList",
  "array",
  "richtext",
  "enum",
]);

const TYPE_META_KEYS = new Set([
  "enum",
  "enumNames",
  "min",
  "max",
  "maxLength",
  "accept",
  "maxSize",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "maxItems",
  "collapsed",
  "itemTitleField",
  "widget",
  "format",
  "category",
  "visibleWhen",
  "note",
  "description",
]);

const UI_OPTIONS_KEYS = new Set([
  "accept",
  "maxSize",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "maxItems",
  "collapsed",
  "itemTitleField",
  "category",
  "visibleWhen",
]);

function locFromNode(
  node: Node,
  source: string,
): { line: number; column: number } {
  if (node.loc) {
    return { line: node.loc.start.line, column: node.loc.start.column };
  }
  const prefix = source.substring(0, node.start);
  const line = prefix.split("\n").length;
  const lastNewline = prefix.lastIndexOf("\n");
  const column = lastNewline >= 0 ? node.start - lastNewline - 1 : node.start;
  return { line, column };
}

export class ConfigCompileError extends Error {
  line: number;
  column: number;
  code: string;
  suggestion?: string;

  constructor(
    message: string,
    line: number,
    column: number,
    code: string,
    suggestion?: string,
  ) {
    super(message);
    this.name = "ConfigCompileError";
    this.line = line;
    this.column = column;
    this.code = code;
    this.suggestion = suggestion;
  }
}

function createError(
  node: Node,
  source: string,
  code: string,
  message: string,
  suggestion?: string,
): ConfigCompileError {
  const { line, column } = locFromNode(node, source);
  return new ConfigCompileError(message, line, column, code, suggestion);
}

function extractKey(node: Node, source: string): string {
  if (node.type === "Identifier") return (node as any).name;
  if (node.type === "Literal") {
    const v = (node as any).value;
    if (typeof v === "string" || typeof v === "number") return String(v);
    throw createError(
      node,
      source,
      "INVALID_KEY",
      "对象的 key 必须是字符串或标识符",
      "请使用字符串 key，例如 { \"title\": ... } 或 { title: ... }",
    );
  }
  throw createError(
    node,
    source,
    "INVALID_KEY",
    "对象的 key 必须是字符串或标识符",
    "请使用字符串 key，例如 { \"title\": ... } 或 { title: ... }",
  );
}

function extractValue(node: Node, source: string): unknown {
  switch (node.type) {
    case "Literal": {
      const n = node as any;
      if (n.regex) {
        throw createError(
          node,
          source,
          "FORBIDDEN_REGEXP",
          "不允许使用正则表达式字面量",
          "请使用字符串替代正则表达式",
        );
      }
      return n.value;
    }
    case "ObjectExpression": {
      const obj: Record<string, unknown> = {};
      for (const prop of (node as any).properties) {
        if (prop.type === "SpreadElement") {
          throw createError(
            prop,
            source,
            "FORBIDDEN_SPREAD",
            "不允许使用展开运算符",
            "请显式列出每一项，例如 { a: 1, b: 2 }",
          );
        }
        const k = extractKey(prop.key, source);
        obj[k] = extractValue(prop.value, source);
      }
      return obj;
    }
    case "ArrayExpression": {
      return (node as any).elements.map(
        (el: Node | null, _idx: number) => {
          if (el === null) {
            throw createError(
              node,
              source,
              "FORBIDDEN_SPARSE",
              "数组不允许有空元素",
              "请填写合法的值",
            );
          }
          if (el.type === "SpreadElement") {
            throw createError(
              el,
              source,
              "FORBIDDEN_SPREAD",
              "不允许使用数组展开运算符",
              "请显式列出每一个数组元素",
            );
          }
          return extractValue(el, source);
        },
      );
    }
    case "UnaryExpression": {
      const arg = extractValue((node as any).argument, source);
      if ((node as any).operator === "-") {
        if (typeof arg === "number") return -arg;
      }
      throw createError(
        node,
        source,
        "FORBIDDEN_EXPRESSION",
        `不支持的一元运算符: ${(node as any).operator}`,
        "请直接使用字面量值",
      );
    }
    case "TemplateLiteral":
      throw createError(
        node,
        source,
        "FORBIDDEN_TEMPLATE",
        "不允许使用模板字符串，请使用普通字符串（单引号或双引号）",
        "将模板字符串改为普通字符串字面量",
      );
    case "Identifier":
      throw createError(
        node,
        source,
        "FORBIDDEN_VARIABLE",
        `不允许使用变量引用 "${(node as any).name}"，请使用字面量值`,
        "将变量引用替换为字符串、数字或布尔值字面量",
      );
    case "CallExpression":
    case "NewExpression":
      throw createError(
        node,
        source,
        "FORBIDDEN_CALL",
        "不允许使用函数调用或 new 表达式",
        "请使用字面量值",
      );
    case "BinaryExpression":
    case "LogicalExpression":
      throw createError(
        node,
        source,
        "FORBIDDEN_EXPRESSION",
        "不允许使用运算表达式",
        "请直接使用字面量值",
      );
    case "ArrowFunctionExpression":
    case "FunctionExpression":
      throw createError(
        node,
        source,
        "FORBIDDEN_FUNCTION",
        "不允许使用函数定义",
        "请使用字面量值",
      );
    default:
      throw createError(
        node,
        source,
        "FORBIDDEN_SYNTAX",
        `不支持的语法: ${node.type}`,
        "请使用对象字面量、数组字面量、字符串、数字或布尔值",
      );
  }
}

interface CompiledField {
  result: Record<string, unknown>;
  required: boolean;
  isArray?: boolean;
  arrayChildren?: Record<string, unknown>;
  oneOfVariants?: Record<string, unknown>;
  arrayMeta?: Record<string, unknown>;
}

function compileFieldDescriptor(
  key: string,
  field: Record<string, unknown>,
): CompiledField {
  const configType = field.type as string | undefined;
  if (!configType || !VALID_TYPES.has(configType)) {
    throw new ConfigCompileError(
      `字段 "${key}" 的类型 "${configType}" 不合法，允许的类型: ${Array.from(VALID_TYPES).join(", ")}`,
      0,
      0,
      "INVALID_FIELD_TYPE",
      `请将 type 改为合法值之一，例如 type: "string"`,
    );
  }

  const result: Record<string, unknown> = {};
  const uiOptions: Record<string, unknown> = {};

  switch (configType) {
    case "string":
      result.type = "string";
      break;
    case "number":
      result.type = "number";
      break;
    case "integer":
      result.type = "integer";
      break;
    case "boolean":
      result.type = "boolean";
      break;
    case "text":
      result.type = "string";
      result.maxLength = 1000;
      break;
    case "color":
      result.type = "string";
      result.format = "color";
      break;
    case "image":
      result.type = "string";
      result.format = "image";
      break;
    case "imageList":
      result.type = "array";
      result.items = { type: "string" };
      break;
    case "richtext":
      result.type = "string";
      result["ui:widget"] = "richtext";
      break;
    case "enum":
      result.type = "string";
      break;
    case "array":
      result.type = "array";
      break;
  }

  for (const [k, v] of Object.entries(field)) {
    if (k === "type") continue;
    if (k === "title") result.title = v;
    else if (k === "default") result.default = v;
    else if (k === "required") continue;
    else if (k === "description") result.description = v;
    else if (k === "enum") result.enum = v;
    else if (k === "enumNames") result.enumNames = v;
    else if (k === "min") result.minimum = v;
    else if (k === "max") result.maximum = v;
    else if (k === "maxLength") result.maxLength = v;
    else if (k === "format" && configType !== "color" && configType !== "image") {
      result.format = v;
    } else if (k === "widget" && configType !== "richtext") {
      result["ui:widget"] = v;
    } else if (k === "note") {
      if (!result.$demo) result.$demo = {};
      (result.$demo as Record<string, unknown>).note = v;
    } else if (UI_OPTIONS_KEYS.has(k)) {
      uiOptions[k] = v;
    } else if (k === "children" || k === "variants") {
      continue;
    } else if (k === "visibleWhen") {
      uiOptions.visibleWhen = v;
    }
  }

  const required = field.required === true;

  let arrayChildren: Record<string, unknown> | undefined;
  let oneOfVariants: Record<string, unknown> | undefined;
  let arrayMeta: Record<string, unknown> | undefined;
  let isArray = false;

  if (configType === "array") {
    isArray = true;
    arrayMeta = {};

    const arrChildren = field.children as Record<string, unknown> | undefined;
    const arrVariants = field.variants as Record<string, unknown> | undefined;

    if (arrChildren) {
      arrayChildren = arrChildren;
    } else if (arrVariants) {
      oneOfVariants = arrVariants;
    }

    if (field._fixed !== undefined) {
      uiOptions.fixed = field._fixed;
    }
    if (field._maxItems !== undefined || field._fixed !== undefined) {
      arrayMeta = {};
      if (field._maxItems !== undefined) arrayMeta.maxItems = field._maxItems;
      if (field._fixed !== undefined) arrayMeta.fixed = field._fixed;
    }
  }

  if (Object.keys(uiOptions).length > 0) {
    result["ui:options"] = uiOptions;
  }

  return {
    result,
    required,
    isArray,
    arrayChildren,
    oneOfVariants,
    arrayMeta,
  };
}

function compileOneOfVariantsForArray(
  variants: Record<string, unknown>,
): Record<string, unknown>[] {
  return Object.entries(variants).map(([variantKey, variantDef]) => {
    const v = variantDef as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    const variantDemo: Record<string, unknown> = {};

    // discriminator field
    props.type = { const: variantKey, type: "string", title: "模块类型" };
    required.push("type");

    for (const [fk, fv] of Object.entries(v)) {
      if (fk === "title") continue;
      if (fk.startsWith("_")) {
        if (fk === "_maxItems") {
          variantDemo.maxItems = fv;
        }
        continue;
      }
      if (fk === "_fixed") continue;
      const compiled = compileFieldDescriptor(fk, fv as Record<string, unknown>);
      props[fk] = compiled.result;
      if (compiled.required) required.push(fk);
    }

    const result: Record<string, unknown> = {
      title: (v.title as string) || variantKey,
      properties: props,
      required,
    };
    if (Object.keys(variantDemo).length > 0) {
      result.$demo = variantDemo;
    }
    return result;
  });
}

function compileOneOfVariantsForEnum(
  enumFieldKey: string,
  enumValues: unknown[],
  enumNames: string[] | undefined,
  variants: Record<string, unknown>,
): Record<string, unknown>[] {
  return Object.entries(variants).map(([variantKey, variantDef], idx) => {
    const v = variantDef as Record<string, unknown>;
    const props: Record<string, unknown> = {};
    const required: string[] = [];
    const variantDemo: Record<string, unknown> = {};

    // discriminator field
    props[enumFieldKey] = { const: variantKey };
    required.push(enumFieldKey);

    const variantName =
      enumNames && idx < enumNames.length ? enumNames[idx] : variantKey;

    for (const [fk, fv] of Object.entries(v)) {
      if (fk.startsWith("_")) {
        if (fk === "_maxItems") {
          variantDemo.maxItems = fv;
        }
        continue;
      }
      const compiled = compileFieldDescriptor(fk, fv as Record<string, unknown>);
      props[fk] = compiled.result;
      if (compiled.required) required.push(fk);
    }

    const result: Record<string, unknown> = {
      title: variantName,
      properties: props,
      required,
    };
    if (Object.keys(variantDemo).length > 0) {
      result.$demo = variantDemo;
    }
    return result;
  });
}

function transformToJsonSchema(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {},
    required: [],
  };

  const demo: Record<string, unknown> = {};
  const requiredFields: string[] = [];

  for (const [topKey, topValue] of Object.entries(config)) {
    if (topKey === "$preview") {
      const pv = topValue as Record<string, unknown>;
      demo.previewSize = { width: pv.width, height: pv.height };
      continue;
    }

    if (topKey === "$positionable") {
      demo.positionable = topValue;
      continue;
    }

    // Group
    const group = topValue as Record<string, unknown>;
    for (const [fieldKey, fieldDef] of Object.entries(group)) {
      const compiled = compileFieldDescriptor(
        fieldKey,
        fieldDef as Record<string, unknown>,
      );

      if (compiled.required) {
        requiredFields.push(fieldKey);
      }

      const propResult = { ...compiled.result };

      // Inject group name
      const existingUiOpts = propResult["ui:options"] as
        | Record<string, unknown>
        | undefined;
      propResult["ui:options"] = {
        ...(existingUiOpts || {}),
        group: topKey,
      };

      // Handle array children
      if (compiled.isArray && compiled.arrayChildren) {
        const childProps: Record<string, unknown> = {};
        const childRequired: string[] = [];
        for (const [ck, cv] of Object.entries(
          compiled.arrayChildren,
        )) {
          const childCompiled = compileFieldDescriptor(
            ck,
            cv as Record<string, unknown>,
          );
          childProps[ck] = childCompiled.result;
          if (childCompiled.required) childRequired.push(ck);
        }
        const itemsObj: Record<string, unknown> = {
          type: "object",
          properties: childProps,
        };
        if (childRequired.length > 0) {
          itemsObj.required = childRequired;
        }
        propResult.items = itemsObj;
      } else if (compiled.isArray && compiled.oneOfVariants) {
        propResult.items = {
          type: "object",
          oneOf: compileOneOfVariantsForArray(compiled.oneOfVariants),
        };
      }

      // Handle enum field with variants (oneOf)
      if (
        compiled.result.type === "string" &&
        compiled.result.enum &&
        "variants" in (fieldDef as Record<string, unknown>)
      ) {
        const variants = (fieldDef as Record<string, unknown>).variants as Record<string, unknown>;
        propResult.oneOf = compileOneOfVariantsForEnum(
          fieldKey,
          compiled.result.enum as unknown[],
          compiled.result.enumNames as string[] | undefined,
          variants,
        );
      }

      (schema.properties as Record<string, unknown>)[fieldKey] = propResult;
    }
  }

  if (Object.keys(demo).length > 0) {
    schema.$demo = demo;
  }
  if (requiredFields.length > 0) {
    schema.required = requiredFields;
  }

  return schema;
}

export function compileConfigTs(source: string): string {
  let ast: Node;
  try {
    ast = parse(source, {
      ecmaVersion: 2022,
      sourceType: "module",
      locations: true,
    }) as unknown as Node;
  } catch (err: any) {
    const message = err.message || String(err);
    const line = err.loc?.line || 1;
    const column = err.loc?.column || 0;
    throw new ConfigCompileError(
      `config.ts 语法错误: ${message}`,
      line,
      column,
      "PARSE_ERROR",
      "请检查括号、引号是否匹配，语法是否正确",
    );
  }

  const body = (ast as any).body as Node[];
  let exportObj: Node | undefined;

  for (const stmt of body) {
    if (stmt.type === "ExportDefaultDeclaration") {
      exportObj = (stmt as any).declaration;
      break;
    }
  }

  if (!exportObj) {
    throw new ConfigCompileError(
      "config.ts 必须包含 export default，例如: export default { ... }",
      1,
      0,
      "MISSING_EXPORT_DEFAULT",
      "请在文件顶部添加 export default { ... }",
    );
  }

  if (exportObj.type !== "ObjectExpression") {
    throw createError(
      exportObj,
      source,
      "INVALID_EXPORT",
      "export default 必须导出对象字面量，不支持变量引用",
      "请直接导出对象字面量: export default { ... }",
    );
  }

  const config = extractValue(exportObj, source) as Record<string, unknown>;
  const schema = transformToJsonSchema(config);

  return JSON.stringify(schema, null, 2);
}

// ============================================================
// JSON Schema → config.ts 反向编译器（存量迁移用）
// ============================================================

function reverseType(field: Record<string, unknown>): string {
  const type = field.type as string | undefined;
  const format = field.format as string | undefined;
  const uiWidget = field["ui:widget"] as string | undefined;

  if (type === "array") {
    const items = field.items as Record<string, unknown> | undefined;
    if (items && items.type === "string" && !items.properties && !items.oneOf) {
      return "imageList";
    }
    return "array";
  }

  if (type === "number") return "number";
  if (type === "integer") return "integer";
  if (type === "boolean") return "boolean";

  if (type === "string" || !type) {
    if (uiWidget === "richtext") return "richtext";
    if (format === "color") return "color";
    if (format === "image") return "image";
    if (field.enum && Array.isArray(field.enum) && (field.enum as unknown[]).length > 0) {
      return "enum";
    }
    if (field.maxLength === 1000 && !format) return "text";
    return "string";
  }

  return type || "string";
}

function reverseFieldMeta(
  field: Record<string, unknown>,
  resolvedType: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  result.type = resolvedType;

  if (field.title !== undefined) result.title = field.title;
  if (field.default !== undefined) result.default = field.default;
  if (field.description !== undefined) result.description = field.description;

  if (field.enum !== undefined && resolvedType === "enum") {
    result.enum = field.enum;
  }
  if (field.enumNames !== undefined && resolvedType === "enum") {
    result.enumNames = field.enumNames;
  }

  if (field.minimum !== undefined) result.min = field.minimum;
  if (field.maximum !== undefined) result.max = field.maximum;

  if (field.maxLength !== undefined && resolvedType !== "text") {
    result.maxLength = field.maxLength;
  }

  if (field.format !== undefined && resolvedType !== "color" && resolvedType !== "image") {
    result.format = field.format;
  }

  const uiWidget = field["ui:widget"] as string | undefined;
  if (uiWidget !== undefined && resolvedType !== "richtext") {
    result.widget = uiWidget;
  }

  const uiOptions = field["ui:options"] as Record<string, unknown> | undefined;
  if (uiOptions) {
    if (uiOptions.accept !== undefined) result.accept = uiOptions.accept;
    if (uiOptions.maxSize !== undefined) result.maxSize = uiOptions.maxSize;
    if (uiOptions.minWidth !== undefined) result.minWidth = uiOptions.minWidth;
    if (uiOptions.minHeight !== undefined) result.minHeight = uiOptions.minHeight;
    if (uiOptions.maxWidth !== undefined) result.maxWidth = uiOptions.maxWidth;
    if (uiOptions.maxHeight !== undefined) result.maxHeight = uiOptions.maxHeight;
    if (uiOptions.maxItems !== undefined) result.maxItems = uiOptions.maxItems;
    if (uiOptions.collapsed !== undefined) result.collapsed = uiOptions.collapsed;
    if (uiOptions.itemTitleField !== undefined) result.itemTitleField = uiOptions.itemTitleField;
    if (uiOptions.category !== undefined) result.category = uiOptions.category;
    if (uiOptions.visibleWhen !== undefined) result.visibleWhen = uiOptions.visibleWhen;
    if (uiOptions.fixed !== undefined) result._fixed = uiOptions.fixed;
  }

  const demo = field.$demo as Record<string, unknown> | undefined;
  if (demo?.note !== undefined) result.note = demo.note;

  return result;
}

function reverseOneOfVariants(
  oneOf: Record<string, unknown>[],
): Record<string, unknown> {
  const variants: Record<string, unknown> = {};
  for (const variant of oneOf) {
    const props = variant.properties as Record<string, unknown> | undefined;
    if (!props) continue;

    const typeField = Object.values(props).find(
      (p) => typeof p === "object" && p !== null && (p as Record<string, unknown>).const !== undefined,
    ) as Record<string, unknown> | undefined;
    const variantKey = typeField?.const as string | undefined;
    if (!variantKey) continue;

    const variantDef: Record<string, unknown> = {};
    if (variant.title !== undefined) variantDef.title = variant.title;

    for (const [pk, pv] of Object.entries(props)) {
      if (pk === "type") continue;
      if (typeof pv !== "object" || pv === null || Array.isArray(pv)) continue;
      const pvObj = pv as Record<string, unknown>;
      const rt = reverseType(pvObj);
      variantDef[pk] = reverseFieldMeta(pvObj, rt);
    }

    const variantDemo = variant.$demo as Record<string, unknown> | undefined;
    if (variantDemo?.maxItems !== undefined) {
      variantDef._maxItems = variantDemo.maxItems;
    }

    variants[variantKey] = variantDef;
  }
  return variants;
}

function formatConfigTsValue(val: unknown, indent: number): string {
  const pad = "  ".repeat(indent);
  const padInner = "  ".repeat(indent + 1);

  if (val === null) return "null";
  if (typeof val === "undefined") return "undefined";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return JSON.stringify(val);

  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    const items = val.map((item) => `${padInner}${formatConfigTsValue(item, indent + 1)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }

  if (typeof val === "object") {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return "{}";

    const singleLineEntries: string[] = [];
    const multilineEntries: { key: string; value: unknown }[] = [];

    for (const [key, v] of entries) {
      const formatted = formatConfigTsValue(v, indent + 1);
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null || v === undefined) {
        singleLineEntries.push(`${JSON.stringify(key)}: ${formatted}`);
      } else if (Array.isArray(v) && v.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null)) {
        singleLineEntries.push(`${JSON.stringify(key)}: ${formatted}`);
      } else {
        multilineEntries.push({ key, value: v });
      }
    }

    if (multilineEntries.length === 0) {
      const joined = singleLineEntries.join(", ");
      return `{ ${joined} }`;
    }

    const parts: string[] = [];
    for (const entry of singleLineEntries) {
      parts.push(`${padInner}${entry}`);
    }
    for (const { key, value: mv } of multilineEntries) {
      parts.push(`${padInner}${JSON.stringify(key)}: ${formatConfigTsValue(mv, indent + 1)}`);
    }
    return `{\n${parts.join(",\n")},\n${pad}}`;
  }

  return JSON.stringify(val);
}

export function decompileSchema(schemaJson: string): string {
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(schemaJson);
  } catch (err: any) {
    throw new Error(`无法解析 JSON Schema: ${err.message}`);
  }

  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new Error("JSON Schema 必须是对象");
  }

  const config: Record<string, unknown> = {};
  const demo = schema.$demo as Record<string, unknown> | undefined;

  if (demo) {
    if (demo.previewSize) {
      const ps = demo.previewSize as Record<string, unknown>;
      config.$preview = { width: ps.width, height: ps.height };
    }
    if (demo.positionable) {
      config.$positionable = demo.positionable;
    }
  }

  const properties = schema.properties as Record<string, unknown> | undefined;
  const requiredFields = (schema.required as string[] | undefined) || [];

  if (properties && Object.keys(properties).length > 0) {
    const groupMap = new Map<string, Record<string, unknown>>();

    for (const [fieldName, fieldDef] of Object.entries(properties)) {
      if (typeof fieldDef !== "object" || fieldDef === null || Array.isArray(fieldDef)) continue;
      const fd = fieldDef as Record<string, unknown>;

      const rt = reverseType(fd);
      const meta = reverseFieldMeta(fd, rt);
      if (requiredFields.includes(fieldName)) {
        meta.required = true;
      }

      if (rt === "array") {
        const items = fd.items as Record<string, unknown> | undefined;
        if (items) {
          if (items.oneOf && Array.isArray(items.oneOf) && (items.oneOf as unknown[]).length > 0) {
            meta.variants = reverseOneOfVariants(items.oneOf as Record<string, unknown>[]);
          } else if (items.properties && !items.oneOf) {
            const children: Record<string, unknown> = {};
            const childProps = items.properties as Record<string, unknown>;
            for (const [ck, cv] of Object.entries(childProps)) {
              if (typeof cv !== "object" || cv === null || Array.isArray(cv)) continue;
              const cvObj = cv as Record<string, unknown>;
              const crt = reverseType(cvObj);
              children[ck] = reverseFieldMeta(cvObj, crt);
            }
            meta.children = children;
          }
        }
      }

      const uiOptions = fd["ui:options"] as Record<string, unknown> | undefined;
      const groupName = (uiOptions?.group as string) || "常规";

      if (!groupMap.has(groupName)) {
        groupMap.set(groupName, {});
      }
      groupMap.get(groupName)![fieldName] = meta;
    }

    for (const [groupName, fields] of groupMap) {
      config[groupName] = fields;
    }
  }

  return `export default ${formatConfigTsValue(config, 0)};\n`;
}
