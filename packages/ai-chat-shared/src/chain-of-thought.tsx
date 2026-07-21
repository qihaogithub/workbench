"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "./lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import { Badge } from "./ui/badge";
import { ChevronDown, Loader2, Check, Circle, Sparkles } from "lucide-react";

type StepStatus = "pending" | "active" | "complete";

interface ChainOfThoughtContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totalSteps: number;
  registerStep: () => number;
}

const ChainOfThoughtContext = React.createContext<
  ChainOfThoughtContextValue | undefined
>(undefined);

function useChainOfThought() {
  const context = React.useContext(ChainOfThoughtContext);
  if (!context) {
    throw new Error(
      "useChainOfThought must be used within a ChainOfThought component",
    );
  }
  return context;
}

interface ChainOfThoughtProps extends React.ComponentProps<typeof Collapsible> {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ChainOfThought({
  children,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ChainOfThoughtProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const [totalSteps, setTotalSteps] = React.useState(0);
  const stepCounterRef = React.useRef(0);

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      onOpenChange?.(newOpen);
    },
    [onOpenChange],
  );

  const registerStep = React.useCallback(() => {
    stepCounterRef.current += 1;
    setTotalSteps(stepCounterRef.current);
    return stepCounterRef.current;
  }, []);

  // Reset step counter when children change
  React.useEffect(() => {
    stepCounterRef.current = 0;
    setTotalSteps(0);
  }, [children]);

  return (
    <ChainOfThoughtContext.Provider
      value={{ open, onOpenChange: handleOpenChange, totalSteps, registerStep }}
    >
      <Collapsible
        open={open}
        onOpenChange={handleOpenChange}
        className="w-full"
        {...props}
      >
        {children}
      </Collapsible>
    </ChainOfThoughtContext.Provider>
  );
}

interface ChainOfThoughtHeaderProps extends React.ComponentProps<
  typeof CollapsibleTrigger
> {
  children?: React.ReactNode;
  stepCount?: number;
  completedCount?: number;
}

function ChainOfThoughtHeader({
  children,
  stepCount,
  completedCount,
  className,
  ...props
}: ChainOfThoughtHeaderProps) {
  const { open } = useChainOfThought();

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between py-2 text-sm transition-colors rounded-lg group",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-foreground">
          {children ||
            (stepCount !== undefined && completedCount !== undefined
              ? `${completedCount}/${stepCount} steps`
              : "Thought")}
        </span>
      </div>
      <ChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200",
          open && "rotate-180",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ChainOfThoughtContent({
  children,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      className={cn(
        "overflow-hidden transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className,
      )}
      {...props}
    >
      <div className="pb-3 max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
        {children}
      </div>
    </CollapsibleContent>
  );
}

interface ChainOfThoughtStepProps extends Omit<
  React.ComponentProps<"div">,
  "title"
> {
  status?: StepStatus;
  icon?: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  description?: React.ReactNode;
}

function ChainOfThoughtStep({
  status = "pending",
  icon: Icon,
  title,
  description,
  children,
  className,
  ...props
}: ChainOfThoughtStepProps) {
  const { totalSteps, registerStep } = useChainOfThought();
  const [stepIndex, setStepIndex] = React.useState<number | null>(null);
  const StatusIcon =
    Icon ||
    (status === "complete" ? Check : status === "active" ? Circle : Circle);

  React.useEffect(() => {
    const index = registerStep();
    setStepIndex(index);
  }, [registerStep]);

  const isLastStep = stepIndex !== null && stepIndex === totalSteps;

  return (
    <div className={cn("flex gap-3", className)} {...props}>
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full border",
            status === "complete" &&
              "border-green-500/50 bg-green-500/10 text-green-500",
            status === "active" &&
              "border-violet-500/50 bg-violet-500/10 text-violet-500",
            status === "pending" &&
              "border-muted-foreground/30 text-muted-foreground",
          )}
        >
          <StatusIcon className="h-3 w-3" />
        </div>
        {/* 连接线 - 最后一个步骤不显示 */}
        {!isLastStep && (
          <div className="w-px flex-1 bg-border mt-1 min-h-[16px]" />
        )}
      </div>
      <div className={cn("flex-1", !isLastStep && "pb-4")}>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm",
              status === "pending"
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {title}
          </span>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}

interface SearchResult {
  title: string;
  url?: string;
  snippet?: string;
}

interface ChainOfThoughtSearchResultsProps extends React.ComponentProps<"div"> {
  searchResults?: SearchResult[];
}

function ChainOfThoughtSearchResults({
  searchResults,
  children,
  className,
  ...props
}: ChainOfThoughtSearchResultsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2 mt-2", className)} {...props}>
      {searchResults?.map((result, index) => (
        <ChainOfThoughtSearchResult
          key={index}
          title={result.title}
          url={result.url}
        />
      ))}
      {children}
    </div>
  );
}

interface ChainOfThoughtSearchResultProps extends React.ComponentProps<
  typeof Badge
> {
  title: string;
  url?: string;
}

function ChainOfThoughtSearchResult({
  title,
  url,
  className,
  ...props
}: ChainOfThoughtSearchResultProps) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "cursor-pointer hover:bg-muted transition-colors text-xs",
        className,
      )}
      {...props}
    >
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          {title}
        </a>
      ) : (
        title
      )}
    </Badge>
  );
}

interface ChainOfThoughtImageProps extends React.ComponentProps<"div"> {
  src: string;
  alt?: string;
  caption?: string;
}

function ChainOfThoughtImage({
  src,
  alt,
  caption,
  className,
  ...props
}: ChainOfThoughtImageProps) {
  return (
    <div className={cn("mt-2", className)} {...props}>
      <div className="relative rounded-lg border border-muted overflow-hidden max-w-full">
        <Image
          src={src}
          alt={alt || caption || "Chain of thought image"}
          width={0}
          height={0}
          sizes="100%"
          className="w-full h-auto"
        />
      </div>
      {caption && (
        <p className="text-xs text-muted-foreground mt-1">{caption}</p>
      )}
    </div>
  );
}

export {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
  ChainOfThoughtImage,
  type StepStatus,
  type SearchResult,
};
