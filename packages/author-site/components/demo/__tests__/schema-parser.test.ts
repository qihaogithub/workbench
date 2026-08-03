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

  it("schema 声明的 $demo.maxItems 优先于代码探测的 typeLimits", () => {
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
                title: "视频模块",
                $demo: { maxItems: 1 },
                properties: { type: { const: "video" } },
                required: ["type"],
              },
            ],
          },
        },
      },
    });

    // 代码探测出 video 限制为 5，schema 声明为 1，应以 schema 为准
    const groups = parseSchemaToFields(schema, { video: 5 });
    const oneOf = groups[0].fields[0].oneOf!;
    expect(oneOf.variants[0].maxItems).toBe(1);
  });

  it("schema 未声明 $demo.maxItems 时，代码探测的 typeLimits 正常兜底", () => {
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
                title: "视频模块",
                properties: { type: { const: "video" } },
                required: ["type"],
              },
              {
                title: "图片模块",
                properties: { type: { const: "image" } },
                required: ["type"],
              },
            ],
          },
        },
      },
    });

    // 仅 video 被代码探测出限制，image 未探测到
    const groups = parseSchemaToFields(schema, { video: 1 });
    const oneOf = groups[0].fields[0].oneOf!;
  expect(oneOf.variants[0].maxItems).toBe(1);
  expect(oneOf.variants[1].maxItems).toBeUndefined();
  });

  it("应展开嵌套的 type:object 分组容器为 flat 格式", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        "基础信息": {
          type: "object",
          title: "基础信息",
          properties: {
            username: { type: "string", title: "用户名", default: "张三" },
            age: { type: "number", title: "年龄", default: 28 },
          },
          required: ["username"],
        },
        "设置": {
          type: "object",
          title: "设置",
          properties: {
            enableNotify: { type: "boolean", title: "启用通知", default: true },
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);

    // 应有 2 个 group（对应原来的 2 个分组）
    expect(groups).toHaveLength(2);

    // 第一组的字段应来自"基础信息"
    const group1 = groups.find((g) => g.title === "基础信息");
    expect(group1).toBeDefined();
    expect(group1!.fields).toHaveLength(2);
    const usernameField = group1!.fields.find((f) => f.key === "username");
    expect(usernameField).toBeDefined();
    expect(usernameField!.type).toBe("string");
    expect(usernameField!.required).toBe(true);
    const ageField = group1!.fields.find((f) => f.key === "age");
    expect(ageField).toBeDefined();
    expect(ageField!.type).toBe("number");

    // 第二组的字段应来自"设置"
    const group2 = groups.find((g) => g.title === "设置");
    expect(group2).toBeDefined();
    expect(group2!.fields).toHaveLength(1);
    expect(group2!.fields[0].key).toBe("enableNotify");
    expect(group2!.fields[0].type).toBe("boolean");
  });

  it("visibleWhen 直接写在 prop 上时应能被识别（兼容 SKILL.md 格式）", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        mode: { type: "string", title: "模式" },
        textContent: {
          type: "string",
          title: "文本内容",
          visibleWhen: { field: "mode", equals: "text" },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const allFields = groups.flatMap((g) => g.fields);
    const textField = allFields.find((f) => f.key === "textContent");
    expect(textField).toBeDefined();
    expect(textField!.visibleWhen).toEqual({ field: "mode", equals: "text" });
  });

  it("应同时支持 ui:options.visibleWhen 和 prop.visibleWhen", () => {
    // ui:options.visibleWhen 优先
    const schema = JSON.stringify({
      type: "object",
      properties: {
        field1: {
          type: "string",
          title: "Field 1",
          "ui:options": { visibleWhen: { field: "a", equals: "x" } },
        },
        field2: {
          type: "string",
          title: "Field 2",
          visibleWhen: { field: "b", equals: "y" },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const f1 = groups[0].fields.find((f) => f.key === "field1");
    const f2 = groups[0].fields.find((f) => f.key === "field2");
    expect(f1!.visibleWhen).toEqual({ field: "a", equals: "x" });
    expect(f2!.visibleWhen).toEqual({ field: "b", equals: "y" });
  });

  it("空的分组容器应被忽略，不影响其他字段", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", title: "标题", default: "Hello" },
        emptyGroup: {
          type: "object",
          title: "空分组",
          properties: {},
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    // 应只有 title 字段，emptyGroup 因为 properties 为空不会被展平也不会作为字段出现
    const allFields = groups.flatMap((g) => g.fields);
    expect(allFields).toHaveLength(1);
    expect(allFields[0].key).toBe("title");
  });

  it("混合 flat 字段和嵌套分组容器应正确展平", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", title: "标题", default: "Hello" },
        "样式配置": {
          type: "object",
          title: "样式配置",
          properties: {
            bgColor: { type: "string", format: "color", title: "背景色", default: "#fff" },
            fontSize: { type: "number", title: "字体大小", default: 16 },
          },
        },
        showFooter: { type: "boolean", title: "显示页脚", default: false },
      },
    });

    const groups = parseSchemaToFields(schema);

    const allFields = groups.flatMap((g) => g.fields);
    expect(allFields).toHaveLength(4); // title + bgColor + fontSize + showFooter

    const titleField = allFields.find((f) => f.key === "title");
    expect(titleField).toBeDefined();

    const bgColorField = allFields.find((f) => f.key === "bgColor");
    expect(bgColorField).toBeDefined();
    expect(bgColorField!.type).toBe("string");
    expect(bgColorField!.format).toBe("color");

    const showFooterField = allFields.find((f) => f.key === "showFooter");
    expect(showFooterField).toBeDefined();
    expect(showFooterField!.type).toBe("boolean");
  });

  it("不应展平带有 $demo.positionable 的对象（位置字段）", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        label: { type: "string", title: "标签", default: "A" },
        position: {
          type: "object",
          title: "位置",
          properties: {
            x: { type: "number", default: 10 },
            y: { type: "number", default: 20 },
          },
          $demo: {
            positionable: { key: "badge", size: { width: 320, height: 240 } },
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);

    // position 字段应保持为单个 field，不被展平
    const allFields = groups.flatMap((g) => g.fields);
    const positionField = allFields.find((f) => f.key === "position");
    expect(positionField).toBeDefined();
    expect(positionField!.type).toBe("object");
    expect(positionField!.positionable).toBeDefined();
    expect(positionField!.positionable!.key).toBe("badge");

    // label 字段应正常存在
    const labelField = allFields.find((f) => f.key === "label");
    expect(labelField).toBeDefined();
    expect(labelField!.type).toBe("string");

    // x 和 y 不应出现在顶层
    expect(allFields.find((f) => f.key === "x")).toBeUndefined();
    expect(allFields.find((f) => f.key === "y")).toBeUndefined();
  });

  it("应识别 type:enum 加 multiple:true 为多选字段", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        interests: {
          type: "enum",
          title: "兴趣爱好",
          enum: ["阅读", "音乐", "运动"],
          multiple: true,
          default: ["阅读", "音乐"],
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.key).toBe("interests");
    expect(field.multiple).toBe(true);
    expect(field.uiWidget).toBe("multiselect");
    expect(field.enum).toEqual(["阅读", "音乐", "运动"]);
  });

  it("应识别 type:cascade 加 options 直接写在 prop 上为级联字段", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        region: {
          type: "cascade",
          title: "所在地区",
          options: [
            { value: "zhejiang", label: "浙江", children: [{ value: "hangzhou", label: "杭州" }] },
          ],
          default: ["zhejiang", "hangzhou"],
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.key).toBe("region");
    expect(field.uiWidget).toBe("cascade");
    expect(field.options).toBeDefined();
    expect(field.options).toHaveLength(1);
    expect(field.options![0].value).toBe("zhejiang");
  });

  it("应识别 type:position 为定位字段", () => {
    const schema = JSON.stringify({
      type: "object",
      properties: {
        position: {
          type: "position",
          key: "floatingLabel",
          title: "位置",
          size: { width: 375, height: 200 },
          default: { x: 20, y: 20 },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.key).toBe("position");
    expect(field.positionable).toBeDefined();
    expect(field.positionable!.key).toBe("floatingLabel");
    expect(field.positionable!.size).toEqual({ width: 375, height: 200 });
  });

  it("type:position 在 oneOf 变体内部也应被识别", () => {
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
                title: "定位元素",
                properties: {
                  type: { const: "positioned" },
                  label: { type: "string", title: "标签" },
                  position: {
                    type: "position",
                    key: "floatingLabel",
                    title: "位置",
                    size: { width: 375, height: 200 },
                    default: { x: 20, y: 20 },
                  },
                },
                required: ["type"],
              },
            ],
          },
        },
      },
    });

    const groups = parseSchemaToFields(schema);
    const field = groups[0].fields[0];

    expect(field.oneOf).toBeDefined();
    const posVariant = field.oneOf!.variants.find((v) => v.value === "positioned");
    expect(posVariant).toBeDefined();
    const posField = posVariant!.fields.find((f) => f.key === "position");
    expect(posField).toBeDefined();
    expect(posField!.positionable).toBeDefined();
    expect(posField!.positionable!.key).toBe("floatingLabel");
  });
});
