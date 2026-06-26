import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

import { closeDb } from "../../db";
import {
  createSystemKnowledgeDocument,
  listSystemKnowledgeIndexItems,
} from "../system-knowledge";

describe("system-knowledge", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-knowledge-test-"));
    process.env.DATA_DIR = tmpDir;
  });

  afterEach(() => {
    closeDb();
    delete process.env.DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("保存系统知识时摘要失败不阻塞，索引使用 fallback", async () => {
    const { document, summaryResult } = await createSystemKnowledgeDocument({
      title: "测试知识",
      description: "管理员填写的描述",
      content: "# 测试知识\n\n正文内容",
      category: "测试",
      tags: ["alpha"],
    });

    expect(document.title).toBe("测试知识");
    expect(summaryResult.ok).toBe(false);

    const item = listSystemKnowledgeIndexItems().find((entry) => entry.id === document.id);
    expect(item?.aiSummary).toBe("管理员填写的描述");
    expect(item?.aiKeywords).toContain("alpha");
  });
});
