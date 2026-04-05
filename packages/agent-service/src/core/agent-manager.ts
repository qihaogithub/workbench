import { AgentConfig, AgentResult, SendMessageOptions } from './types';
import { BaseAgent } from './agent';
import { AgentFactory, getAgentFactory } from './agent-factory';

export interface IAgentManager {
  getOrCreate(sessionId: string, config: AgentConfig): BaseAgent;
  get(sessionId: string): BaseAgent | undefined;
  has(sessionId: string): boolean;
  destroy(sessionId: string): Promise<void>;
  destroyAll(): Promise<void>;
  sendMessage(sessionId: string, content: string, options?: SendMessageOptions): Promise<AgentResult>;
  list(): AgentInfo[];
  count(): number;
}

interface AgentInfo {
  sessionId: string;
  status: string;
  backend: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  workingDir?: string;
}

export class AgentManager implements IAgentManager {
  private agents: Map<string, BaseAgent> = new Map();
  private factory: AgentFactory;

  constructor(factory?: AgentFactory) {
    this.factory = factory || getAgentFactory();
  }

  getOrCreate(sessionId: string, config: AgentConfig): BaseAgent {
    if (this.agents.has(sessionId)) {
      return this.agents.get(sessionId)!;
    }

    const agent = this.factory.create({ ...config, sessionId });
    this.agents.set(sessionId, agent);

    return agent;
  }

  get(sessionId: string): BaseAgent | undefined {
    return this.agents.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.agents.has(sessionId);
  }

  async destroy(sessionId: string): Promise<void> {
    const agent = this.agents.get(sessionId);
    if (agent) {
      await agent.kill();
      this.agents.delete(sessionId);
    }
  }

  async destroyAll(): Promise<void> {
    const promises = Array.from(this.agents.values()).map((agent) => agent.kill());
    await Promise.all(promises);
    this.agents.clear();
  }

  async sendMessage(
    sessionId: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<AgentResult> {
    const agent = this.get(sessionId);
    if (!agent) {
      throw new Error(`Agent not found: ${sessionId}`);
    }

    if (agent.status === 'initializing') {
      await agent.start();
    }

    return agent.sendMessage(content, options);
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values()).map((agent) => agent.getInfo());
  }

  count(): number {
    return this.agents.size;
  }
}

let globalManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!globalManager) {
    globalManager = new AgentManager();
  }
  return globalManager;
}
