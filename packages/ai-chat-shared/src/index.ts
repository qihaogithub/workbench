// 宿主配置入口
export {
  configureAiChatShared,
  type AiChatSharedConfig,
  type AuthorContextIntegration,
} from "./config";

// 聊天主组件
export {
  AIChat,
  type AutoRepairTrigger,
  type VisualPropertyAutoSend,
  type TriggerAutoSend,
} from "./ai-chat";

// 流式服务与类型
export {
  StreamService,
  MissingTransactionalDeleteToolsError,
  type PermissionRequest,
  type UserChoiceRequest,
  type UserChoiceResponse,
  type StreamEventHandlers,
  type StreamResult,
} from "./chat/services/stream-service";

// 模型解析工具
export * from "./lib/ai-models";

// 创作端活动视图上下文
export {
  buildActiveViewContextPrefix,
  type ActiveViewContext,
} from "./lib/active-view-context";

// Toast（AIChat 依赖的通知上下文，宿主需在组件树上层挂载 ToastProviderWrapper）
export { ToastProviderWrapper, useToast } from "./ui/toast-provider";

// AI Elements 组件导出
export {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "./conversation";

export {
  Message,
  type ChatMessage,
  type MessagePart,
} from "./message";

export { AssistantMessage } from "./assistant-message";

export {
  PromptInput,
  PromptInputHeader,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputSubmit,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  PromptInputAddImage,
  PromptInputModelSelect,
  PromptInputThinkingDepthSelect,
  usePromptInputAttachments,
  usePromptInput,
  PromptInputContext,
  type PromptInputFile,
  type PromptInputMessage,
} from "./prompt-input";

export {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
  AttachmentContext,
} from "./attachments";

export {
  Reasoning,
  ReasoningDisplay,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningGroup,
} from "./reasoning";

export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
  type StepStatus,
  type SearchResult,
} from "./chain-of-thought";

export {
  Tool,
  ToolCall,
  type ToolEntry,
} from "./tool";

export { Timeline, TimelineItem } from "./timeline";

export { AgentProcessGroup } from "./agent-process-group";

export { PermissionDialog } from "./permission-dialog";

export { UserChoiceCard } from "./user-choice-card";
