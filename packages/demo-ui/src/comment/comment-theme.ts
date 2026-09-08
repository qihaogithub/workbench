import type { CommentAuthor } from "@workbench/shared";

/** 评论视觉基元：页面图钉、线程浮窗、配置批注和侧栏共用。 */
export const COMMENT_VISUAL_TOKENS = {
  card: "border bg-[#292929] border-[#4e4e4e] text-[#f5f5f5] shadow-[0_12px_30px_rgba(0,0,0,.55)]",
  input: "rounded-xl border-[#5b5b5b] bg-[#3a3a3a]",
  focus: "focus-within:border-[#6fc2ff] focus-within:ring-1 focus-within:ring-[#6fc2ff]/70",
  accent: "#70bfff",
  resolved: "#8b8b8b",
} as const;

export const COMMENT_AVATAR_COLORS = [
  "#ff3d24",
  "#ff1ba0",
  "#8d6bff",
  "#18b8b0",
  "#f59e0b",
  "#4fa9ff",
] as const;

export function commentAvatarColor(author: Pick<CommentAuthor, "id" | "name">): string {
  let hash = 0;
  for (const character of author.id || author.name) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return COMMENT_AVATAR_COLORS[Math.abs(hash) % COMMENT_AVATAR_COLORS.length];
}
