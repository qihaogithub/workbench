export interface CommentUnreadDotProps {
  /** 未解决评论数；为 0 时不渲染。 */
  count: number;
}

/** 评论页签的未解决提示。数字由宿主的无障碍标签提供，不写入视觉布局。 */
export function CommentUnreadDot({ count }: CommentUnreadDotProps) {
  if (count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      data-comment-unread-dot="true"
      className="pointer-events-none absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
    />
  );
}
