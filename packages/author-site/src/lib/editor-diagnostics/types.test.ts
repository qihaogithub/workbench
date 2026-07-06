import {
  normalizeEditorDiagnosticEvent,
  sanitizeDiagnosticDetails,
  sanitizeDiagnosticEvent,
} from "./types";

describe("editor diagnostic sanitizers", () => {
  it("脱敏敏感字段并截断大段文本", () => {
    const details = sanitizeDiagnosticDetails({
      authorization: "Bearer secret",
      apiKey: "secret-key",
      prompt: "x".repeat(800),
      nested: {
        token: "token-value",
        message: "正常摘要",
      },
    });

    expect(details).toEqual({
      authorization: "[redacted]",
      apiKey: "[redacted]",
      prompt: { length: 800, redacted: true },
      nested: {
        token: "[redacted]",
        message: "正常摘要",
      },
    });
  });

  it("不会把源码正文写入事件 details", () => {
    const event = sanitizeDiagnosticEvent({
      id: "evt-1",
      editorSessionId: "editor-session-1",
      projectId: "project-1",
      timestamp: 1,
      category: "preview",
      name: "preview.compile",
      details: {
        code: "export default function Demo() { return <div /> }",
        schema: "{\"type\":\"object\"}",
      },
    });

    expect(event.details).toEqual({
      code: { length: 49, redacted: true },
      schema: { length: 17, redacted: true },
    });
  });

  it("把旧 JSONL 事件映射为统一事件模型并对白名单 payload 治理", () => {
    const event = normalizeEditorDiagnosticEvent({
      id: "evt-1",
      editorSessionId: "editor-session-1",
      projectId: "project-1",
      sessionId: "session-1",
      workspaceId: "workspace-1",
      activePageId: "page-1",
      timestamp: 1,
      category: "preview",
      name: "preview.compile_failed",
      traceId: "trace-1",
      level: "error",
      details: {
        compileHash: "hash-1",
        code: "x".repeat(20),
        prompt: "secret prompt",
        ignored: "not allowed",
      },
    });

    expect(event).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        ts: "1970-01-01T00:00:00.001Z",
        source: "frontend",
        eventGroup: "preview",
        eventType: "preview.compile_failed",
        pageId: "page-1",
      }),
    );
    expect(event.payload).toEqual({
      compileHash: "hash-1",
      code: { length: 20, redacted: true },
      prompt: { length: 13, redacted: true },
    });
  });

  it("保留预览运行时事件的关键排查字段", () => {
    const event = normalizeEditorDiagnosticEvent({
      id: "evt-preview-runtime",
      editorSessionId: "editor-session-1",
      projectId: "project-1",
      activePageId: "page-1",
      timestamp: 1,
      category: "preview",
      name: "preview.runtime_event",
      details: {
        level: "info",
        stage: "module_loaded",
        sinceStart: 123,
        requestId: "request-1",
        pageId: "page-1",
        ignored: "not allowed",
      },
    });

    expect(event.payload).toEqual({
      level: "info",
      stage: "module_loaded",
      sinceStart: 123,
      requestId: "request-1",
      pageId: "page-1",
    });
  });

  it("保留草图 patch 校验摘要但不写入 scene 内容", () => {
    const event = normalizeEditorDiagnosticEvent({
      id: "evt-sketch-patch",
      editorSessionId: "editor-session-1",
      projectId: "project-1",
      activePageId: "page-1",
      timestamp: 1,
      category: "page",
      name: "page.sketch_patch_validated",
      details: {
        status: "validated",
        success: true,
        operationCount: 3,
        hasBaseSceneKey: true,
        currentNodeCount: 2,
        targetNodeCount: 3,
        targetSource: "server_patch",
        sketchScene: "{\"nodes\":[{\"id\":\"secret\"}]}",
        operations: [{ op: "add", node: { id: "node-1" } }],
      },
    });

    expect(event.payload).toEqual({
      status: "validated",
      success: true,
      operationCount: 3,
      hasBaseSceneKey: true,
      currentNodeCount: 2,
      targetNodeCount: 3,
      targetSource: "server_patch",
    });
  });

});
