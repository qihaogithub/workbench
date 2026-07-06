"use client";

import { useState } from "react";
import type { DemoFolderMeta } from "@workbench/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface NewFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
  folders: DemoFolderMeta[];
  onCreate: (name: string, parentId: string | null) => void;
}

export function NewFolderDialog({
  open,
  onOpenChange,
  parentId,
  folders,
  onCreate,
}: NewFolderDialogProps) {
  const [name, setName] = useState("");

  const parentFolder = parentId ? folders.find(f => f.id === parentId) : null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, parentId);
    setName("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {parentFolder ? `在「${parentFolder.name}」中新建文件夹` : "新建文件夹"}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="文件夹名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
