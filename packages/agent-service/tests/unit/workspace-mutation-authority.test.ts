import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMutationAuthority, WorkspaceMutationAuthorityError } from "../../src/workspace/workspace-mutation-authority";

const temporaryRoots: string[] = [];
const hash = (content: string) => crypto.createHash("sha256").update(content).digest("hex");

function createAuthority(initial = "before") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workspace-authority-"));
  temporaryRoots.push(root);
  const workspacePath = path.join(root, "workspace");
  fs.mkdirSync(path.join(workspacePath, "demos", "home"), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), initial, "utf-8");
  return {
    workspacePath,
    authority: new WorkspaceMutationAuthority({
      dataDir: path.join(root, "data"),
      resolveWorkspacePath: (workspaceId) => workspaceId === "workspace-1" ? workspacePath : null,
    }),
  };
}

afterEach(() => {
  while (temporaryRoots.length) fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe("WorkspaceMutationAuthority", () => {
  it("提交 receipt 后才发布事件，并拒绝旧 hash 覆盖", async () => {
    const { authority, workspacePath } = createAuthority();
    const events: string[] = [];
    authority.onCommitted(({ receipt }) => {
      const authorityDir = path.join(path.dirname(workspacePath), "data", "workspace-authority", "workspace-1");
      expect(JSON.parse(fs.readFileSync(path.join(authorityDir, "state.json"), "utf-8")).revision).toBe(receipt.revision);
      expect(JSON.parse(fs.readFileSync(path.join(authorityDir, "receipts", `${receipt.mutationId}.json`), "utf-8"))).toEqual(receipt);
      events.push(receipt.mutationId);
    });
    const receipt = await authority.mutate({
      mutationId: "mutation-1", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    });
    expect(receipt.revision).toBe(2);
    expect(fs.readFileSync(path.join(workspacePath, "demos/home/index.tsx"), "utf-8")).toBe("after");
    expect(events).toEqual(["mutation-1"]);
    await expect(authority.mutate({
      mutationId: "mutation-2", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "collab", reason: "stale", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "stale", expectedHash: hash("before") }],
    })).rejects.toMatchObject({ code: "WORKSPACE_RESOURCE_CONFLICT" } satisfies Partial<WorkspaceMutationAuthorityError>);
  });

  it("允许旧 revision 在目标资源 hash 未变化时安全 rebase", async () => {
    const { authority, workspacePath } = createAuthority();
    fs.mkdirSync(path.join(workspacePath, "demos", "other"), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "demos", "other", "index.tsx"), "other-before", "utf-8");

    const first = await authority.mutate({
      mutationId: "rebase-first", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "home-after", expectedHash: hash("before") }],
    });
    const rebased = await authority.mutate({
      mutationId: "rebase-unrelated", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "collab", reason: "test", operations: [{ type: "put_text", path: "demos/other/index.tsx", content: "other-after", expectedHash: hash("other-before") }],
    });

    expect(first.revision).toBe(2);
    expect(rebased.revision).toBe(3);
    expect(fs.readFileSync(path.join(workspacePath, "demos", "other", "index.tsx"), "utf-8")).toBe("other-after");
  });

  it("跨 Authority 入口并发提交仍按 Workspace revision 串行", async () => {
    const { authority, workspacePath } = createAuthority();
    fs.mkdirSync(path.join(workspacePath, "demos", "other"), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "demos", "other", "index.tsx"), "other-before", "utf-8");
    const otherEntry = new WorkspaceMutationAuthority({
      dataDir: path.join(path.dirname(workspacePath), "data"),
      resolveWorkspacePath: (workspaceId) => workspaceId === "workspace-1" ? workspacePath : null,
    });

    const [first, second] = await Promise.all([
      authority.mutate({
        mutationId: "serial-first", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
        actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "home-after", expectedHash: hash("before") }],
      }),
      otherEntry.mutate({
        mutationId: "serial-second", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
        actor: "author-site", reason: "test", operations: [{ type: "put_text", path: "demos/other/index.tsx", content: "other-after", expectedHash: hash("other-before") }],
      }),
    ]);

    expect([first.revision, second.revision]).toEqual([2, 3]);
    expect((await authority.getState("project-1", "workspace-1")).revision).toBe(3);
  });

  it("按 revision 返回 committed catch-up 事件且观察者异常不改变 receipt", async () => {
    const { authority } = createAuthority();
    authority.onCommitted(() => { throw new Error("observer failed"); });
    const first = await authority.mutate({
      mutationId: "catchup-first", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "second", expectedHash: hash("before") }],
    });
    const second = await authority.mutate({
      mutationId: "catchup-second", projectId: "project-1", workspaceId: "workspace-1", baseRevision: first.revision,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "third", expectedHash: hash("second") }],
    });

    expect(second.committed).toBe(true);
    expect((await authority.getCommittedEventsSince("project-1", "workspace-1", 1))
      .map((event) => event.receipt.revision)).toEqual([2, 3]);
    expect((await authority.getCommittedEventsSince("project-1", "workspace-1", 2))
      .map((event) => event.receipt.mutationId)).toEqual(["catchup-second"]);
  });

  it("bootstrap 只生成 revision 1 状态和备份，不修改业务内容", async () => {
    const { authority, workspacePath } = createAuthority();
    const targetPath = path.join(workspacePath, "demos", "home", "index.tsx");
    const before = fs.readFileSync(targetPath);
    const beforeMtime = fs.statSync(targetPath).mtimeMs;

    const state = await authority.bootstrap("project-1", "workspace-1");

    expect(state.revision).toBe(1);
    expect(state.resourceHashes).toEqual({ "demos/home/index.tsx": hash("before") });
    expect(fs.readFileSync(targetPath)).toEqual(before);
    expect(fs.statSync(targetPath).mtimeMs).toBe(beforeMtime);
  });

  it("mutation 诊断从 received 串到 committed 和 conflicted，不记录源码", async () => {
    const { authority, workspacePath } = createAuthority();
    await authority.mutate({
      mutationId: "diagnostic-commit", projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "diagnostic-secret-content", expectedHash: hash("before") }],
    });
    await expect(authority.mutate({
      mutationId: "diagnostic-conflict", projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", baseRevision: 1,
      actor: "collab", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "stale-secret-content", expectedHash: hash("before") }],
    })).rejects.toMatchObject({ code: "WORKSPACE_RESOURCE_CONFLICT" });

    const diagnosticsPath = path.join(path.dirname(workspacePath), "data", "editor-diagnostics", "agent-service.jsonl");
    const diagnostics = fs.readFileSync(diagnosticsPath, "utf-8");
    expect(diagnostics).toContain('"eventType":"workspace.mutation_received"');
    expect(diagnostics).toContain('"eventType":"workspace.mutation_prepared"');
    expect(diagnostics).toContain('"eventType":"workspace.mutation_committed"');
    expect(diagnostics).toContain('"eventType":"workspace.mutation_conflicted"');
    expect(diagnostics).not.toContain("diagnostic-secret-content");
    expect(diagnostics).not.toContain("stale-secret-content");
    const events = diagnostics.trim().split("\n").map((line) => JSON.parse(line) as {
      eventType: string;
      projectId: string;
      workspaceId: string;
      sessionId: string;
      operationId: string;
      traceId: string;
      payload: Record<string, unknown>;
    }).filter((event) => event.eventType.startsWith("workspace.mutation_"));
    expect(events.length).toBeGreaterThanOrEqual(4);
    for (const event of events) {
      expect(event).toMatchObject({
        projectId: "project-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
      });
      expect(event.operationId).toBe(event.traceId);
      expect(event.payload).toEqual(expect.objectContaining({
        mutationId: event.operationId,
        baseRevision: expect.any(Number),
        actor: expect.any(String),
        resourcePaths: expect.any(Array),
        traceId: event.traceId,
        durationMs: expect.any(Number),
      }));
      expect(event.payload).toHaveProperty("revision");
    }
  });

  it("apply 中途失败回滚后记录 workspace.mutation_rolled_back", async () => {
    const { authority, workspacePath } = createAuthority();
    fs.mkdirSync(path.join(workspacePath, "demos", "other"), { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "demos", "other", "index.tsx"), "other-before", "utf-8");
    await authority.bootstrap("project-1", "workspace-1");
    const firstTargetPath = path.join(workspacePath, "demos", "home", "index.tsx");
    const failingTargetPath = path.join(workspacePath, "demos", "other", "index.tsx");
    const realRenameSync = fs.renameSync.bind(fs);
    let injected = false;
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation(((source: fs.PathLike, destination: fs.PathLike) => {
      if (!injected && path.resolve(String(destination)) === path.resolve(failingTargetPath)) {
        injected = true;
        throw new Error("injected disk failure");
      }
      realRenameSync(source, destination);
    }) as typeof fs.renameSync);

    try {
      await expect(authority.mutate({
        mutationId: "diagnostic-rollback", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
        actor: "ai", reason: "test", operations: [
          { type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") },
          { type: "put_text", path: "demos/other/index.tsx", content: "other-after", expectedHash: hash("other-before") },
        ],
      })).rejects.toThrow("injected disk failure");
    } finally {
      renameSpy.mockRestore();
    }

    expect(fs.readFileSync(firstTargetPath, "utf-8")).toBe("before");
    expect(fs.readFileSync(failingTargetPath, "utf-8")).toBe("other-before");
    const diagnostics = fs.readFileSync(path.join(path.dirname(workspacePath), "data", "editor-diagnostics", "agent-service.jsonl"), "utf-8");
    expect(diagnostics).toContain('"eventType":"workspace.mutation_rolled_back"');
    expect(diagnostics).toContain('"outcome":"applied_rollback"');
  });

  it("同 mutationId 重试返回同一 receipt，payload 改变会被拒绝", async () => {
    const { authority } = createAuthority();
    const request = { mutationId: "mutation-1", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1, actor: "ai" as const, reason: "test", operations: [{ type: "put_text" as const, path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }] };
    const first = await authority.mutate(request);
    expect(await authority.mutate(request)).toEqual(first);
    await expect(authority.mutate({ ...request, operations: [{ ...request.operations[0], content: "different" }] })).rejects.toMatchObject({ code: "WORKSPACE_MUTATION_ID_REUSED" });
  });

  it("二进制资源必须先 staging，再以 hash 校验的 put_binary 提交", async () => {
    const { authority, workspacePath } = createAuthority();
    const bytes = Buffer.from([0, 255, 1, 2, 3, 128]);
    const staged = await authority.stageBinary("project-1", "workspace-1", bytes);
    const receipt = await authority.mutate({
      mutationId: "binary-1", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "author-site", reason: "asset_localize",
      operations: [{ type: "put_binary", path: "assets/images/image.bin", stagingId: staged.stagingId, hash: staged.hash, size: staged.size, expectedAbsent: true }],
    });
    expect(fs.readFileSync(path.join(workspacePath, "assets", "images", "image.bin"))).toEqual(bytes);
    expect(receipt.resources).toEqual([expect.objectContaining({ path: "assets/images/image.bin", afterHash: staged.hash })]);
    expect(fs.existsSync(path.join(path.dirname(workspacePath), "data", "workspace-authority", "workspace-1", "staging", `${staged.stagingId}.bin`))).toBe(false);
  });

  it("启动时回滚没有 receipt 的 prepared mutation，避免半写入成为新版本", async () => {
    const { authority, workspacePath } = createAuthority("before");
    const previousState = await authority.bootstrap("project-1", "workspace-1");
    const preparedDir = path.join(path.dirname(workspacePath), "data", "workspace-authority", "workspace-1", "prepared");
    fs.mkdirSync(preparedDir, { recursive: true });
    fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), "partially-applied", "utf-8");
    fs.writeFileSync(path.join(preparedDir, "interrupted.json"), JSON.stringify({
      request: { mutationId: "interrupted", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1, actor: "ai", reason: "test", operations: [] },
      payloadHash: "payload",
      previousState,
      before: {
        "demos/home/index.tsx": { exists: true, content: "before", hash: hash("before") },
      },
    }), "utf-8");

    const recovered = new WorkspaceMutationAuthority({
      dataDir: path.join(path.dirname(workspacePath), "data"),
      resolveWorkspacePath: (workspaceId) => workspaceId === "workspace-1" ? workspacePath : null,
    });
    const state = await recovered.getState("project-1", "workspace-1");

    expect(fs.readFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), "utf-8")).toBe("before");
    expect(fs.existsSync(path.join(preparedDir, "interrupted.json"))).toBe(false);
    expect(state.revision).toBe(previousState.revision);
  });

  it("不同入口创建的 Authority 实例共享 committed 事件总线", async () => {
    const { authority, workspacePath } = createAuthority();
    const otherEntry = new WorkspaceMutationAuthority({
      dataDir: path.join(path.dirname(workspacePath), "data"),
      resolveWorkspacePath: (workspaceId) => workspaceId === "workspace-1" ? workspacePath : null,
    });
    const observed: string[] = [];
    otherEntry.onCommitted(({ receipt }) => observed.push(receipt.mutationId));

    await authority.mutate({
      mutationId: "shared-event", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    });

    expect(observed).toEqual(["shared-event"]);
  });

  it("检测到其他实例持有持久化 lease 时 fail closed", async () => {
    const { authority, workspacePath } = createAuthority();
    const leasePath = path.join(path.dirname(workspacePath), "data", "workspace-authority", "leases", "workspace-1.lock");
    fs.mkdirSync(path.dirname(leasePath), { recursive: true });
    fs.writeFileSync(leasePath, "other-instance", "utf-8");

    await expect(authority.mutate({
      mutationId: "lease-blocked", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    })).rejects.toMatchObject({ code: "WORKSPACE_WRITE_LEASE_UNAVAILABLE" });
  });

  it("snapshot 只返回当前 committed 文本资源与相同 revision", async () => {
    const { authority } = createAuthority();
    const receipt = await authority.mutate({
      mutationId: "snapshot", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    });
    const snapshot = await authority.getSnapshot("project-1", "workspace-1");
    expect(snapshot.state.revision).toBe(receipt.revision);
    expect(snapshot.resources["demos/home/index.tsx"]).toBe("after");
  });

  it("只在显式 reconcile adopt 后接纳外部漂移", async () => {
    const { authority, workspacePath } = createAuthority();
    await authority.bootstrap("project-1", "workspace-1");
    fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), "external", "utf-8");
    await expect(authority.getSnapshot("project-1", "workspace-1")).rejects.toMatchObject({ code: "WORKSPACE_EXTERNAL_DRIFT" });
    const reconciled = await authority.reconcileAdopt("project-1", "workspace-1");
    expect(reconciled.revision).toBe(2);
    expect((await authority.getSnapshot("project-1", "workspace-1")).resources["demos/home/index.tsx"]).toBe("external");
  });

  it("显式 reconcile restore 从 committed backup 恢复并删除漂移新增资源", async () => {
    const { authority, workspacePath } = createAuthority();
    const receipt = await authority.mutate({
      mutationId: "committed-for-restore", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "committed", expectedHash: hash("before") }],
    });
    fs.writeFileSync(path.join(workspacePath, "demos/home/index.tsx"), "external", "utf-8");
    fs.writeFileSync(path.join(workspacePath, "project.config.values.json"), "{\"external\":true}", "utf-8");

    const restored = await authority.reconcileRestore("project-1", "workspace-1");

    expect(restored.revision).toBe(receipt.revision);
    expect(fs.readFileSync(path.join(workspacePath, "demos/home/index.tsx"), "utf-8")).toBe("committed");
    expect(fs.existsSync(path.join(workspacePath, "project.config.values.json"))).toBe(false);
    expect(authority.getHealth("project-1", "workspace-1")).toMatchObject({
      ready: true,
      externalDrift: false,
      missingBackupCount: 0,
    });
  });

  it("committed backup 缺失时 restore fail closed 且保留外部内容", async () => {
    const { authority, workspacePath } = createAuthority();
    const state = await authority.bootstrap("project-1", "workspace-1");
    const dataDir = path.join(path.dirname(workspacePath), "data");
    fs.rmSync(path.join(dataDir, "workspace-authority", "workspace-1", "backups", `${state.resourceHashes["demos/home/index.tsx"]}.bin`));
    fs.writeFileSync(path.join(workspacePath, "demos/home/index.tsx"), "external", "utf-8");

    await expect(authority.reconcileRestore("project-1", "workspace-1")).rejects.toMatchObject({
      code: "WORKSPACE_AUTHORITY_BACKUP_MISSING",
    });
    expect(fs.readFileSync(path.join(workspacePath, "demos/home/index.tsx"), "utf-8")).toBe("external");
    expect(authority.getHealth("project-1", "workspace-1").missingBackupCount).toBe(1);
  });

  it("health 只读返回 ready、journal 和 external drift 状态", async () => {
    const { authority, workspacePath } = createAuthority();
    const initial = authority.getHealth("project-1", "workspace-1");
    expect(initial.ready).toBe(false);
    expect(initial.stateExists).toBe(false);
    expect(initial.workspaceExists).toBe(true);
    expect(initial.queueDepth).toBe(0);

    const state = await authority.bootstrap("project-1", "workspace-1");
    const ready = authority.getHealth("project-1", "workspace-1");
    expect(ready).toMatchObject({
      ready: true,
      stateExists: true,
      workspaceExists: true,
      revision: state.revision,
      rootHash: state.rootHash,
      actualRootHash: state.rootHash,
      externalDrift: false,
      activeLease: false,
      preparedCount: 0,
      stagingCount: 0,
      backupCount: 1,
      missingBackupCount: 0,
      receiptCount: 0,
      journalEntries: 0,
      projectionAckEntries: 0,
      conflictCount: 0,
      eventSubscriberCount: 0,
    });

    await authority.mutate({
      mutationId: "health-mutation", projectId: "project-1", workspaceId: "workspace-1", baseRevision: state.revision,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    });
    const committed = authority.getHealth("project-1", "workspace-1");
    expect(committed.ready).toBe(true);
    expect(committed.receiptCount).toBe(1);
    expect(committed.journalEntries).toBe(2);

    fs.writeFileSync(path.join(workspacePath, "demos", "home", "index.tsx"), "external", "utf-8");
    const drifted = authority.getHealth("project-1", "workspace-1");
    expect(drifted.ready).toBe(false);
    expect(drifted.externalDrift).toBe(true);
    expect(drifted.actualRootHash).not.toBe(drifted.rootHash);
  });

  it("health 持久统计 mutation 冲突并暴露 committed event 订阅者数", async () => {
    const { authority, workspacePath } = createAuthority();
    await authority.bootstrap("project-1", "workspace-1");
    const unsubscribe = authority.onCommitted(() => undefined);
    expect(authority.getHealth("project-1", "workspace-1").eventSubscriberCount).toBe(1);

    await expect(authority.mutate({
      mutationId: "health-conflict", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "stale", expectedHash: hash("not-current") }],
    })).rejects.toMatchObject({ code: "WORKSPACE_RESOURCE_CONFLICT" });

    const restarted = new WorkspaceMutationAuthority({
      dataDir: path.join(path.dirname(workspacePath), "data"),
      resolveWorkspacePath: (workspaceId) => workspaceId === "workspace-1" ? workspacePath : null,
    });
    expect(restarted.getHealth("project-1", "workspace-1").conflictCount).toBe(1);
    unsubscribe();
    expect(restarted.getHealth("project-1", "workspace-1").eventSubscriberCount).toBe(0);
  });

  it("health 暴露 active lease 和 prepared 事务，供 preflight fail closed", async () => {
    const { authority, workspacePath } = createAuthority();
    await authority.bootstrap("project-1", "workspace-1");
    const dataDir = path.join(path.dirname(workspacePath), "data");
    const leasePath = path.join(dataDir, "workspace-authority", "leases", "workspace-1.lock");
    const preparedPath = path.join(dataDir, "workspace-authority", "workspace-1", "prepared", "pending.json");
    fs.mkdirSync(path.dirname(leasePath), { recursive: true });
    fs.mkdirSync(path.dirname(preparedPath), { recursive: true });
    fs.writeFileSync(leasePath, "other-instance", "utf-8");
    fs.writeFileSync(preparedPath, "{}", "utf-8");

    const health = authority.getHealth("project-1", "workspace-1");

    expect(health.ready).toBe(false);
    expect(health.activeLease).toBe(true);
    expect(health.preparedCount).toBe(1);
  });

  it("projection ack 独立记录，不能把已提交 mutation 改为失败", async () => {
    const { authority, workspacePath } = createAuthority();
    const receipt = await authority.mutate({
      mutationId: "ack", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "after", expectedHash: hash("before") }],
    });
    await authority.recordProjectionAck({
      projectId: "project-1", workspaceId: "workspace-1", revision: receipt.revision,
      mutationId: receipt.mutationId, clientId: "client-1", surface: "active-preview", status: "failed",
      runtimeError: { code: "COMPILE_ERROR", message: "bad code" }, acknowledgedAt: Date.now(),
    });
    const ackFile = path.join(path.dirname(workspacePath), "data", "workspace-authority", "workspace-1", "projection-acks.jsonl");
    expect(fs.readFileSync(ackFile, "utf-8")).toContain('"status":"failed"');
    expect((await authority.getState("project-1", "workspace-1")).revision).toBe(receipt.revision);
    const diagnostics = fs.readFileSync(path.join(path.dirname(workspacePath), "data", "editor-diagnostics", "agent-service.jsonl"), "utf-8");
    expect(diagnostics).toContain('"eventType":"workspace.projection_failed"');
    expect(diagnostics).toContain('"errorCode":"COMPILE_ERROR"');
  });

  it("projection ack 可独立查询和订阅且观察者异常不影响持久化", async () => {
    const { authority } = createAuthority();
    const observed: string[] = [];
    authority.onProjectionAck(({ ack }) => observed.push(ack.clientId));
    authority.onProjectionAck(() => { throw new Error("observer failed"); });
    await authority.recordProjectionAck({
      projectId: "project-1", workspaceId: "workspace-1", revision: 1,
      clientId: "preview-client", surface: "active-preview", status: "applied", acknowledgedAt: Date.now(),
    });

    expect(observed).toEqual(["preview-client"]);
    expect(await authority.getProjectionAcks("project-1", "workspace-1")).toEqual([
      expect.objectContaining({ clientId: "preview-client", revision: 1, status: "applied" }),
    ]);
  });

  it("projection ack 记录 applied，落后 Authority revision 时另记 gap_detected", async () => {
    const { authority, workspacePath } = createAuthority();
    const first = await authority.mutate({
      mutationId: "projection-first", projectId: "project-1", workspaceId: "workspace-1", baseRevision: 1,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "second", expectedHash: hash("before") }],
    });
    await authority.mutate({
      mutationId: "projection-second", projectId: "project-1", workspaceId: "workspace-1", baseRevision: first.revision,
      actor: "ai", reason: "test", operations: [{ type: "put_text", path: "demos/home/index.tsx", content: "third", expectedHash: hash("second") }],
    });

    await authority.recordProjectionAck({
      projectId: "project-1", workspaceId: "workspace-1", sessionId: "session-1", revision: first.revision,
      mutationId: first.mutationId, clientId: "preview-1", surface: "active-preview", status: "applied",
      acknowledgedAt: Date.now(),
    });

    const events = fs.readFileSync(
      path.join(path.dirname(workspacePath), "data", "editor-diagnostics", "agent-service.jsonl"),
      "utf-8",
    ).trim().split("\n").map((line) => JSON.parse(line) as {
      eventType: string;
      sessionId: string;
      traceId: string;
      payload: Record<string, unknown>;
    }).filter((event) => event.eventType.startsWith("workspace.projection_"));
    expect(events.map((event) => event.eventType)).toEqual([
      "workspace.projection_applied",
      "workspace.projection_gap_detected",
    ]);
    for (const event of events) {
      expect(event.sessionId).toBe("session-1");
      expect(event.traceId).toBe(first.mutationId);
      expect(event.payload).toEqual(expect.objectContaining({
        mutationId: first.mutationId,
        revision: first.revision,
        currentRevision: first.revision + 1,
        clientId: "preview-1",
        surface: "active-preview",
        projectionLatencyMs: expect.any(Number),
      }));
    }
  });
});
