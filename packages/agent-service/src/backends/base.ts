import { AgentConfig, AgentEvent, ImageAttachment } from '../core/types';

export type BackendStatus = 'idle' | 'initializing' | 'ready' | 'busy' | 'error';

export interface IBackendAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  sendMessage(content: string, options?: { stream?: boolean; images?: ImageAttachment[] }): Promise<string>;
  onStream(callback: (event: AgentEvent) => void): void;
  getStatus(): Promise<BackendStatus>;
  destroy(): Promise<void>;
  checkHealth(): Promise<boolean>;
  start?(options?: { resumeSessionId?: string }): Promise<void>;
  setModel?(modelId: string): Promise<void>;
  getModelInfo?(): { currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null | Promise<{ currentModelId: string | null; availableModels: Array<{ id: string; label: string }>; canSwitch: boolean } | null>;
  getCurrentSessionId?(): string | null;
  getFiles?(): Array<{ path: string; action: 'created' | 'modified' | 'deleted'; content?: string }>;
  getLastResponseDebug?(): unknown;
  setPromptTimeout?(seconds: number): void;
  cancelPrompt?(): void;
  getWorkingDir?(): string | null;
  /**
   * v3.2: 运行时更新 system prompt（仅静态部分 L2 + L4）
   * 不重建 Agent，保留 messages 历史
   */
  updateSystemPrompt?(newPrompt: string): Promise<void>;
}
