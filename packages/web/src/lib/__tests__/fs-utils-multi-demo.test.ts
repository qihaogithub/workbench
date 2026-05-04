import path from "path";
import fs from "fs";
import os from "os";
import {
  generateDemoPageId,
  getDemoDirPath,
  readDemoPageMeta,
  writeDemoPageMeta,
  listDemoPages,
  ensureWorkspaceFiles,
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
  describe("generateDemoPageId", () => {
    it("应符合 demo_<ts>_<rand6> 形态", () => {
      const id = generateDemoPageId();
      expect(id).toMatch(/^demo_\d+_[0-9a-z]{1,6}$/);
    });

    it("同一毫秒下批量生成不应碰撞（蒙特卡洛 1000 次）", () => {
      const ids = new Set<string>();
      const fixedNow = Date.now();
      const realNow = Date.now;
      Date.now = () => fixedNow;
      try {
        for (let i = 0; i < 1000; i++) {
          ids.add(generateDemoPageId());
        }
      } finally {
        Date.now = realNow;
      }
      // 1000 次随机 6 位 base36（约 21 亿空间），允许极低概率碰撞但应非常接近 1000
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

    it("空目录时应创建默认页面，返回 demoIds 与 defaultDemoMeta", () => {
      const result = ensureWorkspaceFiles(ws);
      expect(result.demoIds).toHaveLength(1);
      expect(result.defaultDemoMeta).toBeDefined();
      expect(result.defaultDemoMeta?.name).toBe("默认页面");
      expect(result.defaultDemoMeta?.order).toBe(0);

      const demoId = result.demoIds[0];
      const demoDir = path.join(ws, "demos", demoId);
      expect(fs.existsSync(path.join(demoDir, "index.tsx"))).toBe(true);
      expect(fs.existsSync(path.join(demoDir, "config.schema.json"))).toBe(true);
      expect(fs.existsSync(path.join(demoDir, ".demo.json"))).toBe(true);
    });

    it("已存在 demo 时不重复创建默认页面", () => {
      // 第一次创建默认页面
      const first = ensureWorkspaceFiles(ws);
      const firstId = first.demoIds[0];

      // 再次调用：返回现有 demoIds，无 defaultDemoMeta
      const second = ensureWorkspaceFiles(ws);
      expect(second.demoIds).toEqual([firstId]);
      expect(second.defaultDemoMeta).toBeUndefined();
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
      expect(result.demoIds).toHaveLength(1);
      expect(result.demoIds).not.toContain(brokenId);
      expect(result.defaultDemoMeta).toBeDefined();
    });
  });

  describe("readDemoPageMeta / writeDemoPageMeta", () => {
    let ws: string;
    beforeEach(() => {
      ws = makeTempWorkspace("ws-meta");
    });
    afterEach(() => cleanup(ws));

    it("写入后能读出完整 meta，updatedAt 自动更新", async () => {
      const demoId = "demo_test";
      const written = writeDemoPageMeta(ws, demoId, {
        name: "页面 A",
        order: 2,
      });

      expect(written.id).toBe(demoId);
      expect(written.name).toBe("页面 A");
      expect(written.order).toBe(2);
      expect(written.createdAt).toBeGreaterThan(0);
      expect(written.updatedAt).toBeGreaterThan(0);

      const read = readDemoPageMeta(ws, demoId);
      expect(read).toEqual(written);

      // 等待 1ms 后 patch order，updatedAt 应更新，createdAt 不变
      await new Promise((r) => setTimeout(r, 2));
      const patched = writeDemoPageMeta(ws, demoId, { order: 5 });
      expect(patched.name).toBe("页面 A"); // 未传 name 保留旧值
      expect(patched.order).toBe(5);
      expect(patched.createdAt).toBe(written.createdAt);
      expect(patched.updatedAt).toBeGreaterThan(written.updatedAt);
    });

    it("读取不存在的 meta 返回 null", () => {
      expect(readDemoPageMeta(ws, "non_existent")).toBeNull();
    });

    it("损坏的 .demo.json 返回 null（不抛错）", () => {
      const demoId = "demo_corrupt";
      const dir = getDemoDirPath(ws, demoId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, ".demo.json"), "{not-json", "utf-8");

      expect(readDemoPageMeta(ws, demoId)).toBeNull();
    });

    it("字段不完整的 .demo.json 返回 null", () => {
      const demoId = "demo_partial";
      const dir = getDemoDirPath(ws, demoId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, ".demo.json"),
        JSON.stringify({ id: demoId, name: "缺字段" }),
        "utf-8",
      );

      expect(readDemoPageMeta(ws, demoId)).toBeNull();
    });
  });

  describe("listDemoPages", () => {
    let ws: string;
    beforeEach(() => {
      ws = makeTempWorkspace("ws-list");
    });
    afterEach(() => cleanup(ws));

    function createDemo(id: string, opts?: { meta?: object | null; missingFile?: boolean }) {
      const dir = path.join(ws, "demos", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.tsx"), "// code", "utf-8");
      if (!opts?.missingFile) {
        fs.writeFileSync(path.join(dir, "config.schema.json"), "{}", "utf-8");
      }
      if (opts?.meta !== null) {
        const meta = opts?.meta ?? {
          id,
          name: id,
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        fs.writeFileSync(
          path.join(dir, ".demo.json"),
          JSON.stringify(meta),
          "utf-8",
        );
      }
    }

    it("demos 目录不存在时返回空数组", () => {
      expect(listDemoPages(ws)).toEqual([]);
    });

    it("按 order 升序排序，order 相同时按 createdAt 升序", () => {
      const now = Date.now();
      createDemo("a", {
        meta: { id: "a", name: "A", order: 2, createdAt: now, updatedAt: now },
      });
      createDemo("b", {
        meta: {
          id: "b",
          name: "B",
          order: 1,
          createdAt: now,
          updatedAt: now,
        },
      });
      createDemo("c", {
        meta: {
          id: "c",
          name: "C",
          order: 1,
          createdAt: now - 1000,
          updatedAt: now,
        },
      });

      const list = listDemoPages(ws);
      expect(list.map((d) => d.id)).toEqual(["c", "b", "a"]);
    });

    it("缺少 index.tsx 或 config.schema.json 的目录被排除", () => {
      createDemo("ok", {
        meta: {
          id: "ok",
          name: "OK",
          order: 0,
          createdAt: 1,
          updatedAt: 1,
        },
      });
      createDemo("broken", { missingFile: true });

      const list = listDemoPages(ws);
      expect(list.map((d) => d.id)).toEqual(["ok"]);
    });

    it(".demo.json 缺失时使用 id 名称兜底", () => {
      createDemo("nometa", { meta: null });

      const list = listDemoPages(ws);
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe("nometa");
      expect(list[0].name).toBe("nometa");
    });
  });
});
