import { AgentClient } from '@opencode-workbench/agent-client';

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:3201';

let clientInstance: AgentClient | null = null;

export function getAgentClient(): AgentClient {
  if (!clientInstance) {
    clientInstance = new AgentClient({
      baseUrl: AGENT_SERVICE_URL,
      apiKey: process.env.AGENT_SERVICE_API_KEY,
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
} from '@opencode-workbench/agent-client';
