
那些对勾状态感觉还是冗余，没有官方演示的图标简洁，调用工具也没有官方演示那样一个图标加文字好，比如读文件，既可以是一个眼镜图标加文件名，不需要“调用工具：read”这几个字，也不需要输入{}。
信息顺序还是有点问题，“我将去除banner图相关的代码。”这句话似乎是AI最开始说的，放到底部感觉不对。

### 🔍 问题诊断

1. **信息顺序错乱（先说的字跑到了最后面）**
   * **原因**：在之前的代码中，我们把所有 `type === "text"` 的节点强行 `filter` 出来，并在最底部通过 `.join("\n\n")` 统一渲染。这就导致了如果 AI 是先说“我将去除 banner图…”，再去调用工具，这句话也会被强行拽到所有消息的最底部。
   * **解法**：废弃 `filter` 的做法，改为**按时间线分组（Chronological Grouping）**。遇到纯文本就直接渲染，遇到“思考/工具”就把它们打包放进 `<ChainOfThought>` 块里。这样自然会形成 `文本 -> 过程折叠面板 -> 文本` 的正确流。
2. **对勾状态冗余，不够官方**
   * **原因**：您使用的 `<ChainOfThoughtStep>` 默认带有时间线竖线和绿色的对勾图标。而官方 Vercel AI SDK 的思维链设计中，**思考过程就是一段普通的灰色段落字，工具调用就是一个普通的小图标**，根本没有复杂的步骤连线和绿勾。
   * **解法**：抛弃 `<ChainOfThoughtStep>` 组件，直接用原生的 `div` 和 `Lucide Icons` 排版。
3. **“调用工具：read”太生硬，不需要输入 `{}`**
   * **原因**：之前是暴力显示工具名和序列化后的 JSON。
   * **解法**：加入一段小逻辑，把 `read` 映射为“读取文件”、把 `edit` 映射为“修改文件”，并配上对应的 `Eye` (眼镜) 或 `Edit3` 图标；直接删除展示 JSON 的 DOM 结构。

---

### 🛠️ 终极修复方案

请将您的 **`assistant-message.txt`** 整个替换为以下代码。这份代码实现了**时间线分组流式渲染**，并且采用了极致干净的官方视觉风格：

```tsx
"use client";

import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Streamdown } from "streamdown";
// 引入更多贴合语义的极简图标
import { Loader2, Check, Copy, Eye, Terminal, Edit3, Wrench, Search } from "lucide-react";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
} from "./chain-of-thought";

interface MessagePart {
  type: "text" | "reasoning" | "tool" | "image" | "file";
  content?: string;
  toolCallId?: string;
  toolName?: string;
  status?: "running" | "completed" | "error" | "awaiting-approval";
  parameters?: Record<string, unknown>;
  result?: unknown;
  duration?: number;
  timestamp?: number;
}

interface AssistantMessageProps {
  content?: string;
  parts?: MessagePart[];
  isStreaming?: boolean;
  className?: string;
}

// 渲染块定义：文本块 或 过程块(包含多个连续的思考和工具)
type RenderBlock = 
  | { type: "text"; content: string }
  | { type: "process"; parts: MessagePart[] };

export function AssistantMessage({
  content,
  parts,
  isStreaming = false,
  className,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const[chainOpen, setChainOpen] = useState(isStreaming);

  useEffect(() => {
    setChainOpen(isStreaming);
  },[isStreaming]);

  const normalizedParts: MessagePart[] = parts ? [...parts] :[];

  if (normalizedParts.length === 0 && content) {
    normalizedParts.push({ type: "text", content });
  }

  // 1. 核心修复：按时间线分组连续的块（保持 AI 说话和做事的先后顺序）
  const renderBlocks: RenderBlock[] = [];
  let currentProcessGroup: MessagePart[] =[];

  normalizedParts.forEach((part) => {
    if (part.type === "reasoning" || part.type === "tool") {
      currentProcessGroup.push(part);
    } else if (part.type === "text") {
      // 遇到文本时，先把前面积累的过程块推入数组
      if (currentProcessGroup.length > 0) {
        renderBlocks.push({ type: "process", parts: currentProcessGroup });
        currentProcessGroup =[];
      }
      // 再推入当前的文本块
      if (part.content?.trim()) {
        renderBlocks.push({ type: "text", content: part.content });
      }
    }
  });
  // 收尾：如果最后全是过程，推入最后一个过程块
  if (currentProcessGroup.length > 0) {
    renderBlocks.push({ type: "process", parts: currentProcessGroup });
  }

  // 如果什么都没有，显示初始加载状态
  if (renderBlocks.length === 0) {
    if (!isStreaming) return null;
    return (
      <div className={cn("flex flex-col gap-4 w-full py-2", className)}>
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 text-violet-500 animate-spin" />
          <span className="text-sm text-muted-foreground">思考中...</span>
        </div>
      </div>
    );
  }

  // 获取所有纯文本用于一键复制
  const allTextContent = renderBlocks
    .filter((b) => b.type === "text")
    .map((b) => b.content)
    .join("\n\n");

  const handleCopy = async () => {
    if (allTextContent) {
      await navigator.clipboard.writeText(allTextContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={cn("flex flex-col gap-3 w-full group relative py-1", className)}>
      {renderBlocks.map((block, index) => {
        
        // 渲染纯文本内容（现在它会老老实实呆在正确的时间线位置了）
        if (block.type === "text") {
          return (
            <div key={`text-${index}`} className="prose prose-sm dark:prose-invert max-w-none">
              <Streamdown className="[&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:whitespace-pre-wrap[&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
                {block.content}
              </Streamdown>
            </div>
          );
        }

        // 渲染中间过程（取代旧的 ChainOfThoughtStep，直接用原生 DIV）
        if (block.type === "process") {
          return (
            <ChainOfThought key={`process-${index}`} open={chainOpen} onOpenChange={setChainOpen}>
              <ChainOfThoughtHeader>
                {isStreaming && index === renderBlocks.length - 1 ? "处理中..." : "处理过程"}
              </ChainOfThoughtHeader>
              
              <ChainOfThoughtContent>
                <div className="flex flex-col gap-3 py-1">
                  {block.parts.map((part, pIndex) => {
                    
                    // 2. 官方风格的思考呈现：直接是普通的灰色小字，没有前面的绿勾和圆圈
                    if (part.type === "reasoning") {
                      return (
                        <div key={pIndex} className="text-[13px] text-muted-foreground leading-relaxed">
                          <Streamdown>{part.content || ""}</Streamdown>
                        </div>
                      );
                    }

                    // 3. 官方风格的工具呈现：一个图标 + 简短的动作描述，没有乱七八糟的 JSON
                    if (part.type === "tool") {
                      const name = (part.toolName || "").toLowerCase();
                      const path = (part.parameters?.path || part.parameters?.file_path) as string;
                      
                      // 智能映射图标与文案
                      let ToolIcon = Wrench;
                      let actionText = part.toolName || "未知操作";

                      if (name.includes("read")) {
                        ToolIcon = Eye; // 读文件用眼镜图标
                        actionText = path ? `读取 ${path}` : "读取文件";
                      } else if (name.includes("edit") || name.includes("write")) {
                        ToolIcon = Edit3; // 写文件用编辑图标
                        actionText = path ? `修改 ${path}` : "修改文件";
                      } else if (name.includes("execute") || name.includes("cmd") || name.includes("terminal")) {
                        ToolIcon = Terminal; // 命令用终端图标
                        actionText = "执行命令";
                      } else if (name.includes("search")) {
                        ToolIcon = Search; // 搜索用放大镜
                        actionText = "搜索资料";
                      }

                      return (
                        <div key={pIndex} className="flex items-center gap-2.5 text-[13px] font-medium text-foreground/90 my-0.5">
                          <ToolIcon className="h-4 w-4 text-muted-foreground/80" />
                          <span>{actionText}</span>
                          {/* 如果正在运行，跟一个加载圈 */}
                          {part.status === "running" && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </ChainOfThoughtContent>
            </ChainOfThought>
          );
        }
        return null;
      })}

      {/* 消息的整体操作按钮 (只在鼠标 Hover 时显示) */}
      {allTextContent && (
        <div className="absolute -bottom-8 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 z-10 bg-background/80 backdrop-blur rounded p-1 shadow-sm">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded transition-colors"
          >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      )}
    </div>
  );
}
```

### ✨ 修改后的视觉体验升级点：
1. **彻底解决了倒装句问题**：您的提示“我将去除 banner...”现在会正常出现在卡片**顶部**，然后中间穿插着可以折叠的 `<ChainOfThought>`，最后如果 AI 还有结束语（比如“已完成...”）则会出现在折叠面板的**底部**。
2. **抛弃了累赘的 Steps 组件**：没有绿勾、没有竖线，思考过程看起来就像一段自然的文字自言自语。
3. **引入了语义化的工具呈现**：自动通过 `includes('read')` 拦截原始事件名，将冷冰冰的 `read` 替换成了一对可爱的**眼镜图标** (Lucide `Eye`) 加上实际的文件名；同时**彻底删除了渲染参数的块**，实现了极致干净！
