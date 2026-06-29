"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
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

function ProjectCategoryCombobox({
  value,
  categories,
  autoFocus,
  onChange,
}: {
  value: string;
  categories: string[];
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentCategory = value.trim() || DEFAULT_CATEGORY;

  return (
    <div className="relative">
      <Input
        id="project-category"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={DEFAULT_CATEGORY}
        autoFocus={autoFocus}
        className="pr-11"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="选择已有项目分类"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1">
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
          </div>
        </PopoverContent>
      </Popover>
    </div>
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

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setCategory(defaultCategory || DEFAULT_CATEGORY);
  }, [defaultCategory, defaultName, open]);

  const normalizedCategories = Array.from(
    new Set([DEFAULT_CATEGORY, ...categories.map((item) => item.trim()).filter(Boolean)]),
  );
  const canSubmit =
    fields === "name"
      ? name.trim().length > 0
      : fields === "category"
        ? category.trim().length > 0
        : name.trim().length > 0 && category.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;
    await onSubmit({
      name: name.trim(),
      category: category.trim() || DEFAULT_CATEGORY,
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
                onChange={setCategory}
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
