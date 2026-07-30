/**
 * 评论功能共享类型定义
 *
 * 评论 = 用户在页面内容上点击添加的带位置上下文的留言线程。
 * 每条评论必然落在某个元素之上（anchor），元素信息仅作位置参考，
 * 不代表评论语义上"针对"该元素。
 */

/** 评论作者身份 */
export interface CommentAuthor {
  /** userId | anonymousId | "agent" */
  id: string;
  name: string;
  isAnonymous: boolean;
  isAgent?: boolean;
}

/** @提及目标 */
export interface CommentMention {
  type: "user" | "agent";
  /** userId 或 "agent" */
  id: string;
  name: string;
}

/** 线程回复 */
export interface CommentReply {
  id: string;
  content: string;
  author: CommentAuthor;
  mentions?: CommentMention[];
  createdAt: number;
}

/** 评论锚点元素快照（创建时捕获，参考信息，可能过期） */
export interface CommentElementSnapshot {
  /** CSS 类名 */
  className?: string;
  /** outerHTML 前 300 字符 */
  outerHtml?: string;
  /** 关键计算样式（color, backgroundColor, fontSize 等） */
  computedStyle?: Record<string, string>;
  /** 属性（src, href, role, aria-label 等） */
  attrs?: Record<string, string>;
  /** 源码定位（高保真页可用） */
  sourceLocation?: {
    file: string;
    line?: number;
    column?: number;
  };
  /** 可编辑能力列表 */
  editCapabilities?: string[];
}

/** 评论锚点：点击位置下方元素的位置上下文 */
export interface CommentAnchor {
  /** 点击位置下方元素的 CSS 选择器路径 */
  domPath: string;
  tagName: string;
  componentName?: string;
  /** 元素文本前 80 字符 */
  textSnippet?: string;
  /** 创建时元素快照（参考信息，可能过期） */
  snapshot?: CommentElementSnapshot;
}

/** @AI 任务状态 */
export type CommentAiTaskStatus = "pending" | "processing" | "done" | "failed";

/** 评论线程 */
export interface CommentThread {
  id: string;
  projectId: string;
  pageId: string;
  /** 必有：评论位置下方元素（位置上下文） */
  anchor: CommentAnchor;
  /** 必有：pin 视觉定位（0~1 归一化坐标） */
  pin: { xRatio: number; yRatio: number };
  content: string;
  author: CommentAuthor;
  mentions?: CommentMention[];
  aiTaskStatus?: CommentAiTaskStatus;
  createdAt: number;
  updatedAt: number;
  resolved: boolean;
  replies: CommentReply[];
}

/** comments.json 文件格式 */
export interface CommentStoreData {
  threads: CommentThread[];
}

/** WebSocket 广播事件 */
export type CommentWsEvent =
  | { type: "comment:created"; thread: CommentThread }
  | { type: "comment:replied"; threadId: string; reply: CommentReply }
  | { type: "comment:resolved"; threadId: string; resolved: boolean }
  | { type: "comment:deleted"; threadId: string }
  | { type: "comment:ai-status"; threadId: string; aiTaskStatus: CommentAiTaskStatus };

/** 项目访问者记录（@候选人来源） */
export interface ProjectVisitor {
  userId: string;
  name: string;
  lastVisitedAt: number;
}

/** visitors.json 文件格式 */
export interface VisitorStoreData {
  visitors: ProjectVisitor[];
}
