import { describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '../../src/core/agent';
import { AgentManager } from '../../src/core/agent-manager';
import type { AgentConfig, AgentResult, SendMessageOptions } from '../../src/core/types';

class FakeAgent extends BaseAgent {
  kill = vi.fn().mockResolvedValue(undefined);

  constructor(config: AgentConfig, status: 'initializing' | 'processing' | 'ready' = 'ready') {
    super(config);
    this._status = status;
  }

  async start(): Promise<void> {
    this._status = 'ready';
  }

  async sendMessage(_content: string, _options?: SendMessageOptions): Promise<AgentResult> {
    return { success: true, content: 'ok' };
  }

  cancel(): void {
    this._status = 'ready';
  }

  updateConfig(config: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setModel = undefined;
  getModelInfo = undefined;
  getCurrentSessionId = undefined;
}

function createFactory(status: 'initializing' | 'processing' | 'ready' = 'ready') {
  const agents: FakeAgent[] = [];
  return {
    agents,
    factory: {
      create(config: AgentConfig) {
        const agent = new FakeAgent(config, status);
        agents.push(agent);
        return agent;
      },
    },
  };
}

describe('AgentManager tool version handling', () => {
  it('rebuilds an idle agent when toolVersion changes', () => {
    const { agents, factory } = createFactory('ready');
    const manager = new AgentManager(factory as any);

    const first = manager.getOrCreate('s1', { sessionId: 's1', toolVersion: 1 });
    const second = manager.getOrCreate('s1', { sessionId: 's1', toolVersion: 2 });

    expect(second).not.toBe(first);
    expect(agents).toHaveLength(2);
    expect(agents[0].kill).toHaveBeenCalledTimes(1);
    expect(second.getConfig().toolVersion).toBe(2);
  });

  it('keeps a processing agent when toolVersion changes', () => {
    const { agents, factory } = createFactory('processing');
    const manager = new AgentManager(factory as any);

    const first = manager.getOrCreate('s1', { sessionId: 's1', toolVersion: 1 });
    const second = manager.getOrCreate('s1', { sessionId: 's1', toolVersion: 2 });

    expect(second).toBe(first);
    expect(agents).toHaveLength(1);
    expect(agents[0].kill).not.toHaveBeenCalled();
    expect(second.getConfig().toolVersion).toBe(1);
  });
});
