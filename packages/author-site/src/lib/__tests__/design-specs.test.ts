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
          refs: [{ scope: "project", fieldKey: "brandPrimary" }],
        },
      ],
    });
    expect(saved.updatedAt >= doc.updatedAt).toBe(true);

    const read = readDesignSpecDoc(tmpDir, doc.id)!;
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0].refs[0]).toEqual({
      scope: "project",
      fieldKey: "brandPrimary",
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
        refs: [{ scope: "page", pageId: "home", fieldKey: "hero" }],
        autoManagedFieldKey: "hero",
      }],
    });
    const read = readDesignSpecDoc(tmpDir, doc.id)!;

    expect(saved.autoManagedPageId).toBe("home");
    expect(read.autoManagedPageId).toBe("home");
    expect(read.entries[0].autoManagedFieldKey).toBe("hero");
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
      brandPrimary: { type: "string", format: "color", default: "#4F46E5", title: "品牌主色" },
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
    expect(pool).toHaveLength(5);

    const project = pool.filter((p) => p.scope === "project");
    expect(project).toHaveLength(3);

    const page = pool.filter((p) => p.scope === "page");
    expect(page).toHaveLength(2);
    expect(page[0].pageId).toBe("p1");
    expect(page[0].pageName).toBe("首页");
  });

  it("推断 kind：color / text / image / number / motion", () => {
    const pool = buildConfigPool(projectSchema, [
      { id: "p1", name: "首页", schema: pageSchema },
    ]);
    const byKey = Object.fromEntries(pool.map((p) => [p.key, p]));
    expect(byKey.brandPrimary.kind).toBe("color");
    expect(byKey.headingFont.kind).toBe("text");
    expect(byKey.logo.kind).toBe("image");
    expect(byKey.logo.format).toBe("SVG");
    expect(byKey.btnRadius.kind).toBe("number");
    expect(byKey.bannerMotion.kind).toBe("motion");
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
});
