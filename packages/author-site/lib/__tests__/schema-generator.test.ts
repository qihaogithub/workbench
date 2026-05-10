/**
 * Schema 生成器单元测试
 */

import {
  generateSchemaFromCode,
  mergeWithExistingSchema,
} from "../../src/lib/schema-generator";

describe("generateSchemaFromCode", () => {
  it("应从 interface DemoProps 生成 Schema", () => {
    const code = `
interface DemoProps {
  title: string;
  count: number;
  enabled: boolean;
}

export default function Demo({ title, count, enabled }: DemoProps) {
  return <div>{title}</div>;
}`;

    const schema = generateSchemaFromCode(code);

    expect(schema).not.toBeNull();
    expect(schema?.properties.title).toEqual({
      type: "string",
      title: "title",
      default: "",
    });
    expect(schema?.properties.count).toEqual({
      type: "number",
      title: "count",
      default: 0,
    });
    expect(schema?.properties.enabled).toEqual({
      type: "boolean",
      title: "enabled",
      default: false,
    });
    expect(schema?.required).toContain("title");
    expect(schema?.required).toContain("count");
    expect(schema?.required).toContain("enabled");
  });

  it("应支持可选属性", () => {
    const code = `
interface DemoProps {
  title: string;
  subtitle?: string;
}`;

    const schema = generateSchemaFromCode(code);

    expect(schema?.required).toContain("title");
    expect(schema?.required).not.toContain("subtitle");
  });

  it("应从函数参数解构中提取 props", () => {
    const code = `
export default function Demo({ title, description }) {
  return <div>{title}</div>;
}`;

    const schema = generateSchemaFromCode(code);

    expect(schema).not.toBeNull();
    expect(schema?.properties.title).toBeDefined();
    expect(schema?.properties.description).toBeDefined();
  });

  it("应支持联合类型（enum）", () => {
    const code = `
interface DemoProps {
  size: 'small' | 'medium' | 'large';
}`;

    const schema = generateSchemaFromCode(code);

    expect(schema?.properties.size.type).toBe("string");
    expect(schema?.properties.size.enum).toEqual([
      "small",
      "medium",
      "large",
    ]);
  });

  it("应返回 null 当找不到 Props 定义", () => {
    const code = `
export default function Demo() {
  return <div>Hello</div>;
}`;

    const schema = generateSchemaFromCode(code);

    expect(schema).toBeNull();
  });
});

describe("mergeWithExistingSchema", () => {
  it("应保留现有 Schema 的 default 值", () => {
    const generated = generateSchemaFromCode(`
interface DemoProps {
  title: string;
}`) as NonNullable<ReturnType<typeof generateSchemaFromCode>>;

    const existing = {
      properties: {
        title: {
          type: "string",
          default: "自定义标题",
          description: "标题描述",
        },
      },
    };

    const merged = mergeWithExistingSchema(generated, existing);

    expect(merged.properties.title.default).toBe("自定义标题");
    expect(merged.properties.title.description).toBe("标题描述");
  });

  it("应保留 $demo 配置", () => {
    const generated = generateSchemaFromCode(`
interface DemoProps {
  title: string;
}`) as NonNullable<ReturnType<typeof generateSchemaFromCode>>;

    const existing = {
      $demo: {
        previewSize: { width: 375, height: 812 },
      },
    };

    const merged = mergeWithExistingSchema(generated, existing);

    expect((merged as unknown as Record<string, unknown>).$demo).toEqual({
      previewSize: { width: 375, height: 812 },
    });
  });
});
