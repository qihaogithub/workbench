import { AgentConfig, AgentResult, SendMessageOptions } from './types';
import { BaseAgent } from './agent';
import { BackendAgent } from './backend-agent';
import { AgentFactory, getAgentFactory } from './agent-factory';
import { logger } from '../utils/logger';

const DEFAULT_IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export interface IAgentManager {
  getOrCreate(sessionId: string, config: AgentConfig): BaseAgent;
  get(sessionId: string): BaseAgent | undefined;
  has(sessionId: string): boolean;
  destroy(sessionId: string): Promise<void>;
  destroyAll(): Promise<void>;
  sendMessage(sessionId: string, content: string, options?: SendMessageOptions): Promise<AgentResult>;
  list(): AgentInfo[];
  count(): number;
  cleanupIdleAgents(timeoutMs?: number): number;
}

export interface AgentInfo {
  sessionId: string;
  status: string;
  backend: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  workingDir?: string;
  busy?: boolean;
}

export class AgentManager implements IAgentManager {
  private agents: Map<string, BaseAgent> = new Map();
  private factory: AgentFactory;
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(factory?: AgentFactory, private idleTimeoutMs: number = DEFAULT_IDLE_TIMEOUT_MS) {
    this.factory = factory || getAgentFactory();
    this.startIdleCheck();
  }

  private startIdleCheck(): void {
    if (this.idleCheckTimer) clearInterval(this.idleCheckTimer);
    this.idleCheckTimer = setInterval(() => {
      this.cleanupIdleAgents(this.idleTimeoutMs);
    }, 60 * 1000);
    this.idleCheckTimer.unref();
  }

  getOrCreate(sessionId: string, config: AgentConfig): BaseAgent {
    const existingAgent = this.agents.get(sessionId);

    if (existingAgent) {
      if (this.hasConfigChanged(existingAgent, config)) {
        logger.info(
          { sessionId, oldConfig: existingAgent.getConfig(), newConfig: config },
          'Agent config changed, updating',
        );
        existingAgent.updateConfig(config);
      }
      return existingAgent;
    }

    logger.info({ workingDir: config.workingDir }, 'Agent getOrCreate')

    const agent = this.factory.create({ ...config, sessionId });
    this.agents.set(sessionId, agent);

    return agent;
  }

  private hasConfigChanged(agent: BaseAgent, newConfig: AgentConfig): boolean {
    const current = agent.getConfig();
    // 模型变化不再需要重建（可用 harness.setModel() 运行时切换）
    return (
      current.workingDir !== newConfig.workingDir ||
      current.demoId !== newConfig.demoId
    );
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
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    const promises = Array.from(this.agents.values()).map((agent) => agent.kill());
    await Promise.all(promises);
    this.agents.clear();
  }

  async sendMessage(
    sessionId: string,
    content: string,
    options?: SendMessageOptions
  ): Promise<AgentResult> {
    const agent = this.agents.get(sessionId);
    if (!agent) {
      throw new Error(`Agent not found: ${sessionId}`);
    }

    if (agent instanceof BackendAgent && agent.isBusy()) {
      return {
        success: false,
        error: {
          code: 'AGENT_NOT_INITIALIZED',
          message: 'Agent is currently processing a previous message',
          retryable: true,
        },
      };
    }

    if (agent.status === 'initializing') {
      await agent.start();
    }

    return agent.sendMessage(content, options);
  }

  list(): AgentInfo[] {
    return Array.from(this.agents.values()).map((agent) => {
      const info = agent.getInfo();
      return {
        ...info,
        busy: agent instanceof BackendAgent ? agent.isBusy() : false,
      };
    });
  }

  count(): number {
    return this.agents.size;
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.agents.keys());
  }

  cleanupIdleAgents(timeoutMs?: number): number {
    const timeout = timeoutMs ?? this.idleTimeoutMs;
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, agent] of this.agents.entries()) {
      const lastActivity = agent.lastActivityAtPub.getTime();
      const isIdle = (now - lastActivity) > timeout;

      if (isIdle && agent.status !== 'processing') {
        void agent.kill().then(() => {
          this.agents.delete(sessionId);
        });
        cleaned++;
      }
    }

    return cleaned;
  }
}

let globalManager: AgentManager | null = null;

export function getAgentManager(): AgentManager {
  if (!globalManager) {
    globalManager = new AgentManager();
  }
  return globalManager;
}
