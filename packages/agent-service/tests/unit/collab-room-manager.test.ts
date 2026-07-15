import fs from "fs";
import crypto from "crypto";
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
import { resolveLiveWorkspaceMutationContext } from "../../src/workspace/workspace-mutation-authority";

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

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function setupWorkspace(): void {
  workspacePath = path.join(
    tempDir,
    "workspaces",
    "projects",
    "proj-1",
    "ws-1",
  );
  pagePath = path.join(workspacePath, "demos", "page-1", "index.tsx");
  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  fs.writeFileSync(pagePath, "old file", "utf-8");
  writeJson(path.join(workspacePath, ".workspace.json"), {
    workspaceId: "ws-1",
    projectId: "proj-1",
    scope: "live",
    status: "active",
    updatedAt: 1,
  });
  writeJson(
    path.join(
      tempDir,
      "sessions",
      "user-1",
      "proj-1",
      "session-1",
      ".session.json",
    ),
    {
      sessionId: "session-1",
      demoId: "proj-1",
      userId: "user-1",
      workspaceId: "ws-1",
      expiresAt: Date.now() + 60_000,
    },
  );
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

async function connectPageSocket(
  manager: CollabRoomManager,
): Promise<MockSocket> {
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

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-room-manager-"));
  setupWorkspace();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("CollabRoomManager", () => {
  it("通过真实 Yjs sync 消息把客户端 A 的文本更新广播给客户端 B", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );
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
    expect(getSingleRoom(manager).text.toString()).toBe(
      "old file from client A",
    );
  });

  it("通过真实 awareness 消息广播在线状态，并在断连后移除该客户端状态", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );
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
    socketA.emit("message", encodeAwarenessUpdate(awarenessA, [docA.clientID]));
    applyAwarenessMessages(awarenessB, socketB.sent.slice(addedStart));

    expect(
      Array.from(awarenessB.getStates().values()).some((state) => {
        return (
          (state as { presence?: { userId?: string } }).presence?.userId ===
          "session-1"
        );
      }),
    ).toBe(true);

    const removedStart = socketB.sent.length;
    socketA.emit("close");
    applyAwarenessMessages(awarenessB, socketB.sent.slice(removedStart));

    expect(
      Array.from(awarenessB.getStates().values()).some((state) => {
        return (
          (state as { presence?: { userId?: string } }).presence?.userId ===
          "session-1"
        );
      }),
    ).toBe(false);
  });

  it("客户端文本更新后 flushWorkspace 会落盘并清除 dirty 状态", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );
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

    expect(result).toEqual({ flushedRooms: 1, status: "flushed", revision: 2 });
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("client saved content");
  });

  it("连接参数非法时用 1008 关闭并返回可诊断 reason", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );

    const missingSessionSocket = new MockSocket();
    await manager.handleConnection(
      missingSessionSocket as unknown as WebSocket,
      {
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "missing-session",
        resourcePath: "demos/page-1/index.tsx",
        kind: "page-code",
      },
    );

    const workspaceMismatchSocket = new MockSocket();
    await manager.handleConnection(
      workspaceMismatchSocket as unknown as WebSocket,
      {
        projectId: "proj-1",
        workspaceId: "ws-other",
        sessionId: "session-1",
        resourcePath: "demos/page-1/index.tsx",
        kind: "page-code",
      },
    );

    const invalidResourceSocket = new MockSocket();
    await manager.handleConnection(
      invalidResourceSocket as unknown as WebSocket,
      {
        projectId: "proj-1",
        workspaceId: "ws-1",
        sessionId: "session-1",
        resourcePath: "../project.json",
        kind: "page-code",
      },
    );

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

  it("即使外部写入通知缺失，flush 检测到冲突后也会自愈 baseline 而非拒绝", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );
    const room = await createPageRoom(manager);

    room.text.delete(0, room.text.length);
    room.text.insert(0, "stale collab text");
    fs.writeFileSync(pagePath, "ai fixed file", "utf-8");

    // flushWorkspace should succeed (Yjs-First: auto-adopt drift, no rejection)
    const result = await manager.flushWorkspace("proj-1", "ws-1", "session-1");
    expect(result.status).toBe("flushed");

    // Yjs-First: room content is the authority — file gets room's content
    expect(room.text.toString()).toBe("stale collab text");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("stale collab text");
  });

  it("AI mutation 前会先 flush 目标资源协同草稿，Yjs-First 不再因旧 hash 冲突", async () => {
    const persistence = new WorkspaceFilePersistence(tempDir);
    const manager = new CollabRoomManager(persistence);
    const room = await createPageRoom(manager);

    room.text.delete(0, room.text.length);
    room.text.insert(0, "unsaved collab draft");

    // Yjs-First: assertExpected removed — AI mutation succeeds even with stale expectedHash
    // because flushDraftsForMutation flushes the collab draft first, then the mutation overwrites
    const receipt = await persistence.commitMutation({
      mutationId: "ai-commit-after-draft-flush",
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
      baseRevision: 0,
      actor: "ai",
      reason: "test",
      operations: [
        {
          type: "put_text",
          path: "demos/page-1/index.tsx",
          content: "ai fixed file",
          expectedHash: crypto
            .createHash("sha256")
            .update("old file")
            .digest("hex"),
        },
      ],
    });

    expect(receipt.committed).toBe(true);
    // Yjs-First: room content is NOT replaced — only baseline metadata updated
    expect(room.text.toString()).toBe("unsaved collab draft");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("ai fixed file");
  });

  it("Pi 工具的新 Authority 实例也会触发协同草稿 barrier", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );
    const room = await createPageRoom(manager);
    const liveWorkspace = resolveLiveWorkspaceMutationContext(workspacePath);
    if (!liveWorkspace) throw new Error("Expected live workspace context");

    room.text.delete(0, room.text.length);
    room.text.insert(0, "draft from collab room");

    // Yjs-First: assertExpected removed — mutation succeeds even with stale expectedHash
    const receipt = await liveWorkspace.authority.mutate({
      mutationId: "pi-tool-commit-after-draft-flush",
      projectId: liveWorkspace.projectId,
      workspaceId: liveWorkspace.workspaceId,
      sessionId: "session-1",
      baseRevision: 0,
      actor: "ai",
      reason: "test",
      operations: [
        {
          type: "put_text",
          path: "demos/page-1/index.tsx",
          content: "pi tool content",
          expectedHash: crypto
            .createHash("sha256")
            .update("old file")
            .digest("hex"),
        },
      ],
    });

    expect(receipt.committed).toBe(true);
    // Yjs-First: room content is NOT replaced — only baseline metadata updated
    expect(room.text.toString()).toBe("draft from collab room");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("pi tool content");
  });

  it("Authority receipt 按确切资源路径更新协同房间，不依赖 legacy 文件事件", async () => {
    const persistence = new WorkspaceFilePersistence(tempDir);
    const manager = new CollabRoomManager(persistence);
    const room = await createPageRoom(manager);
    const content = "committed by authority";

    await persistence.commitMutation({
      mutationId: "authority-to-room",
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
      baseRevision: 0,
      actor: "ai",
      reason: "test",
      operations: [
        {
          type: "put_text",
          path: "demos/page-1/index.tsx",
          content,
          expectedHash: crypto
            .createHash("sha256")
            .update("old file")
            .digest("hex"),
        },
      ],
    });

    // Yjs-First: room content is NOT replaced — only baseline metadata updated
    expect(room.text.toString()).toBe("old file");
    expect(room.dirty).toBe(false);
    expect(fs.readFileSync(pagePath, "utf-8")).toBe(content);
  });

  it("外部 mutation 只更新 baseline 元数据，不替换 room 内容（Yjs-First）", async () => {
    const persistence = new WorkspaceFilePersistence(tempDir);
    const manager = new CollabRoomManager(persistence);
    const room = await createPageRoom(manager);

    // Room starts with "old file" content
    expect(room.text.toString()).toBe("old file");

    // External mutation writes new content to disk
    await persistence.commitMutation({
      mutationId: "external-mutation-test",
      projectId: "proj-1",
      workspaceId: "ws-1",
      sessionId: "session-1",
      baseRevision: 0,
      actor: "ai",
      reason: "test",
      operations: [
        {
          type: "put_text",
          path: "demos/page-1/index.tsx",
          content: "ai authoritative content",
          expectedHash: crypto
            .createHash("sha256")
            .update("old file")
            .digest("hex"),
        },
      ],
    });

    // Yjs-First: room content is NOT replaced — only baseline metadata updated
    expect(room.text.toString()).toBe("old file");
    // File on disk has the external content
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("ai authoritative content");
  });

  it("dirty room flush 覆盖外部文件修改（Yjs-First: room 是唯一内容权威）", async () => {
    const manager = new CollabRoomManager(
      new WorkspaceFilePersistence(tempDir),
    );
    const room = await createPageRoom(manager);

    // User edits the room
    room.text.delete(0, room.text.length);
    room.text.insert(0, "user draft");
    expect(room.dirty).toBe(true);

    // External direct file write (not through Authority)
    fs.writeFileSync(pagePath, "external content", "utf-8");

    // Room content is still the user's draft
    expect(room.text.toString()).toBe("user draft");

    // Flush — room content wins (Yjs-First: room is single content authority)
    await (
      manager as unknown as {
        flushRoom: (room: TestRoom) => Promise<void>;
      }
    ).flushRoom(room as TestRoom);

    // File now has the user's draft (room content overwrites external write)
    expect(fs.readFileSync(pagePath, "utf-8")).toBe("user draft");
    expect(room.dirty).toBe(false);
  });
});
