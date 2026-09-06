import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  createDesignSpecDoc,
  deleteDesignSpecDoc,
  listDesignSpecDocs,
  readDesignSpecDoc,
  saveDesignSpecDoc,
  buildConfigPool,
} from "@/lib/design-specs";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "design-spec-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("设计规范数据层", () => {
  it("新建文档后列表与读取一致", () => {
    const doc = createDesignSpecDoc(tmpDir, "品牌规范");
    expect(doc.title).toBe("品牌规范");
    expect(doc.entries).toEqual([]);

    const list = listDesignSpecDocs(tmpDir);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(doc.id);
    expect(list[0].title).toBe("品牌规范");

    const read = readDesignSpecDoc(tmpDir, doc.id);
    expect(read).not.toBeNull();
    expect(read!.id).toBe(doc.id);
  });

  it("保存文档会更新时间戳并写入 entries", () => {
    const doc = createDesignSpecDoc(tmpDir, "规范");
    const saved = saveDesignSpecDoc(tmpDir, {
      ...doc,
      entries: [
        {
          id: "e1",
          title: "主按钮",
          markdown: "**说明**",
          target: { type: "config", refs: [{ scope: "project", fieldKey: "brandPrimary" }] },
        },
      ],
    });
    expect(saved.updatedAt >= doc.updatedAt).toBe(true);

    const read = readDesignSpecDoc(tmpDir, doc.id)!;
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0].target).toEqual({
      type: "config",
      refs: [{
      scope: "project",
      fieldKey: "brandPrimary",
      }],
    });
  });

  it("保存并重新读取 oneOf 分支父节点的稳定引用", () => {
    const doc = createDesignSpecDoc(tmpDir, "参与人数规范");
    const branchKey = "modules[type=participant]";
    saveDesignSpecDoc(tmpDir, {
      ...doc,
      entries: [{
        id: "participant-entry",
        title: "参与人数模块",
        markdown: "",
        target: {
          type: "config",
          refs: [{ scope: "page", pageId: "page-a", fieldKey: branchKey }],
        },
      }],
    });

    expect(readDesignSpecDoc(tmpDir, doc.id)?.entries[0].target).toEqual({
      type: "config",
      refs: [{ scope: "page", pageId: "page-a", fieldKey: branchKey }],
    });
  });

  it("读取和保存会保留自动管理标记", () => {
    const doc = createDesignSpecDoc(tmpDir, "首页设计规范");
    const saved = saveDesignSpecDoc(tmpDir, {
      ...doc,
      autoManagedPageId: "home",
      entries: [{
        id: "e1",
        title: "头图",
        markdown: "说明",
        target: { type: "config", refs: [{ scope: "page", pageId: "home", fieldKey: "hero" }] },
        autoManagedFieldKey: "hero",
      }],
    });
    const read = readDesignSpecDoc(tmpDir, doc.id)!;

    expect(saved.autoManagedPageId).toBe("home");
    expect(read.autoManagedPageId).toBe("home");
    expect(read.entries[0].autoManagedFieldKey).toBe("hero");
  });

  it("读取旧条目时按消费位置迁移，并为自动页面补齐页面绑定", () => {
    const legacyDoc = {
      id: "ds_legacy",
      title: "旧规范",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      autoManagedPageId: "home",
      entries: [
        {
          id: "field",
          title: "字段规范",
          markdown: "字段说明",
          refs: [{ scope: "page", pageId: "home", fieldKey: "hero" }],
        },
        {
          id: "intro",
          title: "页面前言",
          markdown: "页面说明",
        },
      ],
    };
    const dir = path.join(tmpDir, "design-spec");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec-ds_legacy.json"),
      JSON.stringify(legacyDoc),
      "utf-8",
    );

    const read = readDesignSpecDoc(tmpDir, legacyDoc.id)!;

    expect(read.entries[0].target).toEqual({
      type: "config",
      refs: [{ scope: "page", pageId: "home", fieldKey: "hero" }],
    });
    expect(read.entries[1].target).toEqual({
      type: "page",
      pageIds: ["home"],
    });
  });

  it("删除文档后列表与文件均移除", () => {
    const doc = createDesignSpecDoc(tmpDir, "待删");
    const filePath = path.join(tmpDir, "design-spec", `spec-${doc.id}.json`);
    expect(fs.existsSync(filePath)).toBe(true);

    const ok = deleteDesignSpecDoc(tmpDir, doc.id);
    expect(ok).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(listDesignSpecDocs(tmpDir)).toHaveLength(0);
  });
});

describe("配置项素材池聚合", () => {
  const projectSchema = JSON.stringify({
    properties: {
      brandPrimary: { type: ["string", "null"], format: "color", default: null, title: "品牌主色" },
      overlayOpacity: { type: ["number", "null"], format: "opacity", default: null, title: "遮罩透明度" },
      surfaceColor: { type: ["string", "null"], format: "color-opacity", default: null, title: "表面颜色" },
      headingFont: { type: "string", title: "标题字体" },
      logo: { type: "string", title: "Logo", default: "logo.svg" },
    },
  });

  const pageSchema = JSON.stringify({
    properties: {
      btnRadius: { type: "number", title: "按钮圆角", default: 8 },
      bannerMotion: { type: "string", title: "入场动效", default: "fade-up" },
    },
  });

  it("聚合项目级与页面级配置项", () => {
    const pool = buildConfigPool(projectSchema, [
      { id: "p1", name: "首页", schema: pageSchema },
    ]);
    expect(pool).toHaveLength(7);

    const project = pool.filter((p) => p.scope === "project");
    expect(project).toHaveLength(5);

    const page = pool.filter((p) => p.scope === "page");
    expect(page).toHaveLength(2);
    expect(page[0].pageId).toBe("p1");
    expect(page[0].pageName).toBe("首页");
  });

  it("按显式 format 识别 color / opacity / color-opacity / text / image / number / motion", () => {
    const pool = buildConfigPool(projectSchema, [
      { id: "p1", name: "首页", schema: pageSchema },
    ]);
    const byKey = Object.fromEntries(pool.map((p) => [p.key, p]));
    expect(byKey.brandPrimary.kind).toBe("color");
    expect(byKey.overlayOpacity.kind).toBe("number");
    expect(byKey.overlayOpacity.format).toBe("OPACITY");
    expect(byKey.surfaceColor.kind).toBe("color");
    expect(byKey.surfaceColor.format).toBe("COLOR-OPACITY");
    expect(byKey.headingFont.kind).toBe("text");
    expect(byKey.logo.kind).toBe("image");
    expect(byKey.logo.format).toBe("不限");
    expect(byKey.btnRadius.kind).toBe("number");
    expect(byKey.bannerMotion.kind).toBe("motion");
  });

  it("为平台图床图片附加已登记的原始像素尺寸", () => {
    const pool = buildConfigPool(undefined, [
      {
        id: "p1",
        name: "首页",
        schema: JSON.stringify({
          properties: {
            hero: {
              type: "string",
              format: "image",
              title: "主视觉图片",
              default: "/api/images/img_hero",
            },
          },
        }),
      },
    ], {
      resolveImageSize: (value) => value === "/api/images/img_hero"
        ? { width: 750, height: 148 }
        : null,
    });

    expect(pool[0].size).toEqual({ w: "750", h: "148" });
  });

  it("将图片 ui:options 的格式与尺寸规则带到设计规范摘要", () => {
    const pool = buildConfigPool(undefined, [{
      id: "p1",
      name: "首页",
      schema: JSON.stringify({
        properties: {
          hero: {
            type: "string",
            format: "image",
            title: "主视觉图片",
            "ui:options": {
              accept: "image/png,image/jpeg",
              widthRule: { operator: "=", value: 100 },
              heightRule: { operator: "=", value: 100 },
            },
          },
        },
      }),
    }]);

    expect(pool[0].format).toBe("png/jpg");
    expect(pool[0].size).toEqual({
      w: "100",
      h: "100",
      wOperator: "=",
      hOperator: "=",
      wAny: false,
      hAny: false,
    });
  });

  it("无项目 schema 时只聚合页面级", () => {
    const pool = buildConfigPool(undefined, [
      { id: "p1", name: "首页", schema: pageSchema },
    ]);
    expect(pool.every((p) => p.scope === "page")).toBe(true);
    expect(pool).toHaveLength(2);
  });

  it("空 schema 不产生配置项", () => {
    const pool = buildConfigPool("{}", []);
    expect(pool).toEqual([]);
  });

  it("递归展开对象、数组 oneOf 与 const 字段，并按 pageId 记录项目级影响页面", () => {
    const pool = buildConfigPool(JSON.stringify({
      properties: {
        modules: {
          type: "array",
          items: {
            oneOf: [
              { properties: {
                type: { const: "image", title: "类型" },
                image: { type: "string", format: "image", title: "图片" },
              } },
              { properties: {
                type: { const: "video", title: "类型" },
                video: { type: "object", title: "视频", properties: {
                  url: { type: "string", title: "地址" },
                } },
                caption: { type: "string", title: "说明" },
              } },
            ],
          },
        },
      },
    }), [{
      id: "page-a",
      name: "页面 A",
      schema: JSON.stringify({
        properties: {
          modules: {
            type: "array",
            title: "内容模块",
            items: {
              oneOf: [{
                title: "参与人数模块",
                properties: {
                  type: { const: "participant", title: "类型" },
                  count: { type: "number", title: "参与人数" },
                },
              }],
            },
          },
        },
      }),
    }, { id: "page-b", name: "页面 B", schema: "{}" }]);

    expect(pool.map((item) => item.key)).toEqual(expect.arrayContaining([
      "modules",
      "modules[type=image]",
      "modules[type=image].type",
      "modules[type=image].image",
      "modules[type=participant]",
      "modules[type=video].type",
      "modules[type=video].video",
      "modules[type=video].video.url",
    ]));
    const image = pool.find((item) => item.key === "modules[type=image].image");
    expect(image?.breadcrumbs).toEqual(["modules", "image", "图片"]);
    expect(image?.pageIds).toEqual(["page-a", "page-b"]);
    const participant = pool.find(
      (item) => item.id === "page:page-a:modules[type=participant]",
    );
    expect(participant).toMatchObject({
      scope: "page",
      pageId: "page-a",
      pageName: "页面 A",
      key: "modules[type=participant]",
      title: "参与人数模块",
      breadcrumbs: ["内容模块", "参与人数模块"],
      kind: "text",
      isBranch: true,
    });
    expect(pool.find((item) => item.key === "modules[type=image].type")?.isConst).toBe(true);
    expect(pool.find((item) => item.key === "modules[type=video].caption")?.kind).toBe("text");
  });

  it("malformed schema is tolerated", () => {
    expect(buildConfigPool("not-json", [{ id: "p", name: "页面", schema: "not-json" }])).toEqual([]);
  });

  it("支持根级 oneOf 分支并保持同名字段路径隔离", () => {
    const pool = buildConfigPool(undefined, [{
      id: "p",
      name: "页面",
      schema: JSON.stringify({
        oneOf: [
          { title: "图片模块", properties: { type: { const: "image" }, value: { type: "string", title: "值" } } },
          { title: "视频模块", properties: { type: { const: "video" }, value: { type: "string", title: "值" } } },
        ],
      }),
    }]);

    expect(pool.map((item) => item.key)).toEqual(expect.arrayContaining([
      "[type=image].value",
      "[type=video].value",
    ]));
    expect(pool.find((item) => item.key === "[type=image].value")?.breadcrumbs).toEqual([
      "图片模块",
      "值",
    ]);
    expect(pool.find((item) => item.key === "[type=image]")).toMatchObject({
      title: "图片模块",
      isBranch: true,
      kind: "text",
    });
  });
});
