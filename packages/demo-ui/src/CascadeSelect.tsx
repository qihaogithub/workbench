"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "./utils";
import type { CascadeOption } from "./schema-parser";

interface CascadeSelectProps {
  options: CascadeOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function CascadeSelect({
  options,
  value,
  onChange,
  placeholder = "请选择",
}: CascadeSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeParent, setActiveParent] = useState<string | null>(
    value.length > 0 ? value[0] : null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setActiveParent(value.length > 0 ? value[0] : null);
    }
  }, [open, value]);

  const filteredParents = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query.toLowerCase()) ||
      opt.value.toLowerCase().includes(query.toLowerCase()),
  );

  const activeOption = options.find((o) => o.value === activeParent);
  const activeChildren = activeOption?.children || [];

  const handleParentClick = useCallback((parentValue: string) => {
    setActiveParent(parentValue);
    setQuery("");
  }, []);

  const handleChildClick = useCallback(
    (childValue: string) => {
      onChange([activeParent!, childValue]);
      setOpen(false);
    },
    [activeParent, onChange],
  );

  const handleParentOnlyClick = useCallback(
    (parentValue: string) => {
      onChange([parentValue]);
      setOpen(false);
    },
    [onChange],
  );

  const displayText = (() => {
    if (value.length === 0) return placeholder;
    const parent = options.find((o) => o.value === value[0]);
    if (!parent) return value.join(" / ");
    if (value.length === 1) return parent.label;
    const child = parent.children?.find((c) => c.value === value[1]);
    return child ? `${parent.label} / ${child.label}` : value.join(" / ");
  })();

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
          <span className="truncate">{displayText}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder={activeParent ? "搜索子选项..." : "搜索..."}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value && activeParent) {
                setActiveParent(null);
              }
            }}
            className="h-7 text-xs"
          />
        </div>
        <div className="flex h-[220px]">
          <ScrollArea className="flex-1 border-r">
            <div className="p-1">
              {filteredParents.map((opt) => {
                const isActive = opt.value === activeParent;
                const hasChildren = opt.children && opt.children.length > 0;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (hasChildren) {
                        handleParentClick(opt.value);
                      } else {
                        handleParentOnlyClick(opt.value);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {hasChildren && <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />}
                  </button>
                );
              })}
              {filteredParents.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  无匹配选项
                </div>
              )}
            </div>
          </ScrollArea>
          {activeOption && activeChildren.length > 0 && query === "" && (
            <ScrollArea className="flex-1">
              <div className="p-1">
                {activeChildren.map((child) => {
                  const isSelected =
                    value.length === 2 && value[1] === child.value;
                  return (
                    <button
                      key={child.value}
                      onClick={() => handleChildClick(child.value)}
                      className={cn(
                        "flex w-full items-center rounded-sm px-2 py-1.5 text-xs",
                        "hover:bg-accent hover:text-accent-foreground",
                        isSelected && "bg-accent text-accent-foreground",
                      )}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          {activeParent && (!activeOption || activeChildren.length === 0) && query === "" && (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-xs text-muted-foreground">无子选项</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
