"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import { cn } from "./lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import type { MessagePart } from "./message";
import type { UserChoiceResponse } from "./chat/services/stream-service";
import { ChatCard } from "./chat-card";

type UserChoicePart = Extract<MessagePart, { type: "user_choice" }>;

interface UserChoiceCardProps {
  part: UserChoicePart;
  onRespond?: (requestId: string, choice: UserChoiceResponse) => void;
  compact?: boolean;
}

export function UserChoiceCard({
  part,
  onRespond,
  compact = false,
}: UserChoiceCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    part.selected?.type === "option" ? part.selected.optionId ?? null : null,
  );
  const [customText, setCustomText] = useState(
    part.selected?.type === "custom" ? part.selected.text ?? "" : "",
  );
  const [mode, setMode] = useState<"option" | "custom">(
    part.selected?.type === "custom" ? "custom" : "option",
  );

  const isPending = part.status === "pending";
  const selectedOption = useMemo(
    () => part.options.find((option) => option.optionId === selectedOptionId),
    [part.options, selectedOptionId],
  );
  const canSubmit =
    isPending &&
    (mode === "custom"
      ? customText.trim().length > 0
      : Boolean(selectedOptionId));

  const statusLabel = (() => {
    if (part.status === "answered") return "已选择";
    if (part.status === "cancelled") return "已取消";
    if (part.status === "expired") return "已过期";
    return "等待选择";
  })();

  const answerLabel = (() => {
    if (part.selected?.type === "custom") return part.selected.text;
    if (part.selected?.type === "option") {
      return part.selected.label || selectedOption?.label;
    }
    return undefined;
  })();

  return (
    <ChatCard
      className={cn(
        "bg-background",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium leading-5 text-foreground">
                {part.question}
              </h3>
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px]",
                  isPending
                    ? "bg-blue-500/10 text-blue-600"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {statusLabel}
              </span>
            </div>
            {part.description && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {part.description}
              </p>
            )}
          </div>

          {answerLabel && !isPending && (
            <div className="flex items-start gap-2 rounded-md border border-green-500/20 bg-green-500/5 px-3 py-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
              <span className="min-w-0 break-words text-foreground">
                {answerLabel}
              </span>
            </div>
          )}

          {isPending && (
            <div className="space-y-2">
              <div className="grid gap-2">
                {part.options.map((option) => {
                  const selected =
                    mode === "option" && selectedOptionId === option.optionId;
                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      onClick={() => {
                        setMode("option");
                        setSelectedOptionId(option.optionId);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                        selected
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-border hover:bg-muted/60",
                      )}
                    >
                      {selected ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium leading-5">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="mt-0.5 block break-words text-xs leading-relaxed text-muted-foreground">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {part.allowCustom && (
                <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                  <button
                    type="button"
                    onClick={() => setMode("custom")}
                    className="flex w-full cursor-pointer items-center gap-2 text-left text-sm"
                  >
                    {mode === "custom" ? (
                      <CheckCircle2 className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/60" />
                    )}
                    <span>其他</span>
                  </button>
                  {mode === "custom" && (
                    <Textarea
                      value={customText}
                      onChange={(event) => setCustomText(event.target.value)}
                      placeholder="输入你的选择..."
                      className="min-h-20 resize-none text-sm"
                    />
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRespond?.(part.requestId, { type: "cancel" })}
                  className="text-muted-foreground"
                >
                  <XCircle className="mr-1.5 h-4 w-4" />
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canSubmit}
                  onClick={() => {
                    if (mode === "custom") {
                      onRespond?.(part.requestId, {
                        type: "custom",
                        text: customText.trim(),
                      });
                      return;
                    }
                    if (selectedOptionId) {
                      onRespond?.(part.requestId, {
                        type: "option",
                        optionId: selectedOptionId,
                      });
                    }
                  }}
                >
                  提交
                </Button>
              </div>
            </div>
          )}
      </div>
    </ChatCard>
  );
}
