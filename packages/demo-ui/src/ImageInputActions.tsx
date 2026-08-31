'use client';

import { Pencil, Upload } from 'lucide-react';
import { cn } from './utils';

export interface ImageInputActionsProps {
  onUpload: () => void;
  onWhiteboard?: () => void;
  disabled?: boolean;
  className?: string;
}

/** 图片缩略图/占位块上的统一三入口。业务宿主通过回调提供 IO。 */
export function ImageInputActions({
  onUpload,
  onWhiteboard,
  disabled,
  className,
}: ImageInputActionsProps) {
  const buttonClass = 'flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div
      className={cn('absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100', className)}
      onClick={(event) => event.stopPropagation()}
    >
      <button type="button" className={buttonClass} onClick={onUpload} disabled={disabled} aria-label="上传图片" title="上传图片">
        <Upload className="h-4 w-4" />
      </button>
      {onWhiteboard && (
        <button type="button" className={buttonClass} onClick={onWhiteboard} disabled={disabled} aria-label="白板绘图" title="白板绘图">
          <Pencil className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
