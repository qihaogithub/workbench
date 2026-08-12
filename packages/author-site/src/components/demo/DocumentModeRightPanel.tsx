"use client";

import { useEffect, useState } from "react";
import { Layers, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommentPanel, type CommentPanelProps } from "@workbench/demo-ui";
import { cn } from "@/lib/utils";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";
import { DesignSpecConfigPanel } from "./DesignSpecConfigPanel";

/**
 * 文档视图右侧栏：素材 + 评论 页签切换。
 * 仅当选中设计规范文档时出现「素材」页签（配置项素材池），与「评论」tab 切换。
 */
export function DocumentModeRightPanel({
  unresolvedCount = 0,
  ...commentProps
}: CommentPanelProps & { unresolvedCount?: number }) {
  const { activeDocId } = useDesignSpecWorkspace();
  const [tab, setTab] = useState<"assets" | "comments">("comments");

  // 选中设计规范时默认切到素材栏
  useEffect(() => {
    if (activeDocId) setTab("assets");
  }, [activeDocId]);

  if (!activeDocId) {
    return <CommentPanel {...commentProps} />;
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "assets" | "comments")}
      className="flex h-full flex-col"
    >
      <TabsList className="w-full justify-start gap-2 rounded-none border-b px-2 h-12 bg-transparent">
        <TabsTrigger
          value="assets"
          title="配置项"
          className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
        >
          <Layers className="h-4 w-4" />
          {tab === "assets" && <span>配置项</span>}
        </TabsTrigger>
        <TabsTrigger
          value="comments"
          title="评论"
          className="gap-2 px-2 data-[state=inactive]:w-9 data-[state=inactive]:px-0"
        >
          <MessageSquare className="h-4 w-4" />
          {tab === "comments" && <span>评论</span>}
          {unresolvedCount > 0 && (
            <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-semibold text-white">
              {unresolvedCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="assets"
        className={cn(
          "flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden",
        )}
      >
        <DesignSpecConfigPanel />
      </TabsContent>
      <TabsContent
        value="comments"
        className={cn(
          "flex-1 flex flex-col mt-0 min-h-0 data-[state=inactive]:hidden",
        )}
      >
        <CommentPanel {...commentProps} />
      </TabsContent>
    </Tabs>
  );
}