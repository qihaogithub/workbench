import { describe, expect, it } from "vitest";
import { runAgentLoop } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import { Type } from "typebox";

function assistant(content: unknown[], stopReason: "toolUse" | "stop") {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "openai",
    model: "test-model",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
    stopReason,
    timestamp: Date.now(),
  } as any;
}

describe("Pi Agent active tools integration", () => {
  it("activates a tool after loading and makes it callable in the same run", async () => {
    const calls: string[][] = [];
    const activated = {
      name: "activateCapabilities",
      label: "Load capabilities",
      description: "Load workspace tools.",
      parameters: Type.Object({}),
      execute: async () => ({ content: [{ type: "text" as const, text: "workspace loaded" }], details: {} }),
    };
    const write = {
      name: "writeFile",
      label: "Write file",
      description: "Write a file.",
      parameters: Type.Object({ path: Type.String() }),
      execute: async () => ({ content: [{ type: "text" as const, text: "written" }], details: {} }),
    };
    let activeTools = [activated];
    let requestCount = 0;

    await runAgentLoop(
      [{ role: "user", content: "update the page", timestamp: Date.now() } as any],
      { systemPrompt: "test", messages: [], tools: activeTools } as any,
      {
        model: { provider: "openai", id: "test-model" } as any,
        convertToLlm: async (messages: any[]) => messages as any,
        prepareNextTurn: async ({ context }: any) => {
          if (requestCount === 1) activeTools = [activated, write];
          return { context: { ...context, tools: activeTools } };
        },
      } as any,
      async () => undefined,
      undefined,
      async (_model: any, context: any) => {
        calls.push((context.tools || []).map((tool: any) => tool.name));
        const stream = createAssistantMessageEventStream();
        requestCount += 1;
        const message = requestCount === 1
          ? assistant([{ type: "toolCall", id: "load-1", name: "activateCapabilities", arguments: {} }], "toolUse")
          : requestCount === 2
            ? assistant([{ type: "toolCall", id: "write-1", name: "writeFile", arguments: { path: "demos/home/index.tsx" } }], "toolUse")
            : assistant([{ type: "text", text: "done" }], "stop");
        stream.push({ type: "done", reason: message.stopReason, message });
        return stream;
      },
    );

    expect(calls).toEqual([
      ["activateCapabilities"],
      ["activateCapabilities", "writeFile"],
      ["activateCapabilities", "writeFile"],
    ]);
  });
});
