import { describe, expect, it } from "vitest";

import { AgentFileQueue } from "../../src/workspace/agent-file-queue";

const request = (resourcePaths: string[]) => ({
  dataDir: "/tmp/workbench-queue",
  workspaceId: "workspace-1",
  resourcePaths,
});

describe("AgentFileQueue", () => {
  it("按规范化路径串行同一文件，并把等待时间暴露给调用方", async () => {
    const queue = new AgentFileQueue();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const started: string[] = [];

    const first = queue.run(request(["./demos/home/index.tsx"]), async (context) => {
      started.push("first");
      await gate;
      return context;
    });
    const second = queue.run(request(["demos/home/index.tsx"]), async (context) => {
      started.push("second");
      return context;
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(started).toEqual(["first"]);
    release();

    const [firstContext, secondContext] = await Promise.all([first, second]);
    expect(firstContext.normalizedPaths).toEqual(["demos/home/index.tsx"]);
    expect(secondContext.normalizedPaths).toEqual(["demos/home/index.tsx"]);
    expect(secondContext.waitMs).toBeGreaterThanOrEqual(0);
    expect(started).toEqual(["first", "second"]);
  });

  it("不同文件不互相阻塞，允许 Agent 推理/准备阶段并行", async () => {
    const queue = new AgentFileQueue();
    const started = new Set<string>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const first = queue.run(request(["demos/a.tsx"]), async () => {
      started.add("a");
      await gate;
    });
    const second = queue.run(request(["demos/b.tsx"]), async () => {
      started.add("b");
    });

    await second;
    expect(started).toEqual(new Set(["a", "b"]));
    release();
    await first;
  });
});
