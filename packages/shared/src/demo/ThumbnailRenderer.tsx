import React from "react";
import type { ThumbnailMeta } from "./thumbnail-types";
import { ThumbnailBlockView } from "./ThumbnailBlockView";
import { cn } from "./utils";

interface ThumbnailRendererProps {
  meta: ThumbnailMeta;
  className?: string;
}

export function ThumbnailRenderer({ meta, className }: ThumbnailRendererProps) {
  const bgBlocks = meta.blocks.filter((b) => b.type === "background");
  const fgBlocks = meta.blocks.filter((b) => b.type !== "background");

  return (
    <div
      className={cn("relative overflow-hidden rounded-lg border border-border/30", className)}
      style={{
        width: meta.viewport.width,
        height: meta.viewport.height,
        background: meta.theme.backgroundColor ?? "#f3f4f6",
      }}
    >
      {bgBlocks.map((block) => (
        <ThumbnailBlockView key={block.id} block={block} />
      ))}
      {fgBlocks.map((block) => (
        <ThumbnailBlockView key={block.id} block={block} />
      ))}
    </div>
  );
}
