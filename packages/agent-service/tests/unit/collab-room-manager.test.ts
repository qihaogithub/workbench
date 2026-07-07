import fs from "fs";
import os from "os";
import path from "path";

import WebSocket from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CollabRoomManager } from "../../src/collab/collab-room-manager";
import { WorkspaceFilePersistence } from "../../src/collab/workspace-file-persistence";

interface TestRoom {
  text: Y.Text;
  dirty: boolean;
}

type SocketHandler = (...args: unknown[]) => void;

class MockSocket {
  readyState = WebSocket.OPEN;
  sent: Uint8Array[] = [];
  closed: { code: number; reason: string } | null = null;
  private handlers = new Map<string, SocketHandler[]>();

  send(message: Uint8Array): void {
    this.sent.push(message);
  }

  close(code: number, reason: string): void {
    this.readyState = WebSocket.CLOSED;
    this.closed = { code, reason };
  }

  on(event: string, handler: SocketHandler): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

let tempDir: string;
let workspacePath: string;
let pagePath: string;
let schemaPath: string;
let sketchScenePath: string;

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

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

async function connectPageSocket(manager: CollabRoomManager): Promise<MockSocket> {
  const socket = new MockSocket();
  await manager.handleConnection(socket as unknown as WebSocket, {
    projectId: "proj-1",
    workspaceId: "ws-1",
    sessionId: "session-1",
    resourcePath: "demos/page-1/index.tsx",
    kind: "page-code",
  });
  return socket;
}

function getSingleRoom(manager: CollabRoomManager): TestRoom {
  const rooms = (manager as unknown as { rooms: Map<string, TestRoom> }).rooms;
  const room = Array.from(rooms.values())[0];
  if (!room) throw new Error("Expected collab room to be created");
  return room;
}

function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  return encoding.toUint8Array(encoder);
}

function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.writeUpdate(encoder, update);
  return encoding.toUint8Array(encoder);
}

function applySyncMessage(doc: Y.Doc, message: Uint8Array): Uint8Array | null {
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);
  if (messageType !== MESSAGE_SYNC) return null;

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_SYNC);
  syncProtocol.readSyncMessage(decoder, encoder, doc, null);
  const response = encoding.toUint8Array(encoder);
  return response.length > 1 ? response : null;
}

function syncClientWithServer(socket: MockSocket, doc: Y.Doc): void {
  const startIndex = socket.sent.length;
  socket.emit("message", encodeSyncStep1(doc));

  for (const message of socket.sent.slice(startIndex)) {
    const response = applySyncMessage(doc, message);
    if (response) {
      socket.emit("message", response);
    }
  }
}

function encodeAwarenessUpdate(
  awareness: awarenessProtocol.Awareness,
  clientIds: number[],
): Uint8Array {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, clientIds),
  );
  return encoding.toUint8Array(encoder);
}

function applyAwarenessMessages(
  awareness: awarenessProtocol.Awareness,
  messages: Uint8Array[],
): void {
  for (const message of messages) {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    if (messageType !== MESSAGE_AWARENESS) continue;
    awarenessProtocol.applyAwarenessUpdate(
      awareness,
      decoding.readVarUint8Array(decoder),
      null,
    );
  }
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
  it("通过真实 Yjs sync 消息把客户端 A 的文本更新广播给客户端 B", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const socketA = await connectPageSocket(manager);
    const socketB = await connectPageSocket(manager);
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText("content");
    const textB = docB.getText("content");

    syncClientWithServer(socketA, docA);
    syncClientWithServer(socketB, docB);
    expect(textA.toString()).toBe("old file");
    expect(textB.toString()).toBe("old file");

    const updates: Uint8Array[] = [];
    docA.on("update", (update: Uint8Array) => {
      updates.push(update);
    });
    textA.insert(textA.length, " from client A");

    const socketBMessageStart = socketB.sent.length;
    socketA.emit("message", encodeSyncUpdate(updates[0]));
    for (const message of socketB.sent.slice(socketBMessageStart)) {
      applySyncMessage(docB, message);
    }

    expect(textB.toString()).toBe("old file from client A");
    expect(getSingleRoom(manager).text.toString()).toBe("old file from client A");
  });

  it("通过真实 awareness 消息广播在线状态，并在断连后移除该客户端状态", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const socketA = await connectPageSocket(manager);
    const socketB = await connectPageSocket(manager);
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const awarenessA = new awarenessProtocol.Awareness(docA);
    const awarenessB = new awarenessProtocol.Awareness(docB);

    syncClientWithServer(socketA, docA);
    syncClientWithServer(socketB, docB);

    awarenessA.setLocalStateField("presence", {
      userId: "session-1",
      username: "当前用户",
      color: "#2563eb",
      resourcePath: "demos/page-1/index.tsx",
      lastActiveAt: Date.now(),
    });

    const addedStart = socketB.sent.length;
    socketA.emit(
      "message",
      encodeAwarenessUpdate(awarenessA, [docA.clientID]),
    );
    applyAwarenessMessages(awarenessB, socketB.sent.slice(addedStart));

    expect(
      Array.from(awarenessB.getStates().values()).some((state) => {
        return (state as { presence?: { userId?: string } }).presence?.userId === "session-1";
      }),
    ).toBe(true);

    const removedStart = socketB.sent.length;
    socketA.emit("close");
    applyAwarenessMessages(awarenessB, socketB.sent.slice(removedStart));

    expect(
      Array.from(awarenessB.getStates().values()).some((state) => {
        return (state as { presence?: { userId?: string } }).presence?.userId === "session-1";
      }),
    ).toBe(false);
  });

  it("客户端文本更新后 flushWorkspace 会落盘并清除 dirty 状态", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));
    const socket = await connectPageSocket(manager);
    const doc = new Y.Doc();
    const text = doc.getText("content");

    syncClientWithServer(socket, doc);

    const updates: Uint8Array[] = [];
    doc.on("update", (update: Uint8Array) => {
      updates.push(update);
    });
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, "client saved content");
    });
    socket.emit("message", encodeSyncUpdate(updates[0]));

    const room = getSingleRoom(manager);
    expect(room.dirty).toBe(true);

    const result = await manager.flushWorkspace("proj-1", "ws-1", "session-1");

    expect(result).toEqual({ flushedRooms: 1, status: "flushed" });
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("client saved content");
  });

  it("连接参数非法时用 1008 关闭并返回可诊断 reason", async () => {
    const manager = new CollabRoomManager(new WorkspaceFilePersistence(tempDir));

    const missingSessionSocket = new MockSocket();
    await manager.handleConnection(missingSessionSocket as unknown as WebSocket, {
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "missing-session",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code",
    });

    const workspaceMismatchSocket = new MockSocket();
    await manager.handleConnection(workspaceMismatchSocket as unknown as WebSocket, {
      projectId: "proj-1",
      workspaceId: "ws-other",
      sessionId: "session-1",
      resourcePath: "demos/page-1/index.tsx",
      kind: "page-code",
    });

    const invalidResourceSocket = new MockSocket();
    await manager.handleConnection(invalidResourceSocket as unknown as WebSocket, {
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
      resourcePath: "../project.json",
      kind: "page-code",
    });

    expect(missingSessionSocket.closed).toEqual({
      code: 1008,
      reason: "SESSION_NOT_FOUND",
    });
    expect(workspaceMismatchSocket.closed).toEqual({
      code: 1008,
      reason: "WORKSPACE_MISMATCH",
    });
    expect(invalidResourceSocket.closed).toEqual({
      code: 1008,
      reason: "INVALID_RESOURCE_PATH",
    });
  });

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
