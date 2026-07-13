import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ToolHookManager } from "../../src/backends/managers/tool-hook-manager";
import type { AgentConfig, AgentEvent, FileChange } from "../../src/core/types";

describe("ToolHookManager", () => {
  const temporaryRoots: string[] = [];
  const config: AgentConfig = {
    sessionId: "test-session",
    workingDir: "/tmp/workspace",
  };

  let events: AgentEvent[];
  let manager: ToolHookManager;

  beforeEach(() => {
    events = [];
    manager = new ToolHookManager(config, (event) => events.push(event));
  });

  afterEach(() => {
    while (temporaryRoots.length)
      fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  });

  describe("getFileChangesForTool", () => {
    it("工具出错时不应返回文件变更", () => {
      const changes = manager.getFileChangesForTool(
        "writeFile",
        { path: "a.ts" },
        true,
        {},
      );
      expect(changes).toEqual([]);
    });

    it("writeFile 应产生 modified 变更且包含 content", () => {
      const changes = manager.getFileChangesForTool(
        "writeFile",
        { path: "demos/page.tsx", content: "export default 1" },
        false,
        {},
      );
      expect(changes).toEqual([
        {
          path: "demos/page.tsx",
          action: "modified",
          content: "export default 1",
        },
      ]);
    });

    it("live Workspace 修改只以 durable receipt 生成摘要", () => {
      const changes = manager.getFileChangesForTool(
        "writeFile",
        { path: "wrong-path.ts", content: "untrusted input" },
        false,
        {
          details: {
            receipt: {
              committed: true,
              mutationId: "mutation-1",
              projectId: "proj-1",
              workspaceId: "ws-1",
              baseRevision: 1,
              revision: 2,
              rootHash: "root",
              actor: "ai",
              resources: [
                {
                  path: "demos/page-1/index.tsx",
                  action: "modified",
                  beforeHash: "before",
                  afterHash: "after",
                },
                {
                  path: "workspace-tree.json",
                  action: "created",
                  beforeHash: null,
                  afterHash: "tree",
                },
              ],
              committedAt: 1,
            },
          },
        },
      );
      expect(changes).toEqual([
        { path: "demos/page-1/index.tsx", action: "modified" },
        { path: "workspace-tree.json", action: "created" },
      ]);
    });

    it("live Workspace 缺少 receipt 时不从工具名推断已修改", () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "tool-hook-live-"));
      temporaryRoots.push(root);
      const workingDir = path.join(
        root,
        "data",
        "workspaces",
        "projects",
        "proj-1",
        "ws-1",
      );
      fs.mkdirSync(workingDir, { recursive: true });
      fs.writeFileSync(
        path.join(workingDir, ".workspace.json"),
        JSON.stringify({
          scope: "live",
          projectId: "proj-1",
          workspaceId: "ws-1",
        }),
      );
      const liveManager = new ToolHookManager({
        sessionId: "session-1",
        workingDir,
      });

      expect(
        liveManager.getFileChangesForTool(
          "writeFile",
          { path: "demos/page-1/index.tsx", content: "unproven" },
          false,
          {},
        ),
      ).toEqual([]);
    });

    it("editFile 应产生 modified 变更但不包含 content", () => {
      const changes = manager.getFileChangesForTool(
        "editFile",
        { path: "src/index.ts" },
        false,
        {},
      );
      expect(changes).toEqual([{ path: "src/index.ts", action: "modified" }]);
    });

    it("writeFile 缺少 path 时应返回空", () => {
      expect(manager.getFileChangesForTool("writeFile", {}, false, {})).toEqual(
        [],
      );
    });

    it("sketch patch 工具应捕获真实变更并忽略 no-op patch", () => {
      expect(
        manager.getFileChangesForTool(
          "patchSketchScene",
          { pageId: "page-1" },
          false,
          { details: { patch: { changed: true } } },
        ),
      ).toEqual([
        { path: "demos/page-1/sketch.scene.json", action: "modified" },
      ]);

      expect(
        manager.getFileChangesForTool(
          "patchSketchScene",
          { pageId: "page-1" },
          false,
          { details: { patch: { changed: false } } },
        ),
      ).toEqual([]);
    });

    it("未识别的工具应返回空变更", () => {
      expect(
        manager.getFileChangesForTool("bash", { command: "ls" }, false, {}),
      ).toEqual([]);
    });
  });

  describe("recordToolFileChange", () => {
    it("应将变更推入文件列表", () => {
      manager.recordToolFileChange(
        "writeFile",
        { path: "a.ts", content: "a" },
        false,
        {},
      );
      expect(manager.getFiles()).toHaveLength(1);
      expect(manager.getFiles()[0].path).toBe("a.ts");
    });

    it("应去重相同 path/action/content 的变更", () => {
      manager.recordToolFileChange(
        "writeFile",
        { path: "a.ts", content: "a" },
        false,
        {},
      );
      manager.recordToolFileChange(
        "writeFile",
        { path: "a.ts", content: "a" },
        false,
        {},
      );
      expect(manager.getFiles()).toHaveLength(1);
    });
  });

  describe("resetForNewMessage", () => {
    it("应清空文件列表和已发射的操作键", () => {
      manager.recordToolFileChange(
        "writeFile",
        { path: "a.ts", content: "a" },
        false,
        {},
      );
      expect(manager.getFiles()).toHaveLength(1);
      manager.resetForNewMessage();
      expect(manager.getFiles()).toEqual([]);
    });

    it("应清空 mutation receipts", () => {
      manager.handleToolResult(
        "writeFile",
        { path: "demos/page/index.tsx" },
        false,
        {
          details: {
            receipt: {
              committed: true,
              mutationId: "m-1",
              projectId: "p-1",
              workspaceId: "w-1",
              baseRevision: 1,
              revision: 2,
              rootHash: "h",
              actor: "ai",
              resources: [
                {
                  path: "demos/page/index.tsx",
                  action: "modified",
                  beforeHash: "a",
                  afterHash: "b",
                },
              ],
              committedAt: 1,
            },
          },
        },
        "session-1",
      );
      expect(manager.getMutationReceipts()).toHaveLength(1);
      manager.resetForNewMessage();
      expect(manager.getMutationReceipts()).toEqual([]);
    });
  });

  describe("handleToolResult", () => {
    it("应捕获文件变更并通过 onFileChanges 回调通知", () => {
      const collected: FileChange[] = [];
      manager.handleToolResult(
        "writeFile",
        { path: "b.ts", content: "b" },
        false,
        {},
        "session-1",
        { onFileChanges: (changes) => collected.push(...changes) },
      );
      expect(collected).toHaveLength(1);
      expect(manager.getFiles()).toHaveLength(1);
    });

    it("文件写入成功后只记录工具摘要，协同投影由 Authority receipt 驱动", () => {
      manager.handleToolResult(
        "writeFile",
        { path: "demos/page-1/index.tsx", content: "fixed" },
        false,
        {},
        "session-1",
      );

      expect(manager.getFiles()).toEqual([
        {
          path: "demos/page-1/index.tsx",
          action: "modified",
          content: "fixed",
        },
      ]);
    });

    it("no-op sketch patch 不生成工具文件摘要", () => {
      manager.handleToolResult(
        "patchSketchScene",
        { pageId: "page-1" },
        false,
        { details: { patch: { changed: false } } },
        "session-1",
      );

      expect(manager.getFiles()).toEqual([]);
    });

    it("readFile 知识库路径时应记录到 readKnowledgeFiles", () => {
      manager.handleToolResult(
        "readFile",
        { path: "knowledge/rules.md" },
        false,
        {},
        "session-1",
      );
      expect(manager.getReadKnowledgeFiles().has("rules.md")).toBe(true);
    });

    it("工具结果包含 receipt 时应收集到 mutationReceipts", () => {
      manager.handleToolResult(
        "writeFile",
        { path: "demos/page/index.tsx" },
        false,
        {
          details: {
            receipt: {
              committed: true,
              mutationId: "mutation-abc",
              projectId: "p-1",
              workspaceId: "w-1",
              baseRevision: 1,
              revision: 2,
              rootHash: "hash",
              actor: "ai",
              resources: [
                {
                  path: "demos/page/index.tsx",
                  action: "modified",
                  beforeHash: "old",
                  afterHash: "new",
                },
              ],
              committedAt: 1000,
            },
          },
        },
        "session-1",
      );

      const receipts = manager.getMutationReceipts();
      expect(receipts).toHaveLength(1);
      expect(receipts[0]).toMatchObject({
        mutationId: "mutation-abc",
        revision: 2,
        status: "committed",
        actor: "ai",
        resources: [{ path: "demos/page/index.tsx", action: "modified" }],
      });
    });

    it("多次工具调用应累积 receipts", () => {
      const receiptEvent = (mutationId: string, revision: number) => ({
        details: {
          receipt: {
            committed: true,
            mutationId,
            projectId: "p-1",
            workspaceId: "w-1",
            baseRevision: revision - 1,
            revision,
            rootHash: "h",
            actor: "ai",
            resources: [
              {
                path: "a.ts",
                action: "modified",
                beforeHash: "x",
                afterHash: "y",
              },
            ],
            committedAt: Date.now(),
          },
        },
      });
      manager.handleToolResult(
        "writeFile",
        { path: "a.ts" },
        false,
        receiptEvent("m1", 1),
        "s",
      );
      manager.handleToolResult(
        "writeFile",
        { path: "a.ts" },
        false,
        receiptEvent("m2", 2),
        "s",
      );

      expect(manager.getMutationReceipts()).toHaveLength(2);
      expect(
        manager.getMutationReceipts().map((receipt) => receipt.mutationId),
      ).toEqual(["m1", "m2"]);
    });
  });

  describe("updatePlanFromToolResult", () => {
    it("非 updatePlan 工具应忽略", () => {
      manager.updatePlanFromToolResult("writeFile", false, {}, "session-1");
      expect(events).toHaveLength(0);
    });

    it("updatePlan 且 items 合法时应发射 plan 事件", () => {
      manager.updatePlanFromToolResult(
        "updatePlan",
        false,
        {
          details: {
            items: [
              { id: "1", title: "步骤一", status: "completed" },
              { id: "2", title: "步骤二", status: "pending" },
            ],
          },
        },
        "session-1",
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("plan");
    });

    it("items 缺失或非法时应忽略", () => {
      manager.updatePlanFromToolResult(
        "updatePlan",
        false,
        { details: {} },
        "session-1",
      );
      expect(events).toHaveLength(0);
    });
  });
});
