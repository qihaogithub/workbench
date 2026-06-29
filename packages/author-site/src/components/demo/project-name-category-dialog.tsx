"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ProjectNameCategoryValue {
  name: string;
  category: string;
}

interface ProjectNameCategoryDialogProps {
  open: boolean;
  title: string;
  description?: string;
  submitLabel: string;
  fields?: "both" | "name" | "category";
  defaultName?: string;
  defaultCategory?: string;
  categories: string[];
  isSubmitting?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: ProjectNameCategoryValue) => Promise<void>;
}

const DEFAULT_CATEGORY = "未分类";
const CUSTOM_CATEGORY_LABEL = "自定义分类";

function normalizeCategoryPath(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim();

  if (!trimmed) {
    return { error: "请输入项目分类" };
  }

  const parts = trimmed.split("/").map((part) => part.trim());
  if (parts.some((part) => !part)) {
    return { error: "分类路径不能以 / 开头或结尾，也不能包含连续的 /" };
  }

  return { value: parts.join("/") };
}

function ProjectCategoryCombobox({
  value,
  categories,
  autoFocus,
  resetKey,
  resetValue,
  onChange,
  onValidationChange,
}: {
  value: string;
  categories: string[];
  autoFocus?: boolean;
  resetKey: string;
  resetValue: string;
  onChange: (value: string) => void;
  onValidationChange: (error: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "custom">("select");
  const [customValue, setCustomValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const currentCategory = value.trim() || DEFAULT_CATEGORY;

  useEffect(() => {
    setMode("select");
    setCustomValue(resetValue);
    setError(null);
    onValidationChange(null);
  }, [onValidationChange, resetKey, resetValue]);

  const handleCustomChange = (nextValue: string) => {
    setCustomValue(nextValue);
    const result = normalizeCategoryPath(nextValue);
    if (result.error) {
      setError(result.error);
      onValidationChange(result.error);
      onChange(nextValue);
      return;
    }

    setError(null);
    onValidationChange(null);
    onChange(result.value ?? DEFAULT_CATEGORY);
  };

  if (mode === "custom") {
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            id="project-category"
            value={customValue}
            onChange={(event) => handleCustomChange(event.target.value)}
            placeholder="APP资源位/弹窗"
            autoFocus
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0 px-4"
            aria-label="返回选择已有分类"
            onClick={() => {
              setMode("select");
              setCustomValue(value);
              setError(null);
              onValidationChange(null);
              onChange(resetValue || DEFAULT_CATEGORY);
            }}
          >
            取消
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          用 / 添加子分类，例如 APP资源位/弹窗
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="project-category"
          type="button"
          variant="outline"
          className="h-10 w-full justify-between px-3 text-left font-normal"
          autoFocus={autoFocus}
        >
          <span className="min-w-0 truncate">{currentCategory}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-1"
      >
        <div className="max-h-56 overflow-y-auto">
          {categories.map((item) => {
            const selected = item === currentCategory;

            return (
              <button
                key={item}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  selected ? "text-foreground" : "text-muted-foreground",
                )}
                onClick={() => {
                  onChange(item);
                  setError(null);
                  onValidationChange(null);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{item}</span>
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    selected ? "opacity-100" : "opacity-0",
                  )}
                />
              </button>
            );
          })}
          <div className="my-1 border-t" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => {
              const initialValue =
                currentCategory === DEFAULT_CATEGORY ? "" : currentCategory;
              const initialResult = normalizeCategoryPath(initialValue);
              setMode("custom");
              setCustomValue(initialValue);
              setError(initialResult.error ?? null);
              onValidationChange(initialResult.error ?? null);
              onChange(initialResult.value ?? "");
              setOpen(false);
            }}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {CUSTOM_CATEGORY_LABEL}
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ProjectNameCategoryDialog({
  open,
  title,
  description,
  submitLabel,
  fields = "both",
  defaultName = "",
  defaultCategory = DEFAULT_CATEGORY,
  categories,
  isSubmitting = false,
  onOpenChange,
  onSubmit,
}: ProjectNameCategoryDialogProps) {
  const [name, setName] = useState(defaultName);
  const [category, setCategory] = useState(defaultCategory);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setCategory(defaultCategory || DEFAULT_CATEGORY);
    setCategoryError(null);
  }, [defaultCategory, defaultName, open]);

  const normalizedCategories = Array.from(
    new Set([DEFAULT_CATEGORY, ...categories.map((item) => item.trim()).filter(Boolean)]),
  );
  const canSubmit =
    fields === "name"
      ? name.trim().length > 0
      : fields === "category"
        ? category.trim().length > 0 && !categoryError
        : name.trim().length > 0 && category.trim().length > 0 && !categoryError;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    const normalizedCategory = normalizeCategoryPath(category);
    if (normalizedCategory.error) {
      setCategoryError(normalizedCategory.error);
      return;
    }

    await onSubmit({
      name: name.trim(),
      category: normalizedCategory.value ?? DEFAULT_CATEGORY,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="leading-6">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {fields !== "category" && (
            <div className="space-y-2">
              <Label htmlFor="project-name">项目名称</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：暑期活动页"
                autoFocus
              />
            </div>
          )}
          {fields !== "name" && (
            <div className="space-y-2">
              <Label htmlFor="project-category">项目分类</Label>
              <ProjectCategoryCombobox
                value={category}
                categories={normalizedCategories}
                autoFocus={fields === "category"}
                resetKey={`${open}:${defaultCategory}:${fields}`}
                resetValue={defaultCategory || DEFAULT_CATEGORY}
                onChange={setCategory}
                onValidationChange={setCategoryError}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? "处理中..." : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
