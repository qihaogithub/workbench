import { AgentConfig, AgentType } from './types';
import { BaseAgent } from './agent';

export type AgentCreator = (config: AgentConfig) => BaseAgent;

export interface IAgentFactory {
  register(type: AgentType, creator: AgentCreator): void;
  create(config: AgentConfig): BaseAgent;
  has(type: AgentType): boolean;
  getRegisteredTypes(): AgentType[];
}

export class AgentFactory implements IAgentFactory {
  private creators: Map<AgentType, AgentCreator> = new Map();

  register(type: AgentType, creator: AgentCreator): void {
    if (this.creators.has(type)) {
      throw new Error(`Agent type "${type}" already registered`);
    }
    this.creators.set(type, creator);
  }

  create(config: AgentConfig): BaseAgent {
    const type: AgentType = "pi-agent";
    const creator = this.creators.get(type);

    if (!creator) {
      throw new Error(`Unknown agent type: ${type}`);
    }

    return creator(config);
  }

  has(type: AgentType): boolean {
    return this.creators.has(type);
  }

  getRegisteredTypes(): AgentType[] {
    return Array.from(this.creators.keys());
  }
}

let globalFactory: AgentFactory | null = null;

export function getAgentFactory(): AgentFactory {
  if (!globalFactory) {
    globalFactory = new AgentFactory();
  }
  return globalFactory;
}
