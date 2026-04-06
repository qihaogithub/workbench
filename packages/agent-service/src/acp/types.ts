export const JSONRPC_VERSION = '2.0' as const;

export interface AcpRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface AcpResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface AcpNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export type AcpMessage = AcpRequest | AcpResponse | AcpNotification;

export interface AcpSessionUpdate {
  sessionId: string;
  update: {
    sessionUpdate:
      | 'agent_message_chunk'
      | 'agent_thought_chunk'
      | 'tool_call'
      | 'tool_call_update'
      | 'plan'
      | 'available_commands_update'
      | 'user_message_chunk'
      | 'config_option_update'
      | 'usage_update';
    content?: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
    };
    toolCallId?: string;
    status?: string;
    title?: string;
    kind?: string;
    [key: string]: unknown;
  };
}

export interface AcpPermissionRequest {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  toolCall: {
    toolCallId: string;
    rawInput?: Record<string, unknown>;
    status?: string;
    title?: string;
    kind?: string;
  };
}

export interface AcpInitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  agentInfo?: {
    name?: string;
    version?: string;
  };
}

export interface AcpSessionNewParams {
  cwd?: string;
  model?: string;
  [key: string]: unknown;
}

export interface AcpSessionConfigOption {
  id: string;
  name?: string;
  label?: string;
  type: 'select' | 'boolean' | 'string';
  category?: string;
  currentValue?: string;
  selectedValue?: string;
  options?: Array<{ value: string; name?: string; label?: string }>;
}

export interface AcpSessionModels {
  currentModelId?: string;
  availableModels?: Array<{ id?: string; modelId?: string; name?: string }>;
}

export interface AcpSessionNewResult {
  sessionId: string;
  configOptions?: AcpSessionConfigOption[];
  models?: AcpSessionModels;
}

export interface AcpPromptParams {
  sessionId: string;
  prompt: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
}

export interface AcpPromptResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface AcpBackendConfig {
  id: string;
  name: string;
  cliCommand: string;
  defaultCliPath?: string;
  acpArgs: string[];
  env?: Record<string, string>;
  authRequired?: boolean;
  enabled?: boolean;
  skillsDirs?: string[];
}

export type AcpBackend = 'opencode' | 'claude' | 'codex' | 'gemini' | 'qwen' | 'goose' | 'auggie' | 'kimi' | 'copilot' | 'qoder' | 'vibe' | 'custom';

export const ACP_BACKENDS: Record<AcpBackend, AcpBackendConfig> = {
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    cliCommand: 'opencode',
    acpArgs: ['acp'],
    authRequired: false,
    enabled: true,
  },
  claude: {
    id: 'claude',
    name: 'Claude Code',
    cliCommand: 'claude',
    acpArgs: ['--experimental-acp'],
    authRequired: true,
    enabled: true,
    skillsDirs: ['.claude/skills'],
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    cliCommand: 'codex',
    defaultCliPath: 'npx @zed-industries/codex-acp@0.9.5',
    acpArgs: [],
    authRequired: true,
    enabled: true,
    skillsDirs: ['.codex/skills'],
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    cliCommand: 'gemini',
    acpArgs: ['--experimental-acp'],
    authRequired: true,
    enabled: true,
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    acpArgs: ['--acp'],
    authRequired: true,
    enabled: true,
    skillsDirs: ['.qwen/skills'],
  },
  goose: {
    id: 'goose',
    name: 'Goose',
    cliCommand: 'goose',
    acpArgs: ['acp'],
    authRequired: false,
    enabled: true,
    skillsDirs: ['.goose/skills'],
  },
  auggie: {
    id: 'auggie',
    name: 'Augment Code',
    cliCommand: 'auggie',
    acpArgs: ['--acp'],
    authRequired: false,
    enabled: true,
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi CLI',
    cliCommand: 'kimi',
    acpArgs: ['acp'],
    authRequired: false,
    enabled: true,
    skillsDirs: ['.kimi/skills'],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    cliCommand: 'copilot',
    acpArgs: ['--acp', '--stdio'],
    authRequired: false,
    enabled: true,
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder CLI',
    cliCommand: 'qodercli',
    acpArgs: ['--acp'],
    authRequired: false,
    enabled: true,
  },
  vibe: {
    id: 'vibe',
    name: 'Mistral Vibe',
    cliCommand: 'vibe-acp',
    acpArgs: [],
    authRequired: false,
    enabled: true,
    skillsDirs: ['.vibe/skills'],
  },
  custom: {
    id: 'custom',
    name: 'Custom Agent',
    cliCommand: '',
    acpArgs: [],
    authRequired: false,
    enabled: true,
  },
};

export const ACP_METHODS = {
  INITIALIZE: 'initialize',
  AUTHENTICATE: 'authenticate',
  SESSION_NEW: 'session/new',
  SESSION_LOAD: 'session/load',
  SESSION_PROMPT: 'session/prompt',
  SESSION_CANCEL: 'session/cancel',
  SESSION_UPDATE: 'session/update',
  REQUEST_PERMISSION: 'session/request_permission',
  SET_CONFIG_OPTION: 'session/set_config_option',
  SET_MODEL: 'session/set_model',
  SET_MODE: 'session/set_mode',
  READ_TEXT_FILE: 'fs/read_text_file',
  WRITE_TEXT_FILE: 'fs/write_text_file',
} as const;
