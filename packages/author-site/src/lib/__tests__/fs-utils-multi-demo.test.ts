import path from "path";
import fs from "fs";
import os from "os";
import {
  generateDemoPageId,
  generatePageSlug,
  getDemoDirPath,
  readDemoPageMeta,
  writeDemoPageMeta,
  listDemoPages,
  ensureWorkspaceFiles,
} from "../fs-utils";
import { BUILTIN_KNOWLEDGE_DOCUMENTS } from "../knowledge/builtin-documents";

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
    });

    it("已存在 AI 记忆文件时不应覆盖用户内容", () => {
      const memoryPath = path.join(ws, "memory.md");
      const content = "# 项目记忆\n\n- 用户已有内容\n";
      fs.writeFileSync(memoryPath, content, "utf-8");

      ensureWorkspaceFiles(ws);

      expect(fs.readFileSync(memoryPath, "utf-8")).toBe(content);
    });

    it("已存在 knowledge 目录时应保留用户文档并不再复制系统文档", () => {
      expect(BUILTIN_KNOWLEDGE_DOCUMENTS.map((item) => item.fileName)).toContain(
        "配置系统参考.md",
      );

      const knowledgeDir = path.join(ws, "knowledge");
      fs.mkdirSync(knowledgeDir, { recursive: true });
      fs.writeFileSync(path.join(knowledgeDir, "用户规范.md"), "# 用户规范", "utf-8");
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
      expect(fs.existsSync(path.join(knowledgeDir, "配置系统参考.md"))).toBe(false);
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
      expect(written.order).toBe(2);
      expect(written.parentId).toBeNull();

      const read = readDemoPageMeta(ws, demoId);
      expect(read).toEqual(written);

      // patch order：未传 name 保留旧值
      const patched = writeDemoPageMeta(ws, demoId, { order: 5 });
      expect(patched.name).toBe("页面 A");
      expect(patched.order).toBe(5);
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

    it("workspace-tree.json 缺失但目录存在时从目录名提取可读名称", () => {
      createDemoNoMeta("product-detail_a3f2");

      const list = listDemoPages(ws);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("product-detail_a3f2");
      expect(list[0].name).toBe("product detail");
    });
  });
});
