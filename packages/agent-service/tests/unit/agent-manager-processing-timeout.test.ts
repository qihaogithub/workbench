import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentConfig, AgentStatus } from "../../src/core/types";

vi.mock("../../src/core/timeouts", () => ({
  INACTIVITY_TIMEOUT_MS: 1000,
  ABSOLUTE_TIMEOUT_MS: 3000,
  PROCESSING_MAX_TIMEOUT_MS: 2000,
}));

import { AgentManager } from "../../src/core/agent-manager";
import { BaseAgent } from "../../src/core/agent";

class MockAgent extends BaseAgent {
  kill = vi.fn().mockResolvedValue(undefined);

  constructor(config: AgentConfig, status: AgentStatus, lastActivityAt: Date) {
    super(config);
    this._status = status;
    this.lastActivityAt = lastActivityAt;
  }

  async start(): Promise<void> {}
  async sendMessage(): Promise<any> {
    return { success: true };
  }
  cancel(): void {}
  updateConfig(): void {}
  setModel = undefined;
  getModelInfo = undefined;
  getCurrentSessionId = undefined;
}

function createMockFactory() {
  return {
    create: vi.fn(),
    register: vi.fn(),
    has: vi.fn().mockReturnValue(true),
    getRegisteredTypes: vi.fn().mockReturnValue(["pi-agent"]),
  };
}

describe("AgentManager processing 状态兜底", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("processing 状态超过 PROCESSING_MAX_TIMEOUT_MS 的 agent 被 kill", () => {
    vi.setSystemTime(new Date("2024-01-01T00:01:00Z"));
    const factory = createMockFactory();
    const manager = new AgentManager(factory as any, 3600000);

    const staleTime = new Date(Date.now() - 2000 - 1000);
    const agent = new MockAgent(
      { sessionId: "stuck" },
      "processing",
      staleTime,
    );
    (manager as any).agents.set("stuck", agent);

    const cleaned = manager.cleanupIdleAgents(3600000);

    expect(agent.kill).toHaveBeenCalled();
    expect(cleaned).toBe(1);
  });

  it("processing 状态未超时的 agent 不被 kill", () => {
    vi.setSystemTime(new Date("2024-01-01T00:01:00Z"));
    const factory = createMockFactory();
    const manager = new AgentManager(factory as any, 3600000);

    const recentTime = new Date(Date.now() - 500);
    const agent = new MockAgent({ sessionId: "ok" }, "processing", recentTime);
    (manager as any).agents.set("ok", agent);

    const cleaned = manager.cleanupIdleAgents(3600000);

    expect(agent.kill).not.toHaveBeenCalled();
    expect(cleaned).toBe(0);
  });

  it("非 processing 状态 agent 的现有行为不受影响", () => {
    vi.setSystemTime(new Date("2024-01-01T01:01:00Z"));
    const factory = createMockFactory();
    const manager = new AgentManager(factory as any, 3600000);

    const idleTime = new Date(Date.now() - 3600000 - 1000);
    const agent = new MockAgent({ sessionId: "idle" }, "ready", idleTime);
    (manager as any).agents.set("idle", agent);

    const cleaned = manager.cleanupIdleAgents(3600000);

    expect(agent.kill).toHaveBeenCalled();
    expect(cleaned).toBe(1);
  });
});
