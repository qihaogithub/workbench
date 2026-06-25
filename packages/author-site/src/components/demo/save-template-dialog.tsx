"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { DemoMeta } from "@opencode-workbench/shared";

interface SaveTemplateDialogProps {
  open: boolean;
  demo: DemoMeta | null;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    category: string;
    name: string;
    description: string;
  }) => Promise<void>;
}

export function SaveTemplateDialog({
  open,
  demo,
  onOpenChange,
  onSave,
}: SaveTemplateDialogProps) {
  const [category, setCategory] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && demo) {
      setName(demo.name);
      setCategory("");
      setDescription("");
    }
  }, [demo, open]);

  const canSubmit =
    category.trim().length > 0 &&
    name.trim().length > 0 &&
    description.trim().length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    try {
      await onSave({
        category: category.trim(),
        name: name.trim(),
        description: description.trim(),
      });
      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>保存为模板</DialogTitle>
            <DialogDescription>
              将当前项目复制为独立模板，后续创建项目时可以直接复用。
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="template-category">分类</Label>
              <Input
                id="template-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="例如：营销活动、商品详情、问卷表单"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-name">名称</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="请输入模板名称"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="template-description">简介</Label>
              <Textarea
                id="template-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="说明这个模板适合什么场景"
                className="min-h-[96px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              取消
            </Button>
            <Button type="submit" disabled={!canSubmit || isLoading}>
              {isLoading ? "保存中..." : "保存模板"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
