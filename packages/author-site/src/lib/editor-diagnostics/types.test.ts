import {
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
});
