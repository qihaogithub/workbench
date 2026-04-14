"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Sparkles } from "lucide-react";
import { Streamdown } from "streamdown";

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

  // 当 isStreaming 变化时，自动展开
  React.useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
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
          "w-full rounded-lg border border-border/50 bg-muted/30",
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
  children,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();

  const defaultThinkingMessage = (
    <div className="flex items-center gap-2">
      <Sparkles
        className={cn(
          "h-3.5 w-3.5 text-muted-foreground",
          isStreaming && "animate-pulse",
        )}
      />
      <span className="text-sm text-muted-foreground">
        {isStreaming
          ? "思考中..."
          : duration
            ? `思考了${(duration / 1000).toFixed(0)}秒钟`
            : "思考过程"}
      </span>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground/50 transition-transform duration-200",
          isOpen && "rotate-180",
        )}
      />
    </div>
  );

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between px-3 py-2.5 text-sm transition-colors rounded-lg hover:bg-muted/50",
        className,
      )}
      {...props}
    >
      {getThinkingMessage
        ? getThinkingMessage(isStreaming ?? false, duration)
        : defaultThinkingMessage}
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
      <div className="px-3 pb-3">
        <div className="text-[13px] text-muted-foreground/90 leading-relaxed">
          <Streamdown>{children}</Streamdown>
        </div>
      </div>
    </CollapsibleContent>
  );
}

export { Reasoning, ReasoningTrigger, ReasoningContent, useReasoning };

// 别名导出，方便在 ai-chat 中使用
export const ReasoningDisplay = Reasoning;
