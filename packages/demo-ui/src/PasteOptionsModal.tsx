"use client";

import React from "react";
import { Copy, Link } from "lucide-react";

interface PasteOptionsModalProps {
  open: boolean;
  pageCount: number;
  sourceProjectName?: string;
  onSelectCopy: () => void;
  onSelectReference: () => void;
  onCancel: () => void;
}

export function PasteOptionsModal({
  open,
  pageCount,
  sourceProjectName,
  onSelectCopy,
  onSelectReference,
  onCancel,
}: PasteOptionsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-sm rounded-lg bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-semibold">粘贴选项</h3>
        <p className="mb-4 text-sm text-muted-foreground">
          来自{sourceProjectName ? `「${sourceProjectName}」` : ""}的
          {pageCount} 个页面
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm hover:bg-muted transition-colors"
            onClick={onSelectCopy}
          >
            <Copy className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">复制</div>
              <div className="text-xs text-muted-foreground">
                创建可编辑的页面副本
              </div>
            </div>
          </button>

          <button
            type="button"
            className="flex items-center gap-3 rounded-md border px-4 py-3 text-left text-sm hover:bg-muted transition-colors"
            onClick={onSelectReference}
          >
            <Link className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="font-medium">引用</div>
              <div className="text-xs text-muted-foreground">
                只读展示源页面最新内容，不可编辑
              </div>
            </div>
          </button>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  );
}