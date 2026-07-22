"use client";

import * as React from "react";
import { cn } from "./lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { ChevronDown, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";

interface ReasoningContextValue {
  isStreaming?: boolean;
  isOpen?: boolean;
  setIsOpen?: (open: boolean) => void;
  duration?: number;
}

const ReasoningContext = React.createContext<ReasoningContextValue | undefined>(
  undefined,
);

function useReasoning() {
  const context = React.useContext(ReasoningContext);
  if (!context) {
    throw new Error("useReasoning must be used within a Reasoning component");
  }
  return context;
}

interface ReasoningProps extends Omit<
  React.ComponentProps<typeof Collapsible>,
  "duration"
> {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  duration?: number;
}

function Reasoning({
  children,
  isStreaming = false,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  duration,
  className,
  ...props
}: ReasoningProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);

  const isOpen = controlledOpen ?? uncontrolledOpen;

  const setIsOpen = React.useCallback(
    (value: boolean) => {
      setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [onOpenChange],
  );

  // 当 isStreaming 变化时，自动展开；思考结束后自动折叠
  React.useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    } else {
      // 思考结束后短暂延迟再折叠，让用户看到结果
      const timer = setTimeout(() => {
        setIsOpen(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, setIsOpen]);

  return (
    <ReasoningContext.Provider
      value={{ isStreaming, isOpen, setIsOpen, duration }}
    >
      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className={cn(
          "w-full min-w-0",
          className,
        )}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

interface ReasoningTriggerProps extends React.ComponentProps<
  typeof CollapsibleTrigger
> {
  getThinkingMessage?: (
    isStreaming: boolean,
    duration?: number,
  ) => React.ReactNode;
}

function ReasoningTrigger({
  getThinkingMessage,
  className,
  children: _children,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();

  const defaultThinkingMessage = (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <Sparkles
        className={cn(
          "h-3 w-3 text-muted-foreground/50 flex-shrink-0",
          isStreaming && "animate-pulse",
        )}
      />
      <span className="text-xs text-muted-foreground/60 truncate">
        {isStreaming
          ? "思考中..."
          : duration
            ? `思考了 ${(duration / 1000).toFixed(0)} 秒`
            : "思考过程"}
      </span>
    </div>
  );

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-1 py-1.5 text-xs transition-colors select-none min-w-0 group/reasoning",
        className,
      )}
      {...props}
    >
      {getThinkingMessage
        ? getThinkingMessage(isStreaming ?? false, duration)
        : defaultThinkingMessage}
      <ChevronDown
        className={cn(
          "h-3 w-3 text-muted-foreground/30 transition-transform duration-200 flex-shrink-0 group-hover/reasoning:text-muted-foreground/50",
          isOpen && "rotate-180",
        )}
      />
    </CollapsibleTrigger>
  );
}

interface ReasoningContentProps extends React.ComponentProps<
  typeof CollapsibleContent
> {
  children: string;
}

function ReasoningContent({
  children,
  className,
  ...props
}: ReasoningContentProps) {
  return (
    <CollapsibleContent
      className={cn(
        "overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className,
      )}
      {...props}
    >
      <div className="pl-4 py-1 border-l border-border/20 ml-[5px] mt-0.5">
        <div className="text-[11px] text-muted-foreground/70 leading-relaxed max-w-full">
          <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
            {children}
          </Streamdown>
        </div>
      </div>
    </CollapsibleContent>
  );
}

interface ReasoningGroupProps {
  reasonings: Array<{
    content: string;
    duration?: number;
    timestamp?: number;
  }>;
  isStreaming?: boolean;
  className?: string;
}

function ReasoningGroup({
  reasonings,
  isStreaming = false,
  className,
}: ReasoningGroupProps) {
  const totalDuration = reasonings[reasonings.length - 1]?.duration;

  return (
    <Reasoning
      isStreaming={isStreaming}
      duration={totalDuration}
      className={className}
    >
      <ReasoningTrigger
        getThinkingMessage={(streaming, duration) => (
          <span>
            {streaming
              ? "思考中..."
              : duration
                ? `思考了 ${Math.round(duration / 1000)} 秒`
                : "思考过程"}
            {" "}({reasonings.length} 阶段)
          </span>
        )}
      />
      {reasonings.map((r, i) => (
        <div key={i}>
          <ReasoningContent>{r.content}</ReasoningContent>
          {i < reasonings.length - 1 && (
            <div className="border-t border-dashed border-border/30 my-2 ml-4" />
          )}
        </div>
      ))}
    </Reasoning>
  );
}

export { Reasoning, ReasoningTrigger, ReasoningContent, useReasoning, ReasoningGroup };

// 别名导出，方便在 ai-chat 中使用
export const ReasoningDisplay = Reasoning;
