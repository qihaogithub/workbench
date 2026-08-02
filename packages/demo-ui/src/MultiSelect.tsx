"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "./utils";

interface MultiSelectProps {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "请选择",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  const selectedSet = new Set(value);
  const filtered = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query.toLowerCase()) ||
      opt.value.toLowerCase().includes(query.toLowerCase()),
  );

  const toggleOption = useCallback(
    (val: string) => {
      if (selectedSet.has(val)) {
        onChange(value.filter((v) => v !== val));
      } else {
        onChange([...value, val]);
      }
    },
    [value, onChange, selectedSet],
  );

  const removeOption = useCallback(
    (val: string) => {
      onChange(value.filter((v) => v !== val));
    },
    [value, onChange],
  );

  const selectedLabels = value
    .map((v) => options.find((o) => o.value === v)?.label ?? v)
    .filter(Boolean);

  const triggerText =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.slice(0, 2).join(", ")} +${value.length - 2}`;

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 w-full justify-between font-normal",
            value.length === 0 && "text-muted-foreground",
          )}
        >
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder="搜索..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1 p-2 border-b">
            {value.map((val) => {
              const label = options.find((o) => o.value === val)?.label ?? val;
              return (
                <Badge
                  key={val}
                  variant="secondary"
                  className="text-xs h-5 px-1.5 gap-0.5 cursor-default"
                >
                  {label}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOption(val);
                    }}
                    className="ml-0.5 hover:text-foreground"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <ScrollArea className="max-h-[200px]">
          {filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              无匹配选项
            </div>
          ) : (
            <div className="p-1">
              {filtered.map((opt) => {
                const selected = selectedSet.has(opt.value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => toggleOption(opt.value)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs",
                      "hover:bg-accent hover:text-accent-foreground",
                      selected && "bg-accent/50",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30",
                      )}
                    >
                      {selected && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {value.length > 0 && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              清除全部
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
