"use client";

import { useCallback, useState, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";

function isHtmlFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".html") || name.endsWith(".htm") || file.type === "text/html"
  );
}

interface HtmlFileDropZoneProps {
  children: ReactNode;
  disabled?: boolean;
  onFilesDrop: (files: File[]) => void | Promise<void>;
}

/** 仅在拖入 HTML 文件时接管事件，避免干扰画布自身的拖拽编辑。 */
export function HtmlFileDropZone({
  children,
  disabled = false,
  onFilesDrop,
}: HtmlFileDropZoneProps) {
  const [dragDepth, setDragDepth] = useState(0);
  const active = dragDepth > 0;

  const hasHtmlFiles = useCallback(
    (event: DragEvent<HTMLDivElement>) =>
      Array.from(event.dataTransfer.files).some(isHtmlFile),
    [],
  );

  const handleDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasHtmlFiles(event)) return;
      event.preventDefault();
      setDragDepth((depth) => depth + 1);
    },
    [disabled, hasHtmlFiles],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasHtmlFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    [disabled, hasHtmlFiles],
  );

  const handleDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasHtmlFiles(event)) return;
      event.preventDefault();
      setDragDepth((depth) => Math.max(0, depth - 1));
    },
    [disabled, hasHtmlFiles],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files).filter(isHtmlFile);
      if (disabled || files.length === 0) return;
      event.preventDefault();
      setDragDepth(0);
      void onFilesDrop(files);
    },
    [disabled, onFilesDrop],
  );

  return (
    <div
      className="relative h-full min-h-0"
      data-html-file-drop-zone
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {active && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-md bg-background/95 px-4 py-2 text-sm font-medium text-primary shadow-sm">
            <Upload className="h-4 w-4" />
            释放以上传 HTML 文件
          </div>
        </div>
      )}
    </div>
  );
}
