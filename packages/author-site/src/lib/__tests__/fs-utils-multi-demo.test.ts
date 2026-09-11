import path from "path";
import fs from "fs";
import os from "os";
import {
  generateDemoPageId,
  generatePageSlug,
  getDemoDirPath,
  readDemoPageMeta,
  resolvePageRuntimeType,
  writeDemoPageMeta,
  listDemoPages,
  ensureWorkspaceFiles,
  ensureAppGraph,
  validateAppGraph,
  readAppGraph,
  createDeletedWorkspaceDemoPageSnapshot,
  deleteWorkspaceDemoPage,
  getWorkspacesDir,
  restoreDeletedWorkspaceDemoPageSnapshot,
} from "../fs-utils";

function makeTempWorkspace(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

function cleanup(p: string): void {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

describe("多 Demo 页面 — fs-utils", () => {
  describe("generatePageSlug", () => {
    it("英文名称应转为小写连字符", () => {
      expect(generatePageSlug("Landing Page")).toBe("landing-page");
      expect(generatePageSlug("Product Detail")).toBe("product-detail");
    });

    it("应丢弃非 ASCII 字符", () => {
      expect(generatePageSlug("首页 Home")).toBe("home");
    });

    it("纯中文应回退为 page", () => {
      expect(generatePageSlug("首页")).toBe("page");
      expect(generatePageSlug("商品详情")).toBe("page");
    });

    it("空字符串应回退为 page", () => {
      expect(generatePageSlug("")).toBe("page");
    });

    it("应截断到 20 字符", () => {
      expect(
        generatePageSlug("a-very-long-page-name-that-exceeds").length,
      ).toBeLessThanOrEqual(20);
    });

    it("应合并连续连字符并去除首尾", () => {
      expect(generatePageSlug("  hello   world  ")).toBe("hello-world");
    });
  });

  describe("generateDemoPageId", () => {
    it("有名称时应生成 slug_rand 形态", () => {
      const id = generateDemoPageId("Homepage");
      expect(id).toMatch(/^homepage_[0-9a-z]{4}$/);
    });

    it("英文名称应保持小写", () => {
      const id = generateDemoPageId("Landing Page");
      expect(id).toMatch(/^landing-page_[0-9a-z]{4}$/);
    });

    it("无名称时应使用 default-page", () => {
      const id = generateDemoPageId();
      expect(id).toMatch(/^default-page_[0-9a-z]{4}$/);
    });

    it("同一名称批量生成不应碰撞（蒙特卡洛 1000 次）", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        ids.add(generateDemoPageId("test"));
      }
      // 1000 次随机 4 位 base36（约 170 万空间），允许极低概率碰撞
      expect(ids.size).toBeGreaterThanOrEqual(995);
    });
  });

  describe("getDemoDirPath", () => {
    it("应返回 workspacePath/demos/{demoId}", () => {
      expect(getDemoDirPath("/tmp/ws", "demo_1")).toBe(
        path.join("/tmp/ws", "demos", "demo_1"),
      );
    });
  });

  describe("页面运行时文件判型", () => {
    let ws: string;

    beforeEach(() => {
      ws = makeTempWorkspace("ws-runtime-files");
    });
    afterEach(() => cleanup(ws));

    it("应忽略原型页旁的空 index.tsx 占位文件", () => {
      const demoId = "prototype_page";
      const demoDir = getDemoDirPath(ws, demoId);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      fs.writeFileSync(path.join(demoDir, "prototype.html"), "<main>原型页</main>", "utf-8");
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "", "utf-8");
      writeDemoPageMeta(ws, demoId, {
        name: "原型页",
        routeKey: "prototype-page",
        runtimeType: "prototype-html-css",
      });

      expect(resolvePageRuntimeType(demoDir)).toBe("prototype-html-css");
      expect(listDemoPages(ws)).toEqual([
        expect.objectContaining({
          id: demoId,
          runtimeType: "prototype-html-css",
        }),
      ]);
    });

    it("应继续拒绝同时存在两个非空运行时入口的页面", () => {
      const demoDir = getDemoDirPath(ws, "invalid_page");
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "prototype.html"), "<main>原型页</main>", "utf-8");
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return null; }", "utf-8");

      expect(() => resolvePageRuntimeType(demoDir)).toThrow("PAGE_RUNTIME_FILES_INVALID");
    });
  });

  describe("ensureWorkspaceFiles", () => {
    let ws: string;
    beforeEach(() => {
      ws = makeTempWorkspace("ws-ensure");
    });
    afterEach(() => cleanup(ws));

    it("空目录时只初始化 workspace 清单，不创建默认页面", () => {
      const result = ensureWorkspaceFiles(ws);
      expect(result.demoIds).toEqual([]);
      expect(result.defaultDemoMeta).toBeUndefined();

      expect(fs.readdirSync(path.join(ws, "demos"))).toEqual([]);
      expect(fs.existsSync(path.join(ws, "workspace-tree.json"))).toBe(true);
      const memoryPath = path.join(ws, "memory.md");
      expect(fs.existsSync(memoryPath)).toBe(true);
      expect(fs.readFileSync(memoryPath, "utf-8")).toContain("# 项目记忆");
      expect(fs.existsSync(path.join(ws, "convention.md"))).toBe(false);
    });

    it("已存在 demo 时不重复创建默认页面", () => {
      const demoId = "existing_page";
      const demoDir = path.join(ws, "demos", demoId);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(
        path.join(demoDir, "index.tsx"),
        "export default function Page() { return null; }",
        "utf-8",
      );
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      writeDemoPageMeta(ws, demoId, { name: "已有页面", order: 0 });

      const result = ensureWorkspaceFiles(ws);
      expect(result.demoIds).toEqual([demoId]);
      expect(result.defaultDemoMeta).toBeUndefined();
      expect(fs.existsSync(path.join(ws, "memory.md"))).toBe(true);
      expect(fs.existsSync(path.join(ws, "convention.md"))).toBe(false);
    });

    it("已存在 AI 记忆文件时不应覆盖用户内容", () => {
      const memoryPath = path.join(ws, "memory.md");
      const content = "# 项目记忆\n\n- 用户已有内容\n";
      fs.writeFileSync(memoryPath, content, "utf-8");

      ensureWorkspaceFiles(ws);

      expect(fs.readFileSync(memoryPath, "utf-8")).toBe(content);
    });

    it("已存在 knowledge 目录时应保留用户文档并清理历史系统文档", () => {
      const knowledgeDir = path.join(ws, "knowledge");
      fs.mkdirSync(knowledgeDir, { recursive: true });
      fs.writeFileSync(path.join(knowledgeDir, "用户规范.md"), "# 用户规范", "utf-8");
      fs.writeFileSync(path.join(knowledgeDir, "旧系统文档.md"), "# 旧系统文档", "utf-8");
      fs.writeFileSync(
        path.join(knowledgeDir, "manifest.json"),
        JSON.stringify({
          version: 1,
          items: [
            {
              id: "kb_user_001",
              title: "用户规范",
              source: "user",
              description: "用户添加的规范",
              fileName: "用户规范.md",
              addedAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: "kb_sys_001",
              title: "旧系统文档",
              source: "system",
              description: "历史系统文档",
              fileName: "旧系统文档.md",
              addedAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        }),
        "utf-8",
      );

      ensureWorkspaceFiles(ws);

      const manifest = JSON.parse(
        fs.readFileSync(path.join(knowledgeDir, "manifest.json"), "utf-8"),
      ) as { items: Array<{ id: string; source: string; category?: string; tags?: string[] }> };
      expect(manifest.items.some((item) => item.id === "kb_user_001")).toBe(true);
      expect(manifest.items.some((item) => item.source === "system")).toBe(false);
      expect(fs.existsSync(path.join(knowledgeDir, "旧系统文档.md"))).toBe(false);
    });

    it("不完整的 demo 子目录（缺少 index.tsx）应被忽略", () => {
      const demosDir = path.join(ws, "demos");
      fs.mkdirSync(demosDir, { recursive: true });
      const brokenId = "demo_broken";
      fs.mkdirSync(path.join(demosDir, brokenId), { recursive: true });
      // 只写 schema，不写 index.tsx
      fs.writeFileSync(
        path.join(demosDir, brokenId, "config.schema.json"),
        "{}",
        "utf-8",
      );

      const result = ensureWorkspaceFiles(ws);
      expect(result.demoIds).toEqual([]);
      expect(result.demoIds).not.toContain(brokenId);
      expect(result.defaultDemoMeta).toBeUndefined();
    });
  });

  describe("readDemoPageMeta / writeDemoPageMeta", () => {
    let ws: string;
    beforeEach(() => {
      ws = makeTempWorkspace("ws-meta");
    });
    afterEach(() => cleanup(ws));

    it("写入后能读出完整 meta", async () => {
      const demoId = "demo_test";
      const written = writeDemoPageMeta(ws, demoId, {
        name: "页面 A",
        order: 2,
      });

      expect(written.id).toBe(demoId);
      expect(written.name).toBe("页面 A");
      expect(written.routeKey).toBe("a");
      expect(written.order).toBe(2);
      expect(written.parentId).toBeNull();

      const read = readDemoPageMeta(ws, demoId);
      expect(read).toEqual(written);

      // patch order：未传 name 保留旧值
      const patched = writeDemoPageMeta(ws, demoId, { order: 5 });
      expect(patched.name).toBe("页面 A");
      expect(patched.routeKey).toBe("a");
      expect(patched.order).toBe(5);

      // runtimeType 已改为文件系统推断，不再存储在 DemoPageMeta 中
      const renamed = writeDemoPageMeta(ws, demoId, { name: "页面 B" });
      expect(renamed.name).toBe("页面 B");
      expect(renamed.order).toBe(5);
    });

    it("更新其他页面元数据时保留模板页标记", () => {
      const demoId = "template_page";
      writeDemoPageMeta(ws, demoId, {
        name: "模板页",
        isTemplatePage: true,
      });

      const renamed = writeDemoPageMeta(ws, demoId, { name: "重命名后的模板页" });
      expect(renamed.isTemplatePage).toBe(true);
      expect(readDemoPageMeta(ws, demoId)?.isTemplatePage).toBe(true);
    });

    it("重复 routeKey 写入时应自动生成唯一值", () => {
      const first = writeDemoPageMeta(ws, "demo_a", {
        name: "Home",
        routeKey: "home",
      });
      const second = writeDemoPageMeta(ws, "demo_b", {
        name: "Home",
        routeKey: "home",
      });

      expect(first.routeKey).toBe("home");
      expect(second.routeKey).toBe("home-2");
    });

    it("读取不存在的 meta 返回 null", () => {
      expect(readDemoPageMeta(ws, "non_existent")).toBeNull();
    });

    it("损坏的 workspace-tree.json 时自动从旧格式迁移", () => {
      // 写入损坏的 workspace-tree.json
      fs.writeFileSync(
        path.join(ws, "workspace-tree.json"),
        "{corrupt-json",
        "utf-8",
      );

      // readDemoPageMeta 应不抛错，尝试迁移后返回 null（因为旧格式也不存在）
      expect(readDemoPageMeta(ws, "demo_nonexist")).toBeNull();
    });

    it("旧 workspace-tree 读取时应补齐 routeKey", () => {
      const demoDir = path.join(ws, "demos", "landing_1234");
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      fs.writeFileSync(
        path.join(ws, "workspace-tree.json"),
        JSON.stringify({
          folders: [],
          pages: [{ id: "landing_1234", name: "Landing Page", order: 0, parentId: null }],
        }),
        "utf-8",
      );

      const page = readDemoPageMeta(ws, "landing_1234");

      expect(page?.routeKey).toBe("landing-page");
      expect(fs.readFileSync(path.join(ws, "workspace-tree.json"), "utf-8")).toContain("routeKey");
    });

    it("读取 live workspace-tree 时只在内存补齐 routeKey，不绕过 Authority 写盘", () => {
      const demoDir = path.join(ws, "demos", "landing_1234");
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      fs.writeFileSync(
        path.join(ws, ".workspace.json"),
        JSON.stringify({ scope: "live", status: "active" }),
        "utf-8",
      );
      const original = JSON.stringify({
        folders: [],
        pages: [{
          id: "landing_1234",
          name: "Landing Page",
          routeKey: "landing-page-中文后缀",
          order: 0,
          parentId: null,
        }],
      });
      fs.writeFileSync(path.join(ws, "workspace-tree.json"), original, "utf-8");

      const page = readDemoPageMeta(ws, "landing_1234");

      expect(page?.routeKey).toBe("landing-page");
      expect(fs.readFileSync(path.join(ws, "workspace-tree.json"), "utf-8")).toBe(original);
    });
  });

  describe("app graph", () => {
    let ws: string;
    beforeEach(() => {
      ws = makeTempWorkspace("ws-graph");
    });
    afterEach(() => cleanup(ws));

    it("应根据页面清单生成最小应用图并通过校验", () => {
      const page = writeDemoPageMeta(ws, "home_1234", {
        name: "Home",
        routeKey: "home",
      });
      const demoDir = path.join(ws, "demos", page.id);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");

      const graph = ensureAppGraph(ws);
      const validation = validateAppGraph(graph);

      expect(graph.entry).toBe("home");
      expect(graph.pages.home).toEqual({ pageId: "home_1234", title: "Home" });
      expect(validation.valid).toBe(true);
    });

    it("删除页面时应清理相关动作", () => {
      const workspaceId = `ws-graph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ws = path.join(getWorkspacesDir(), workspaceId);
      fs.mkdirSync(ws, { recursive: true });
      for (const pageId of ["home_1234", "detail_1234"]) {
        const demoDir = path.join(ws, "demos", pageId);
        fs.mkdirSync(demoDir, { recursive: true });
        fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
        fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      }
      writeDemoPageMeta(ws, "home_1234", { name: "Home", routeKey: "home", order: 0 });
      writeDemoPageMeta(ws, "detail_1234", { name: "Detail", routeKey: "detail", order: 1 });
      fs.writeFileSync(
        path.join(ws, "app.graph.json"),
        JSON.stringify({
          version: 1,
          entry: "home",
          pages: {},
          actions: [{ from: "home", event: "viewDetail", to: "detail" }],
          state: {},
        }),
        "utf-8",
      );

      const deleted = deleteWorkspaceDemoPage(workspaceId, "detail_1234");
      const graph = readAppGraph(ws);

      expect(deleted).toBe(true);
      expect(graph.pages.detail).toBeUndefined();
      expect(graph.actions).toEqual([]);
    });

    it("删除页面快照可按原 pageId 恢复页面目录和 workspace-tree", () => {
      const workspaceId = `ws-restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ws = path.join(getWorkspacesDir(), workspaceId);
      const pageId = "detail_1234";
      const demoDir = path.join(ws, "demos", pageId);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      const page = writeDemoPageMeta(ws, pageId, {
        name: "Detail",
        routeKey: "detail",
        order: 2,
        parentId: null,
      });

      const snapshot = createDeletedWorkspaceDemoPageSnapshot(workspaceId, pageId);
      expect(snapshot?.page).toEqual(page);
      expect(deleteWorkspaceDemoPage(workspaceId, pageId)).toBe(true);
      expect(readDemoPageMeta(ws, pageId)).toBeNull();

      const restored = restoreDeletedWorkspaceDemoPageSnapshot(
        workspaceId,
        pageId,
        snapshot!.snapshotId,
      );

      expect(restored.success).toBe(true);
      if (restored.success) {
        expect(restored.page).toMatchObject({
          id: pageId,
          name: "Detail",
          routeKey: "detail",
          order: 2,
        });
      }
      expect(fs.existsSync(path.join(demoDir, "index.tsx"))).toBe(true);
      expect(readDemoPageMeta(ws, pageId)?.id).toBe(pageId);
    });

    it("恢复删除快照时如果原 pageId 已存在则失败", () => {
      const workspaceId = `ws-restore-conflict-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ws = path.join(getWorkspacesDir(), workspaceId);
      const pageId = "detail_1234";
      const demoDir = path.join(ws, "demos", pageId);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      writeDemoPageMeta(ws, pageId, { name: "Detail", routeKey: "detail" });

      const snapshot = createDeletedWorkspaceDemoPageSnapshot(workspaceId, pageId);
      expect(deleteWorkspaceDemoPage(workspaceId, pageId)).toBe(true);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Conflict() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      writeDemoPageMeta(ws, pageId, { name: "Conflict", routeKey: "conflict" });

      const restored = restoreDeletedWorkspaceDemoPageSnapshot(
        workspaceId,
        pageId,
        snapshot!.snapshotId,
      );

      expect(restored).toEqual({ success: false, reason: "PAGE_EXISTS" });
    });

    it("恢复删除快照时如果原父文件夹不存在则失败", () => {
      const workspaceId = `ws-restore-parent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      ws = path.join(getWorkspacesDir(), workspaceId);
      const pageId = "detail_1234";
      const demoDir = path.join(ws, "demos", pageId);
      fs.mkdirSync(demoDir, { recursive: true });
      fs.writeFileSync(path.join(demoDir, "index.tsx"), "export default function Page() { return <div />; }", "utf-8");
      fs.writeFileSync(path.join(demoDir, "config.schema.json"), "{}", "utf-8");
      fs.writeFileSync(
        path.join(ws, "workspace-tree.json"),
        JSON.stringify({
          folders: [{ id: "folder_1", name: "Folder", order: 0, parentId: null }],
          pages: [],
        }),
        "utf-8",
      );
      writeDemoPageMeta(ws, pageId, {
        name: "Detail",
        routeKey: "detail",
        parentId: "folder_1",
      });

      const snapshot = createDeletedWorkspaceDemoPageSnapshot(workspaceId, pageId);
      expect(deleteWorkspaceDemoPage(workspaceId, pageId)).toBe(true);
      fs.writeFileSync(
        path.join(ws, "workspace-tree.json"),
        JSON.stringify({ folders: [], pages: [] }),
        "utf-8",
      );

      const restored = restoreDeletedWorkspaceDemoPageSnapshot(
        workspaceId,
        pageId,
        snapshot!.snapshotId,
      );

      expect(restored).toEqual({
        success: false,
        reason: "PARENT_FOLDER_NOT_FOUND",
      });
    });
  });

  describe("listDemoPages", () => {
    let ws: string;
    beforeEach(() => {
      ws = makeTempWorkspace("ws-list");
    });
    afterEach(() => cleanup(ws));

    function createPages(
      pageMetas: Array<{ id: string; name: string; order: number }>,
    ) {
      const treePath = path.join(ws, "workspace-tree.json");
      const pages = pageMetas.map((m) => ({ ...m, parentId: null }));
      fs.writeFileSync(
        treePath,
        JSON.stringify({ folders: [], pages }, null, 2),
        "utf-8",
      );

      for (const m of pageMetas) {
        const dir = path.join(ws, "demos", m.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.tsx"), "// code", "utf-8");
        fs.writeFileSync(path.join(dir, "config.schema.json"), "{}", "utf-8");
      }
    }

    function createDemoMissingFiles(id: string) {
      const dir = path.join(ws, "demos", id);
      fs.mkdirSync(dir, { recursive: true });
      // 只写 schema，不写 index.tsx（缺失 index.tsx 不应被列出）
      fs.writeFileSync(path.join(dir, "config.schema.json"), "{}", "utf-8");
    }

    function createDemoNoMeta(id: string) {
      // 创建完整页面但不在 workspace-tree.json 中注册
      const dir = path.join(ws, "demos", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.tsx"), "// code", "utf-8");
      fs.writeFileSync(path.join(dir, "config.schema.json"), "{}", "utf-8");
    }

    it("demos 目录不存在时返回空数组", () => {
      expect(listDemoPages(ws)).toEqual([]);
    });

    it("按 order 升序排序，order 相同时按 id 字典序兜底", () => {
      createPages([
        { id: "page_a", name: "A", order: 2 },
        { id: "page_c", name: "C", order: 1 },
        { id: "page_b", name: "B", order: 1 },
      ]);

      const list = listDemoPages(ws);
      // order=1 的两个按 id 字典序: page_b < page_c，然后 order=2 的 page_a
      expect(list.map((d) => d.id)).toEqual(["page_b", "page_c", "page_a"]);
    });

    it("缺少 index.tsx 或 config.schema.json 的目录被排除", () => {
      createPages([{ id: "ok", name: "OK", order: 0 }]);
      createDemoMissingFiles("broken");

      const list = listDemoPages(ws);
      expect(list.map((d) => d.id)).toEqual(["ok"]);
    });

    it("按树中声明的运行时收录带遗留原型文件的高保真页面", () => {
      const pageId = "clipboard-import_e05e9d";
      fs.writeFileSync(
        path.join(ws, "workspace-tree.json"),
        JSON.stringify(
          {
            folders: [],
            pages: [
              {
                id: pageId,
                name: "剪贴板导入",
                order: 0,
                parentId: null,
                runtimeType: "high-fidelity-react",
              },
            ],
          },
          null,
          2,
        ),
        "utf-8",
      );
      const dir = path.join(ws, "demos", pageId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.tsx"), "// react", "utf-8");
      fs.writeFileSync(path.join(dir, "prototype.html"), "<!-- legacy -->", "utf-8");
      fs.writeFileSync(path.join(dir, "prototype.css"), "/* legacy */", "utf-8");
      fs.writeFileSync(path.join(dir, "prototype.meta.json"), "{}", "utf-8");
      fs.writeFileSync(path.join(dir, "config.schema.json"), "{}", "utf-8");

      expect(listDemoPages(ws).map((page) => page.id)).toEqual([pageId]);
    });

    it("workspace-tree.json 缺失但目录存在时从目录名提取可读名称", () => {
      createDemoNoMeta("product-detail_a3f2");

      const list = listDemoPages(ws);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("product-detail_a3f2");
      expect(list[0].name).toBe("product detail");
    });

    it("workspace-tree.json 缺失时不会收录混合运行时目录", () => {
      createDemoNoMeta("ambiguous-page");
      const dir = path.join(ws, "demos", "ambiguous-page");
      fs.writeFileSync(path.join(dir, "prototype.html"), "<!-- legacy -->", "utf-8");

      expect(() => listDemoPages(ws)).toThrow("PAGE_RUNTIME_FILES_INVALID");
    });
  });
});
