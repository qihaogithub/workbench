import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { setSystemKnowledgeSnapshot } from "../../src/config/system-knowledge";
import { createKnowledgeReportTool } from "../../src/backends/pi-tools/knowledge-report-tool";

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
});
