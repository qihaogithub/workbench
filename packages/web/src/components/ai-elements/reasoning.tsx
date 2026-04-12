"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
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
      {isStreaming ? (
        <svg
          className="h-3.5 w-3.5 animate-spin text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
            fill="currentColor"
            opacity="0.3"
          />
          <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          className="h-3.5 w-3.5 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
      )}
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
