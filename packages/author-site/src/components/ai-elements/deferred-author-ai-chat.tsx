"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

type AuthorAIChatComponent =
  typeof import("@/components/ai-elements/author-ai-chat")["AIChat"];
type DeferredAuthorAIChatProps = ComponentProps<AuthorAIChatComponent> & {
  ready: boolean;
};

const AuthorAIChat = dynamic(
  () =>
    import("@/components/ai-elements/author-ai-chat").then(
      (module) => module.AIChat,
    ),
  { ssr: false, loading: () => null },
);

/**
 * Keep the editor route's dynamic manifest independent from AI chat's rich-text
 * graph. The route loads this small boundary first; the heavy chat chunk is only
 * requested after the boundary is actually rendered.
 */
export function DeferredAuthorAIChat({
  ready,
  ...props
}: DeferredAuthorAIChatProps) {
  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
        正在加载项目内容…
      </div>
    );
  }

  return <AuthorAIChat {...props} />;
}
