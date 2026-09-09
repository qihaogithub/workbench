/**
 * 评论 UI 组件共享类型定义
 *
 * CommentLayer 等组件通过 CommentApiAdapter 与宿主（viewer-site / author-site）
 * 的 REST API 解耦：宿主负责实现具体的请求逻辑（跨域 token、cookie 等），
 * demo-ui 只消费数据。
 */
import type { ReactNode } from "react";
import type {
  CommentAnchor,
  CommentAuthor,
  CommentMention,
  CommentReply,
  CommentThread,
  CommentTarget,
  DocumentCommentAnchor,
} from "@workbench/shared";
import type { CanvasViewportState } from "../types";

/** @提及候选人 */
export interface MentionCandidate {
  id: string;
  name: string;
  type: "user" | "agent";
}

/** 创建评论线程的输入 */
export interface CreateCommentInput {
  target: CommentTarget;
  content: string;
  anchor?: CommentAnchor;
  pin?: { xRatio: number; yRatio: number };
  documentAnchor?: DocumentCommentAnchor;
  mentions?: CommentMention[];
}

/** 画布页面上的评论创建草稿：保存页面级锚点和点击位置。 */
export interface CanvasCommentDraft {
  input: Omit<CreateCommentInput, "content" | "mentions">;
  clientX: number;
  clientY: number;
}

/** 添加回复的输入 */
export interface AddReplyInput {
  content: string;
  mentions?: CommentMention[];
}

/** 编辑评论或回复时可更新的内容。 */
export interface UpdateCommentContentInput {
  content: string;
  mentions?: CommentMention[];
}

/** 评论图片上传结果。正文中只保存返回的 canonical URL。 */
export interface CommentImageUploadResult {
  url: string;
  kind: "image";
  filename?: string;
}

export type CommentImageUploadHandler = (
  file: File,
) => Promise<CommentImageUploadResult>;

/** 配置项批注浮窗的数据与写入能力；浏览端只提供 threads 并将 readOnly 设为 true。 */
export interface ConfigCommentController {
  threads: CommentThread[];
  currentUser?: CommentAuthor | null;
  /** 评论图片上传能力；浏览端只读时可省略。 */
  uploadCommentImage?: CommentImageUploadHandler;
  /** 将 canonical /api/images 地址解析到数据源 origin。 */
  mediaBaseUrl?: string;
  mentionCandidates?: MentionCandidate[];
  canMentionAgent?: boolean;
  readOnly?: boolean;
  onCreateComment?: (input: CreateCommentInput) => Promise<unknown>;
  onAddReply?: (threadId: string, input: AddReplyInput) => Promise<unknown>;
  onUpdateComment?: (
    threadId: string,
    input: UpdateCommentContentInput,
  ) => Promise<unknown>;
  onUpdateReply?: (
    threadId: string,
    replyId: string,
    input: UpdateCommentContentInput,
  ) => Promise<unknown>;
  onSetResolved?: (threadId: string, resolved: boolean) => Promise<unknown>;
  onDeleteThread?: (threadId: string) => Promise<unknown>;
  onDeleteReply?: (threadId: string, replyId: string) => Promise<unknown>;
}

/**
 * 评论 REST API 适配器。
 * 由宿主（viewer-site / author-site）实现，屏蔽鉴权与跨域细节。
 */
export interface CommentApiAdapter {
  /** 列出评论线程（可按页面、文档或配置项目标过滤） */
  listComments(target?: CommentTarget): Promise<CommentThread[]>;
  /** 创建评论线程 */
  createComment(input: CreateCommentInput): Promise<CommentThread>;
  /** 添加回复 */
  addReply(threadId: string, input: AddReplyInput): Promise<CommentReply>;
  /** 编辑主评论 */
  updateComment(threadId: string, input: UpdateCommentContentInput): Promise<CommentThread>;
  /** 编辑回复 */
  updateReply(threadId: string, replyId: string, input: UpdateCommentContentInput): Promise<CommentReply>;
  /** 标记解决 / 重新打开 */
  setResolved(threadId: string, resolved: boolean): Promise<void>;
  /** 删除线程 */
  deleteThread(threadId: string): Promise<void>;
  /** 删除回复 */
  deleteReply(threadId: string, replyId: string): Promise<void>;
  /** 上传评论图片并返回 canonical 图片地址。 */
  uploadCommentImage: CommentImageUploadHandler;
  /** @AI 任务失败后重试（重新入队） */
  retryAiTask?(threadId: string): Promise<void>;
  /** @候选人列表（浏览端为访问者；创作端可含 AI） */
  listMentionCandidates(): Promise<MentionCandidate[]>;
}

/** 评论列表筛选模式 */
export type CommentFilter = "all" | "mentionsMe" | "unresolved";

/** CommentLayer 组件 props */
export interface CommentLayerProps {
  projectId: string;
  pageId: string;
  /** REST API 适配器（宿主实现） */
  api: CommentApiAdapter;
  /** agent-service WebSocket 地址（如 ws://localhost:4201/ws/comments），不传则不做实时刷新 */
  wsUrl?: string;
  /** 当前用户；null 表示匿名（浏览端未登录） */
  currentUser: CommentAuthor | null;
  /** 是否允许 @AI（创作端 true，浏览端 false） */
  canMentionAgent?: boolean;
  /** 静态 @候选人；不传则通过 api.listMentionCandidates 拉取 */
  mentionCandidates?: MentionCandidate[];
  /** 被包裹的预览区域（PreviewStage） */
  children: ReactNode;
  /** 禁用评论（如画布模式） */
  disabled?: boolean;
  /** 是否显示内置评论模式切换按钮，默认 true */
  showToggle?: boolean;
  /** 是否显示评论侧栏，默认 false */
  showSidebar?: boolean;
  className?: string;

  /* ---- 受控模式：评论状态由宿主管理（如右侧栏 tab 集成） ---- */

  /** 受控评论模式；传入后由宿主控制评论模式开关 */
  commentMode?: boolean;
  /** 评论模式变化回调（受控时必填） */
  onCommentModeChange?: (active: boolean) => void;
  /** 受控当前打开的线程 ID；传入后由宿主控制线程面板开关 */
  activeThreadId?: string | null;
  /** 活动线程变化回调（受控时必填） */
  onActiveThreadChange?: (threadId: string | null) => void;

  /* ---- 外部数据模式：线程数据由宿主统一管理 ---- */

  /** 外部管理的线程列表；传入后不再使用内部 useComments 拉取 */
  threads?: CommentThread[];
  /** 外部创建评论（配合 threads 使用） */
  onCreateComment?: (input: CreateCommentInput) => Promise<CommentThread>;
  /** 外部添加回复 */
  onAddReply?: (threadId: string, input: AddReplyInput) => Promise<CommentReply>;
  /** 外部编辑主评论 */
  onUpdateComment?: (threadId: string, input: UpdateCommentContentInput) => Promise<CommentThread>;
  /** 外部编辑回复 */
  onUpdateReply?: (threadId: string, replyId: string, input: UpdateCommentContentInput) => Promise<CommentReply>;
  /** 外部设置解决状态 */
  onSetResolved?: (threadId: string, resolved: boolean) => Promise<void>;
  /** 外部删除线程 */
  onDeleteThread?: (threadId: string) => Promise<void>;
  /** 外部删除回复 */
  onDeleteReply?: (threadId: string, replyId: string) => Promise<void>;
  /** @AI 失败后重试（重新入队） */
  onRetryAiTask?: (threadId: string) => Promise<void>;
  /** 是否显示预览区评论标记，默认 true。 */
  showPins?: boolean;
  /** 外部数据模式下覆盖 API 适配器的图片上传实现。 */
  uploadCommentImage?: CommentImageUploadHandler;
  /** 评论媒体地址前缀（viewer 跨 origin 时使用）。 */
  mediaBaseUrl?: string;
  /** 由画布页面点击发起的创建草稿；输入框仍由本层在点击位置显示。 */
  canvasCreateDraft?: CanvasCommentDraft | null;
  onCanvasCreateDraftChange?: (draft: CanvasCommentDraft | null) => void;
  /** 画布当前视口；传入后评论标记与浮窗按变换后的页面矩形重新定位。 */
  canvasViewport?: CanvasViewportState;
}

/** 评论创建/定位所需的 iframe 视图状态 */
export interface IframeViewState {
  scrollX: number;
  scrollY: number;
  docWidth: number;
  docHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}
