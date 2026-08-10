import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDelegateTaskTool, type SubagentRunner } from "../../src/backends/pi-tools/subagent-tool";
import type { AgentConfig } from "../../src/core/types";

const baseConfig: AgentConfig = { sessionId: "test-session" };

const runner: SubagentRunner = async (params) => ({
  success: true,
  content: `ok type=${params.subagentType ?? "unset"}`,
  durationMs: 1,
});

function hasProperty(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

describe("createDelegateTaskTool 图片子 Agent 能力开关", () => {
  it("imageSubagentEnabled=false 时不暴露 subagentType 参数且描述不含 image", () => {
    const tool = createDelegateTaskTool(runner, baseConfig, {
      imageSubagentEnabled: false,
    });
    const props = (tool.parameters as any).properties ?? {};
    expect(hasProperty(props, "subagentType")).toBe(false);
    expect(tool.description).not.toContain("subagentType: 'image'");
  });

  it("imageSubagentEnabled=true 时暴露 subagentType 参数且描述含 image", () => {
    const tool = createDelegateTaskTool(runner, baseConfig, {
      imageSubagentEnabled: true,
    });
    const props = (tool.parameters as any).properties ?? {};
    expect(hasProperty(props, "subagentType")).toBe(true);
    expect(tool.description).toContain("subagentType: 'image'");
  });

  it("未启用时模型强行传 subagentType=image 被拒绝，且不调用 runner", async () => {
    const runnerSpy: SubagentRunner = vi.fn(
      async () => ({ success: true, content: "oops", durationMs: 1 }),
    );
    const tool = createDelegateTaskTool(runnerSpy, baseConfig, {
      imageSubagentEnabled: false,
    });
    const result = await tool.execute("id", {
      task: "generate hero",
      subagentType: "image",
    } as any);
    expect(result.isError).toBe(true);
    expect(result.details.error).toBe("image_subagent_disabled");
    expect(runnerSpy).not.toHaveBeenCalled();
  });

  it("启用时 subagentType=image 正常委派", async () => {
    const tool = createDelegateTaskTool(runner, baseConfig, {
      imageSubagentEnabled: true,
    });
    const result = await tool.execute("id", {
      task: "generate hero",
      subagentType: "image",
    } as any);
    expect(result.isError).toBe(false);
    expect(result.details).toMatchObject({ success: true });
  });
});