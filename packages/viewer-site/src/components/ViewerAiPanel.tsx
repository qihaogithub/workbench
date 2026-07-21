"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { AgentClient } from "@workbench/agent-client";
import {
  AIChat,
  configureAiChatShared,
  ToastProviderWrapper,
} from "@workbench/ai-chat-shared";
import { Button } from "@/components/ui/button";

const agentClient = new AgentClient({
  baseUrl: process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "",
  mode: "viewer-readonly",
});

// 浏览端仅注入 AgentClient；只读系统提示词与上下文由 agent-service 服务端注入
configureAiChatShared({ getAgentClient: () => agentClient });

function createViewerSessionId(projectId: string): string {
  return `viewer-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ViewerAiPanelProps {
  open: boolean;
  projectId: string;
  projectName: string;
  activePageId: string;
  activePageName?: string;
  activeConfig?: Record<string, unknown>;
  onOpenChange: (open: boolean) => void;
}

export function ViewerAiPanel({
  open,
  projectId,
  projectName,
  activePageId,
  activePageName,
  activeConfig,
  onOpenChange,
}: ViewerAiPanelProps) {
  const [sessionId, setSessionId] = useState(() =>
    createViewerSessionId(projectId),
  );
  // 首次打开后再挂载 AIChat，避免未使用 AI 时建立 WebSocket 连接
  const hasOpenedRef = useRef(false);
  if (open) hasOpenedRef.current = true;

  const viewerContext = useMemo(
    () => ({ activePageId, activeConfig }),
    [activePageId, activeConfig],
  );

  const handleNewSession = useCallback(() => {
    const previousSessionId = sessionId;
    setSessionId(createViewerSessionId(projectId));
    // 旧会话兜底销毁（WS 断开时服务端也会自动清理）
    void agentClient.destroySession(previousSessionId).catch(() => {});
  }, [projectId, sessionId]);

  return (
    <aside
      className={`h-full w-[360px] max-w-[42vw] shrink-0 flex-col border-r border-border bg-background ${
        open ? "flex" : "hidden"
      }`}
      aria-hidden={!open}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <MessageCircle className="h-5 w-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-medium leading-tight">AI 问答</div>
          <div className="truncate text-xs text-muted-foreground">
            {projectName}
            {activePageName ? ` / ${activePageName}` : ""}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleNewSession}
          title="新对话"
        >
          <Plus className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onOpenChange(false)}
          title="收起"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {hasOpenedRef.current && (
          <ToastProviderWrapper>
            <AIChat
              key={sessionId}
              mode="viewer-readonly"
              sessionId={sessionId}
              agentSessionId={sessionId}
              projectId={projectId}
              viewerContext={viewerContext}
            />
          </ToastProviderWrapper>
        )}
      </div>
    </aside>
  );
}
