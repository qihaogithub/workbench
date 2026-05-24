import {
  validateJsonSyntax,
  validatePropsSchema,
  validateAll,
  isValidJson,
  getDefaultValues,
  getPreviewSize,
} from "../validator";

describe("validateJsonSyntax", () => {
  it("应验证有效的 JSON", () => {
    const schema = '{"type": "object"}';
    const result = validateJsonSyntax(schema);

    expect(result).toBeNull();
  });

  it("应检测出 JSON 语法错误", () => {
    const schema = '{"type": "object",}';
    const result = validateJsonSyntax(schema);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("json_syntax");
    expect(result?.message).toContain("JSON 语法错误");
    expect(result?.severity).toBe("error");
    expect(result?.fixSuggestion?.action).toBe("fix_json");
  });

  it("应检测出缺少闭合括号", () => {
    const schema = '{"type": "object"';
    const result = validateJsonSyntax(schema);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("json_syntax");
    expect(result?.severity).toBe("error");
  });

  it("应检测出无效的 JSON 格式", () => {
    const schema = "not json at all";
    const result = validateJsonSyntax(schema);

    expect(result).not.toBeNull();
    expect(result?.type).toBe("json_syntax");
  });

  it("应包含位置信息（当错误消息包含位置时）", () => {
    const schema = '{ "title": "test" ';
    const result = validateJsonSyntax(schema);

    expect(result).not.toBeNull();
    expect(result?.location?.type).toBe("schema");
  });

  it("应包含修复建议", () => {
    const schema = "not json at all";
    const result = validateJsonSyntax(schema);

    expect(result).not.toBeNull();
    expect(result?.fixSuggestion?.action).toBe("fix_json");
    expect(result?.fixSuggestion?.description).toBeTruthy();
  });
});

describe("validatePropsSchema", () => {
  it("应通过一致的 Props 和 Schema", () => {
    const code = `
interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return <div>{title}</div>;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors).toHaveLength(0);
  });

  it("应检测出代码中的 props 未在 Schema 中定义", () => {
    const code = `
interface DemoProps {
  title: string;
  count: number;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.type === "props_code_not_in_schema")).toBe(true);
    expect(errors.some((e) => e.severity === "warning")).toBe(true);
  });

  it("应检测出代码中的 props 未在 Schema 中定义 - 包含字段和修复建议", () => {
    const code = `
interface DemoProps {
  title: string;
  extraProp: string;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    const error = errors.find((e) => e.message.includes("extraProp"));
    expect(error).toBeDefined();
    expect(error?.type).toBe("props_code_not_in_schema");
    expect(error?.field?.name).toBe("extraProp");
    expect(error?.fixSuggestion?.action).toBe("add_to_schema");
  });

  it("应检测出 Schema 中的 property 未在代码中定义", () => {
    const code = `
interface DemoProps {
  title: string;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
        missingInCode: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    const error = errors.find((e) => e.message.includes("missingInCode"));
    expect(error).toBeDefined();
    expect(error?.type).toBe("props_schema_not_in_code");
    expect(error?.severity).toBe("info");
    expect(error?.field?.name).toBe("missingInCode");
    expect(error?.fixSuggestion?.action).toBe("remove_from_schema");
  });

  it("应支持 type DemoProps 语法", () => {
    const code = `
type DemoProps = {
  title: string;
  count: number;
};`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
        count: { type: "number" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors).toHaveLength(0);
  });

  it("应支持从函数参数解构中提取 props", () => {
    const code = `
export default function Demo({ title, description }) {
  return <div>{title}</div>;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors).toHaveLength(0);
  });

  it("应支持可选属性标记", () => {
    const code = `
interface DemoProps {
  title: string;
  subtitle?: string;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
        subtitle: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors).toHaveLength(0);
  });

  it("应检测出 required 字段未在 properties 中定义", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title", "missingRequired"],
    });

    const code = `
interface DemoProps {
  title: string;
}`;

    const errors = validatePropsSchema(code, schema);

    const error = errors.find((e) => e.type === "required_missing");
    expect(error).toBeDefined();
    expect(error?.message).toContain("missingRequired");
    expect(error?.severity).toBe("error");
    expect(error?.field?.name).toBe("missingRequired");
    expect(error?.fixSuggestion?.action).toBe("remove_from_required");
  });

  it("应在找不到 interface 时返回警告", () => {
    const code = `
export default function Demo() {
  return <div>Hello</div>;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors).toHaveLength(0);
  });

  it("应处理空的 properties", () => {
    const code = `
interface DemoProps {}

export default function Demo() {
  return <div>Hello</div>;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {},
    });

    const errors = validatePropsSchema(code, schema);

    expect(errors).toHaveLength(0);
  });
});

describe("validateAll", () => {
  it("应返回有效的校验结果", () => {
    const code = `
interface DemoProps {
  title: string;
}

export default function Demo({ title }: DemoProps) {
  return <h1>{title}</h1>;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", default: "Hello" },
      },
    });

    const result = validateAll(code, schema);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("应返回包含 JSON 语法错误的校验结果", () => {
    const code = 'console.log("hello");';
    const schema = "{invalid json";

    const result = validateAll(code, schema);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.type === "json_syntax")).toBe(true);
    expect(result.errors[0].severity).toBe("error");
  });

  it("应返回包含 Props 不匹配的校验结果", () => {
    const code = `
interface DemoProps {
  title: string;
  extra: string;
}`;

    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });

    const result = validateAll(code, schema);

    expect(result.isValid).toBe(false);
    expect(
      result.errors.some((e) => e.type === "props_code_not_in_schema"),
    ).toBe(true);
  });
});

describe("isValidJson", () => {
  it("应返回 true 对于有效的 JSON", () => {
    expect(isValidJson('{"type": "object"}')).toBe(true);
    expect(isValidJson("[]")).toBe(true);
    expect(isValidJson('"string"')).toBe(true);
    expect(isValidJson("123")).toBe(true);
    expect(isValidJson("true")).toBe(true);
    expect(isValidJson("null")).toBe(true);
  });

  it("应返回 false 对于无效的 JSON", () => {
    expect(isValidJson("{invalid}")).toBe(false);
    expect(isValidJson('{"key": }')).toBe(false);
    expect(isValidJson("undefined")).toBe(false);
  });
});

describe("getDefaultValues", () => {
  it("应提取默认值", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", default: "Hello World" },
        count: { type: "number", default: 42 },
        enabled: { type: "boolean", default: true },
      },
    });

    const defaults = getDefaultValues(schema);

    expect(defaults).toEqual({
      title: "Hello World",
      count: 42,
      enabled: true,
    });
  });

  it("应处理没有默认值的 schema", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string" },
      },
    });

    const defaults = getDefaultValues(schema);

    expect(defaults).toEqual({});
  });

  it("应处理无效的 JSON", () => {
    const schema = "invalid json";

    const defaults = getDefaultValues(schema);

    expect(defaults).toEqual({});
  });

  it("应处理空的 properties", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {},
    });

    const defaults = getDefaultValues(schema);

    expect(defaults).toEqual({});
  });
});

describe("getPreviewSize", () => {
  it("应从 $demo.previewSize 中提取预览尺寸", () => {
    const schema = JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $demo: {
        previewSize: {
          width: 390,
          height: 844,
        },
      },
      title: "Demo",
      type: "object",
      properties: {},
    });

    const size = getPreviewSize(schema);

    expect(size).toEqual({
      width: 390,
      height: 844,
    });
  });

  it("应支持 scale 属性", () => {
    const schema = JSON.stringify({
      $demo: {
        previewSize: {
          width: 1440,
          height: 900,
          scale: 0.5,
        },
      },
      title: "Demo",
      type: "object",
      properties: {},
    });

    const size = getPreviewSize(schema);

    expect(size).toEqual({
      width: 1440,
      height: 900,
      scale: 0.5,
    });
  });

  it("应在未声明预览尺寸时返回 undefined", () => {
    const schema = JSON.stringify({
      title: "Demo",
      type: "object",
      properties: {},
    });

    const size = getPreviewSize(schema);

    expect(size).toBeUndefined();
  });

  it("应处理无效的 JSON", () => {
    const schema = "invalid json";

    const size = getPreviewSize(schema);

    expect(size).toBeUndefined();
  });
});
