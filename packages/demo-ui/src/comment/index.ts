/**
 * 评论功能 UI 组件导出入口
 */
export { CommentLayer } from "./CommentLayer";
export { CommentPin } from "./CommentPin";
export { CommentThreadPopover } from "./CommentThreadPopover";
export { CommentCreatePopover } from "./CommentCreatePopover";
export {
  MentionPicker,
  MentionTextarea,
  MentionContent,
} from "./MentionPicker";
export { CommentSidebar } from "./CommentSidebar";
export { CommentPanel } from "./CommentPanel";
export { DocumentCommentPanel } from "./DocumentCommentPanel";
export { CommentUnreadDot } from "./CommentUnreadDot";
export { useComments, threadMentionsUser } from "./useComments";
export {
  countUnresolvedCommentThreads,
  countUnresolvedCommentThreadsByPage,
  filterCommentThreadsByTarget,
  filterPageCommentThreads,
} from "./comment-thread-scope";
export type {
  CommentApiAdapter,
  CommentFilter,
  CommentLayerProps,
  CanvasCommentDraft,
  CreateCommentInput,
  AddReplyInput,
  UpdateCommentContentInput,
  IframeViewState,
  MentionCandidate,
} from "./types";
export type { CommentPinProps } from "./CommentPin";
export type { CommentThreadPopoverProps } from "./CommentThreadPopover";
export type { CommentCreatePopoverProps } from "./CommentCreatePopover";
export type {
  MentionPickerProps,
  MentionTextareaProps,
  MentionContentProps,
} from "./MentionPicker";
export type { CommentPageMeta, CommentSidebarProps } from "./CommentSidebar";
export type { CommentPanelProps } from "./CommentPanel";
export type { DocumentCommentPanelProps } from "./DocumentCommentPanel";
export type { CommentUnreadDotProps } from "./CommentUnreadDot";
export type { UseCommentsOptions, UseCommentsResult } from "./useComments";
