import { AgentClient } from '@opencode-workbench/agent-client';

// 客户端使用 NEXT_PUBLIC_ 前缀变量（浏览器可访问），服务端使用 AGENT_SERVICE_URL
const AGENT_SERVICE_URL =
  typeof window !== 'undefined'
    ? (process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || 'http://localhost:3201')
    : (process.env.AGENT_SERVICE_URL || 'http://localhost:3201');

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
