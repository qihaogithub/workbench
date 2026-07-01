import fs from "fs";
import os from "os";
import path from "path";

const mockDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "editor-diagnostics-"));

jest.mock("@/lib/fs-utils", () => ({
  getDataDir: () => mockDataDir,
}));

import {
  appendEditorDiagnosticEvents,
  buildEditorDiagnosticExport,
  readEditorDiagnosticEvents,
} from "./store";

describe("editor diagnostics store", () => {
  afterAll(() => {
    fs.rmSync(mockDataDir, { recursive: true, force: true });
  });

  it("写入 JSONL 并按 editorSessionId 导出", async () => {
    await appendEditorDiagnosticEvents([
      {
        id: "evt-1",
        editorSessionId: "editor-session-1",
        projectId: "project-1",
        sessionId: "session-1",
        timestamp: 1,
        category: "autosave",
        name: "autosave.flush_started",
        details: {
          token: "secret",
          revision: 1,
        },
      },
    ]);

    const events = await readEditorDiagnosticEvents("editor-session-1");
    expect(events).toHaveLength(1);
    expect(events[0].details).toEqual({
      token: "[redacted]",
      revision: 1,
    });

    fs.mkdirSync(path.join(mockDataDir, "agent-run-logs", "session-1"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(mockDataDir, "agent-run-logs", "session-1", "msg-1.jsonl"),
      "{}\n",
    );

    const exported = await buildEditorDiagnosticExport("editor-session-1");
    expect(exported.events).toHaveLength(1);
    expect(exported.agentRunLogs).toEqual([
      {
        sessionId: "session-1",
        messageIds: ["msg-1"],
      },
    ]);
  });

  it("拒绝混合 editorSessionId 的批量写入", async () => {
    await expect(
      appendEditorDiagnosticEvents([
        {
          id: "evt-1",
          editorSessionId: "editor-session-2",
          projectId: "project-1",
          timestamp: 1,
          category: "system",
          name: "one",
        },
        {
          id: "evt-2",
          editorSessionId: "editor-session-3",
          projectId: "project-1",
          timestamp: 2,
          category: "system",
          name: "two",
        },
      ]),
    ).rejects.toThrow("MIXED_EDITOR_SESSION_ID");
  });
});
