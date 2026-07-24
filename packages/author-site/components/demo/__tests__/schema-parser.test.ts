import { parseSchemaToFields } from "@workbench/demo-ui";

describe("parseSchemaToFields", () => {
  it("应正确解析 oneOf 判别联合数组", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          title: "模块列表",
          items: {
            type: "object",
            oneOf: [
              {
                title: "图片模块",
                properties: {
                  type: { const: "image" },
                  imageUrl: { type: "string", format: "image", title: "图片" },
                },
                required: ["type"],
              },
              {
                title: "视频模块",
                properties: {
                  type: { const: "video" },
                  videoBg: { type: "string", title: "视频背景" },
                  videoCover: { type: "string", title: "视频封面" },
                },
                required: ["type"],
              },
            ],
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    expect(groups).toHaveLength(1);

    const modulesField = groups[0].fields[0];
    expect(modulesField.key).toBe("modules");
    expect(modulesField.type).toBe("array");
    expect(modulesField.oneOf).toBeDefined();
    expect(modulesField.children).toBeUndefined();

    const oneOf = modulesField.oneOf!;
    expect(oneOf.discriminator).toBe("type");
    expect(oneOf.variants).toHaveLength(2);

    expect(oneOf.variants[0].title).toBe("图片模块");
    expect(oneOf.variants[0].value).toBe("image");
    expect(oneOf.variants[0].fields).toHaveLength(1);
    expect(oneOf.variants[0].fields[0].key).toBe("imageUrl");
    expect(oneOf.variants[0].fields[0].format).toBe("image");

    expect(oneOf.variants[1].title).toBe("视频模块");
    expect(oneOf.variants[1].value).toBe("video");
    expect(oneOf.variants[1].fields).toHaveLength(2);
  });

  it("应正确解析无 oneOf 的对象数组子字段", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        links: {
          type: "array",
          title: "友情链接",
          items: {
            type: "object",
            properties: {
              label: { type: "string", title: "名称" },
              url: { type: "string", title: "链接" },
            },
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const linksField = groups[0].fields[0];

    expect(linksField.key).toBe("links");
    expect(linksField.type).toBe("array");
    expect(linksField.children).toBeDefined();
    expect(linksField.children).toHaveLength(2);
    expect(linksField.oneOf).toBeUndefined();

    expect(linksField.children![0].key).toBe("label");
    expect(linksField.children![0].title).toBe("名称");
    expect(linksField.children![1].key).toBe("url");
    expect(linksField.children![1].title).toBe("链接");
  });

  it("数组中 items.type 不是 object 时不应有 children 或 oneOf", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        tags: {
          type: "array",
          items: { type: "string" },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const tagsField = groups[0].fields[0];

    expect(tagsField.type).toBe("array");
    expect(tagsField.children).toBeUndefined();
    expect(tagsField.oneOf).toBeUndefined();
  });

  it("items.type === object 但没有 properties 时不应有 children 或 oneOf", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        rawObjects: {
          type: "array",
          items: { type: "object" },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.type).toBe("array");
    expect(field.itemsType).toBe("object");
    expect(field.children).toBeUndefined();
    expect(field.oneOf).toBeUndefined();
  });

  it("oneOf 中缺少 const 判别属性时应安全降级", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            type: "object",
            oneOf: [
              {
                title: "图片模块",
                properties: {
                  imageUrl: { type: "string", title: "图片" },
                },
              },
            ],
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.type).toBe("array");
    expect(field.oneOf).toBeUndefined();
  });

  it("oneOf 的 variant 中 discriminator 字段不应出现在 fields 中", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          items: {
            type: "object",
            oneOf: [
              {
                title: "图片",
                properties: {
                  type: { const: "image" },
                  url: { type: "string", title: "URL" },
                  alt: { type: "string", title: "Alt" },
                },
              },
            ],
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.oneOf).toBeDefined();
    const variant = field.oneOf!.variants[0];
    const keys = variant.fields.map((f) => f.key);
    expect(keys).not.toContain("type");
    expect(keys).toEqual(["url", "alt"]);
  });

  it("解析非法 JSON 时应返回空数组", () => {
    const groups = parseSchemaToFields("not valid json");
    expect(groups).toEqual([]);
  });

  it("空 schema 应返回空数组", () => {
    const groups = parseSchemaToFields("{}");
    expect(groups).toEqual([]);
  });

  it("应正确处理带 default 的 oneOf 数组", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          title: "模块列表",
          default: [
            { type: "image", imageUrl: "a.png" },
            { type: "progress", progressText: "50%" },
          ],
          items: {
            type: "object",
            oneOf: [
              {
                title: "图片",
                properties: {
                  type: { const: "image" },
                  imageUrl: { type: "string", title: "图片", default: "" },
                },
              },
              {
                title: "进度",
                properties: {
                  type: { const: "progress" },
                  progressText: { type: "string", title: "进度文字", default: "0%" },
                },
              },
            ],
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.oneOf).toBeDefined();
    expect(field.default).toBeDefined();

    const imageVariant = field.oneOf!.variants[0];
    expect(imageVariant.fields[0].default).toBe("");

    const progressVariant = field.oneOf!.variants[1];
    expect(progressVariant.fields[0].default).toBe("0%");
  });

  it("oneOf 中有多个 variant 时的歧义判别符选择应使用第一个 const", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            oneOf: [
              {
                title: "A",
                properties: {
                  kind: { const: "a" },
                  type: { const: "thing" },
                  name: { type: "string", title: "Name" },
                },
              },
            ],
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.oneOf).toBeDefined();
    expect(field.oneOf!.discriminator).toBe("kind");
  });

  it("oneOf 数组为 object 但无 properties 时，已有 items.properties 不应被覆盖", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        links: {
          type: "array",
          items: {
            type: "object",
            oneOf: [],
            properties: {
              label: { type: "string", title: "名称" },
            },
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.oneOf).toBeUndefined();
    expect(field.children).toBeDefined();
    expect(field.children).toHaveLength(1);
    expect(field.children![0].key).toBe("label");
  });
});
