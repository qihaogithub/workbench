import { describe, it, expect } from "vitest";
import { createWorkbenchTools } from "../../src/backends/pi-tools";
import type { AgentConfig } from "../../src/core/types";

const baseConfig: AgentConfig = { sessionId: "test-session" };

function names(tools: ReturnType<typeof createWorkbenchTools>): string[] {
  return tools.map((t) => t.name).sort();
}

describe("createWorkbenchTools imageSubagent 定向工具集", () => {
  it("imageSubagent=true 时只包含图像相关工具", () => {
    const tools = createWorkbenchTools(baseConfig, undefined, {
      mode: "workbench",
      imageSubagent: true,
    });
    const toolNames = names(tools);
    expect(toolNames).toEqual([
      "extractImageElement",
      "generateImage",
      "listFiles",
      "listImages",
      "readFile",
      "readUserImage",
      "saveImage",
      "writeFile",
    ]);
  });

  it("默认主 Agent 工具集不包含图像生成工具", () => {
    const tools = createWorkbenchTools(baseConfig, undefined, {
      mode: "workbench",
      includeDelegateTask: false,
    });
    const toolNames = names(tools);
    expect(toolNames).not.toContain("generateImage");
    expect(toolNames).not.toContain("extractImageElement");
    expect(toolNames).not.toContain("delegateTask");
  });
});