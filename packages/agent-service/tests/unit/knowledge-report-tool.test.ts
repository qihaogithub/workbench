import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { setSystemKnowledgeSnapshot } from "../../src/config/system-knowledge";
import { createKnowledgeReportTool } from "../../src/backends/pi-tools/knowledge-report-tool";
import { createReadKnowledgeSourceTool } from "../../src/backends/pi-tools/read-knowledge-source-tool";

describe("knowledgeReport tool", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-report-tool-"));
    fs.mkdirSync(path.join(tempDir, "knowledge"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "knowledge", "manifest.json"),
      JSON.stringify({
        items: [
          {
            id: "project-rule",
            title: "开奖规则",
            description: "当前项目采用三轮开奖。",
            fileName: "开奖规则.md",
            tags: ["开奖"],
            category: "业务规则",
            updatedAt: "2026-06-26T00:00:00.000Z",
          },
        ],
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(tempDir, "knowledge", "开奖规则.md"),
      "# 开奖规则\n\n当前项目采用三轮开奖，配置修改前必须确认页面文案。",
      "utf-8",
    );
    setSystemKnowledgeSnapshot({
      version: 1,
      updatedAt: "2026-06-26T00:00:00.000Z",
      documents: [
        {
          id: "sys-schema",
          title: "配置系统参考",
          description: "修改配置前必须确认 Schema。",
          fileName: "配置系统参考.md",
          content: "系统配置硬约束正文",
          category: "配置",
          tags: ["schema"],
          enabled: true,
          sortOrder: 0,
          version: 1,
          contentHash: "hash",
          aiSummary: "修改配置前必须确认 Schema。",
          aiKeywords: ["schema", "配置"],
          summaryStatus: "ready",
          createdAt: "2026-06-26T00:00:00.000Z",
          updatedAt: "2026-06-26T00:00:00.000Z",
          sizeBytes: 10,
        },
      ],
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("生成包含来源、可信等级和原文建议的作者侧知识报告", async () => {
    const tool = createKnowledgeReportTool({
      sessionId: "session-1",
      workingDir: tempDir,
    });

    const result = await tool.execute("call-1", { question: "开奖配置怎么改？" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0]?.text).toContain("知识报告");
    expect(result.content[0]?.text).toContain("配置系统参考");
    expect(result.content[0]?.text).toContain("hard-constraint");
    expect(result.content[0]?.text).toContain("knowledge/开奖规则.md");
  });

  it("使用端报告不会暴露作者私有知识", async () => {
    const tool = createKnowledgeReportTool(
      {
        sessionId: "viewer-session",
        workingDir: tempDir,
      },
      { mode: "viewer-readonly" },
    );

    const result = await tool.execute("call-1", { question: "开奖配置怎么改？" });

    expect(result.content[0]?.text).not.toContain("当前项目采用三轮开奖");
    expect(result.content[0]?.text).toContain("未找到当前主体可用资料");
  });

  it("作者侧报告附加其他模板项目来源并使用 projectId 排除当前项目", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        currentProjectId?: string;
      };
      expect(body.currentProjectId).toBe("project-current");
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            hits: [
              {
                sourceRef: "knowledge://chunk_1234567890abcdef12345678",
                projectId: "project-template",
                projectName: "客服模板",
                documentId: "document-1",
                title: "退款口径",
                path: "knowledge/退款口径.md",
                kind: "knowledge-document",
                revision: 8,
                rootHash: "root-8",
                snippet: "超过七天不可退款",
                score: -1,
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;
    try {
      const tool = createKnowledgeReportTool({
        sessionId: "session-template-search",
        projectId: "project-current",
        demoId: "page-current",
        workingDir: tempDir,
      });

      const result = await tool.execute("call-template", {
        question: "退款规则是什么？",
      });

      expect(result.content[0]?.text).toContain("其他模板项目参考");
      expect(result.content[0]?.text).toContain("客服模板 / 退款口径");
      expect(result.content[0]?.text).toContain(
        "knowledge://chunk_1234567890abcdef12345678",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("按知识报告返回的不透明引用读取模板项目完整原文", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            source: {
              sourceRef: "knowledge://chunk_1234567890abcdef12345678",
              projectId: "project-template",
              projectName: "客服模板",
              documentId: "document-1",
              title: "退款口径",
              path: "knowledge/退款口径.md",
              kind: "knowledge-document",
              revision: 8,
              rootHash: "root-8",
              content: "# 退款口径\n\n超过七天不可退款。",
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
    try {
      const result = await createReadKnowledgeSourceTool().execute(
        "call-read-source",
        { sourceRef: "knowledge://chunk_1234567890abcdef12345678" },
      );

      expect(result.isError).toBeUndefined();
      expect(result.content[0]?.text).toContain("客服模板");
      expect(result.content[0]?.text).toContain("超过七天不可退款");
      expect(result.details).toMatchObject({
        projectId: "project-template",
        revision: 8,
        rootHash: "root-8",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("原文引用失效时返回明确错误", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: "KNOWLEDGE_SOURCE_NOT_FOUND",
            message: "知识来源不存在",
          },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
    try {
      const result = await createReadKnowledgeSourceTool().execute(
        "call-missing-source",
        { sourceRef: "knowledge://chunk_000000000000000000000000" },
      );

      expect(result.isError).toBe(true);
      expect(result.details).toEqual({
        error: "KNOWLEDGE_SOURCE_NOT_FOUND",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
