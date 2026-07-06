import { AgentClient } from '@workbench/agent-client';

import {
  getAgentServiceApiKey,
  getAgentServiceUrl,
} from './runtime-config';

let clientInstance: AgentClient | null = null;

export function getAgentClient(): AgentClient {
  if (!clientInstance) {
    clientInstance = new AgentClient({
      baseUrl: getAgentServiceUrl(),
      apiKey: getAgentServiceApiKey(),
    });
  }
  return clientInstance;
}

export { AgentClient };
export type {
  AgentResult,
  AgentInfo,
  SessionListResponse,
  FileChange,
  SendMessageOptions,
  ApiResponse,
  AgentType,
  AgentStatus,
  ErrorCode,
  StreamEvent,
  ToolCapabilities,
} from '@workbench/agent-client';
