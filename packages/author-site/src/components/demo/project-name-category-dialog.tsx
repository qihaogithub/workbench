"use client";

import { useEffect, useId, useState } from "react";
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
  const categoryListId = useId();
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
              <Input
                id="project-category"
                list={categoryListId}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder={DEFAULT_CATEGORY}
                autoFocus={fields === "category"}
              />
              <datalist id={categoryListId}>
                {normalizedCategories.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
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
