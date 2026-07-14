import { describe, it, expect, beforeEach, vi } from "vitest";
import * as fs from "fs";
import { createEditFileTool } from "../../src/backends/pi-tools/edit-file-tool";
import type { AgentConfig } from "../../src/core/types";

vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

const mockConfig: AgentConfig = {
  sessionId: "test",
  workingDir: "/tmp/test-workspace",
};

function setup(content: string) {
  (fs.promises.readFile as any).mockResolvedValue(content);
  (fs.promises.writeFile as any).mockResolvedValue(undefined);
}

describe("editFile — edits[] 多块替换", () => {
  beforeEach(() => vi.clearAllMocks());

  it("一次调用多处替换", async () => {
    setup("aaa\nbbb\nccc\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [
        { old_string: "aaa", new_string: "AAA" },
        { old_string: "ccc", new_string: "CCC" },
      ],
    } as any);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Successfully replaced 2 block");
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toBe("AAA\nbbb\nCCC\n");
  });

  it("edits 全部匹配原始文件（非增量）", async () => {
    setup("aaa\nbbb\nccc\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [
        { old_string: "aaa", new_string: "AAA" },
        { old_string: "bbb", new_string: "BBB" },
      ],
    } as any);

    expect(result.isError).toBeFalsy();
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toBe("AAA\nBBB\nccc\n");
  });

  it("返回 editCount 信息", async () => {
    setup("x\ny\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [
        { old_string: "x", new_string: "X" },
        { old_string: "y", new_string: "Y" },
      ],
    } as any);

    expect(result.details?.editCount).toBe(2);
  });
});

describe("editFile — 匹配失败", () => {
  beforeEach(() => vi.clearAllMocks());

  it("old_string 未找到时返回文件预览", async () => {
    setup("line1\nline2\nline3\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "NOT_EXIST", new_string: "x" }],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Could not find");
    expect(result.content[0].text).toContain("First 20 lines");
  });

  it("多匹配拒绝", async () => {
    setup("dup\ndup\nother\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "dup", new_string: "DUP" }],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unique");
  });

  it("空 old_string 报错", async () => {
    setup("content\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "", new_string: "x" }],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("must not be empty");
  });
});

describe("editFile — 重叠检测", () => {
  beforeEach(() => vi.clearAllMocks());

  it("overlapping edits 被拒绝", async () => {
    setup("abcdef\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [
        { old_string: "abc", new_string: "ABC" },
        { old_string: "cde", new_string: "CDE" },
      ],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("overlap");
  });
});

describe("editFile — fuzzy matching", () => {
  beforeEach(() => vi.clearAllMocks());

  it("smart quotes 容错匹配", async () => {
    setup('const x = "hello";\n');
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.ts",
      edits: [{ old_string: "const x = \u201Chello\u201D;", new_string: "const x = 'world';" }],
    } as any);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("fuzzy match");
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toContain("const x = 'world';");
  });

  it("trailing whitespace 容错", async () => {
    // File has trailing spaces, model includes trailing spaces in old_string
    // Exact match fails (file "line1   " vs search "line1"), fuzzy strips trailing whitespace
    setup("line1\nline2\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "line1   ", new_string: "LINE1" }],
    } as any);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("fuzzy match");
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toContain("LINE1");
  });
});

describe("editFile — BOM 处理", () => {
  beforeEach(() => vi.clearAllMocks());

  it("BOM 文件正常编辑", async () => {
    setup("\uFEFFhello world\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "hello world", new_string: "HELLO WORLD" }],
    } as any);

    expect(result.isError).toBeFalsy();
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toBe("\uFEFFHELLO WORLD\n");
  });
});

describe("editFile — CRLF 保留", () => {
  beforeEach(() => vi.clearAllMocks());

  it("CRLF 文件保留原始行尾", async () => {
    setup("aaa\r\nbbb\r\nccc\r\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "bbb", new_string: "BBB" }],
    } as any);

    expect(result.isError).toBeFalsy();
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toBe("aaa\r\nBBB\r\nccc\r\n");
  });
});

describe("editFile — 参数校验", () => {
  beforeEach(() => vi.clearAllMocks());

  it("无 edits 时报错", async () => {
    setup("content\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
    } as any);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("requires a non-empty edits[]");
  });
});

describe("editFile — 删除操作", () => {
  beforeEach(() => vi.clearAllMocks());

  it("new_string 为空字符串时删除匹配内容", async () => {
    setup("keep\ndelete_me\nend\n");
    const tool = createEditFileTool(mockConfig);
    const result: any = await tool.execute("id", {
      path: "test.txt",
      edits: [{ old_string: "delete_me\n", new_string: "" }],
    } as any);

    expect(result.isError).toBeFalsy();
    const written = (fs.promises.writeFile as any).mock.calls[0][1];
    expect(written).toBe("keep\nend\n");
  });
});
