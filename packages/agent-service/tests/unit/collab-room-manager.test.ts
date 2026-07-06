import fs from "fs";
import os from "os";
import path from "path";

import WebSocket from "ws";
import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CollabRoomManager } from "../../src/collab/collab-room-manager";
import { WorkspaceFilePersistence } from "../../src/collab/workspace-file-persistence";

interface TestRoom {
  text: Y.Text;
  dirty: boolean;
}

class MockSocket {
  readyState = WebSocket.OPEN;
  sent: Uint8Array[] = [];
  closed: { code: number; reason: string } | null = null;

  send(message: Uint8Array): void {
    this.sent.push(message);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }

  on(): void {
    // The tests only need connection initialization; messages are not emitted.
  }
}

let tempDir: string;
let workspacePath: string;
let pagePath: string;
let schemaPath: string;
let sketchScenePath: string;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function setupWorkspace(): void {
  workspacePath = path.join(tempDir, "workspaces", "projects", "proj-1", "ws-1");
  pagePath = path.join(workspacePath, "demos", "page-1", "index.tsx");
  schemaPath = path.join(workspacePath, "demos", "page-1", "config.schema.json");
  sketchScenePath = path.join(workspacePath, "demos", "page-1", "sketch.scene.json");
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  fs.writeFileSync(pagePath, "old file", "utf-8");
  fs.writeFileSync(schemaPath, `{"type":"object"}`, "utf-8");
  fs.writeFileSync(sketchScenePath, `{"version":1,"pageSize":{"width":800,"height":600},"nodes":[]}`, "utf-8");
  writeJson(path.join(workspacePath, ".workspace.json"), {
    workspaceId: "ws-1",
    projectId: "proj-1",
    scope: "live",
    status: "active",
    updatedAt: 1,
  });
  writeJson(path.join(tempDir, "sessions", "user-1", "proj-1", "session-1", ".session.json"), {
    sessionId: "session-1",
    demoId: "proj-1",
    userId: "user-1",
    workspaceId: "ws-1",
    expiresAt: Date.now() + 60_000,
  });
}

async function createPageRoom(manager: CollabRoomManager): Promise<TestRoom> {
  await manager.handleConnection(new MockSocket() as unknown as WebSocket, {
    projectId: "proj-1",
    workspaceId: "ws-1",
    sessionId: "session-1",
    resourcePath: "demos/page-1/index.tsx",
    kind: "page-code",
  });

  const rooms = (manager as unknown as { rooms: Map<string, TestRoom> }).rooms;
  const room = Array.from(rooms.values())[0];
  if (!room) throw new Error("Expected collab room to be created");
  return room;
}

async function createSchemaRoom(manager: CollabRoomManager): Promise<TestRoom> {
  await manager.handleConnection(new MockSocket() as unknown as WebSocket, {
    projectId: "proj-1",
    workspaceId: "ws-1",
    sessionId: "session-1",
    resourcePath: "demos/page-1/config.schema.json",
    kind: "page-schema",
  });

  const rooms = (manager as unknown as { rooms: Map<string, TestRoom> }).rooms;
  const room = Array.from(rooms.values())[0];
  if (!room) throw new Error("Expected collab room to be created");
  return room;
}

async function createSketchSceneRoom(manager: CollabRoomManager): Promise<TestRoom> {
  await manager.handleConnection(new MockSocket() as unknown as WebSocket, {
    projectId: "proj-1",
    workspaceId: "ws-1",
    sessionId: "session-1",
    resourcePath: "demos/page-1/sketch.scene.json",
    kind: "page-sketch-scene",
  });

  const rooms = (manager as unknown as { rooms: Map<string, TestRoom> }).rooms;
  const room = Array.from(rooms.values())[0];
  if (!room) throw new Error("Expected collab room to be created");
  return room;
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-room-manager-"));
  setupWorkspace();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("CollabRoomManager", () => {
  it("AI 写入磁盘后重载旧协同房间，后续 flush 不会把旧文本写回", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createPageRoom(manager);

    room.text.delete(0, room.text.length);
    room.text.insert(0, "stale collab text");
    expect(room.dirty).toBe(true);

    fs.writeFileSync(pagePath, "ai fixed file", "utf-8");

    const result = manager.applyExternalFileChanges(workspacePath, [
      { path: "demos/page-1/index.tsx", action: "modified" },
    ]);
    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(result.reloadedRooms).toBe(1);
    expect(room.text.toString()).toBe("ai fixed file");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("ai fixed file");
  });

  it("当前页相对路径会回退命中嵌套页面协同房间", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createPageRoom(manager);

    expect(room.text.toString()).toBe("old file");
    expect(room.dirty).toBe(false);

    fs.writeFileSync(pagePath, "ai fixed file", "utf-8");

    const result = manager.applyExternalFileChanges(workspacePath, [
      { path: "index.tsx", action: "modified" },
    ]);
    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(result.reloadedRooms).toBe(1);
    expect(room.text.toString()).toBe("ai fixed file");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("ai fixed file");
  });

  it("workspace 根目录存在同名文件时当前页相对路径不会误命中嵌套页面", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createPageRoom(manager);

    const rootIndexPath = path.join(workspacePath, "index.tsx");
    fs.writeFileSync(rootIndexPath, "root file", "utf-8");

    const result = manager.applyExternalFileChanges(workspacePath, [
      { path: "index.tsx", action: "modified" },
    ]);
    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(result.reloadedRooms).toBe(0);
    expect(room.text.toString()).toBe("old file");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("old file");
    expect(fs.readFileSync(rootIndexPath, "utf-8")).toBe("root file");
  });

  it("即使外部写入通知缺失，flush 前也会拒绝旧协同文本覆盖新文件", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createPageRoom(manager);

    room.text.delete(0, room.text.length);
    room.text.insert(0, "stale collab text");
    fs.writeFileSync(pagePath, "ai fixed file", "utf-8");

    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(room.text.toString()).toBe("ai fixed file");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("ai fixed file");
  });

  it("客户端同步把磁盘基线重复合并时会重置为单份内容", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createPageRoom(manager);

    room.text.insert(room.text.length, "old file");
    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(room.text.toString()).toBe("old file");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("old file");
  });

  it("重复拼接的 JSON schema 会被归一化为单份内容再落盘", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createSchemaRoom(manager);
    const schema = `{"type":"object"}`;

    room.text.insert(room.text.length, `${schema}\n`);
    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(room.text.toString()).toBe(schema);
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(schemaPath, "utf-8")).toBe(schema);
  });

  it("手绘 scene 协同房间在外部 patch 写入后重载，flush 不会覆盖新 scene", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const room = await createSketchSceneRoom(manager);
    const externalScene = `{"version":1,"pageSize":{"width":800,"height":600},"nodes":[{"id":"a"}]}`;

    room.text.delete(0, room.text.length);
    room.text.insert(0, `{"version":1,"pageSize":{"width":800,"height":600},"nodes":[{"id":"stale"}]}`);
    fs.writeFileSync(sketchScenePath, externalScene, "utf-8");

    const result = manager.applyExternalFileChanges(workspacePath, [
      { path: "demos/page-1/sketch.scene.json", action: "modified" },
    ]);
    await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(result.reloadedRooms).toBe(1);
    expect(room.text.toString()).toBe(externalScene);
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(sketchScenePath, "utf-8")).toBe(externalScene);
  });
});
