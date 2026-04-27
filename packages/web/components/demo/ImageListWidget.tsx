'use client';

import React, { useState, useCallback, useRef } from 'react';
import { X, Plus, ImageIcon, Loader2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// ========== 工具函数 ==========

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取图片尺寸'));
    };
    img.src = url;
  });
}

interface DimensionOptions {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

function validateImageDimensions(
  actual: { width: number; height: number },
  options: DimensionOptions
): { valid: boolean; message: string } {
  const { minWidth, minHeight, maxWidth, maxHeight } = options;
  const parts: string[] = [];

  if (minWidth && actual.width < minWidth) parts.push(`宽度小于 ${minWidth}px`);
  if (minHeight && actual.height < minHeight) parts.push(`高度小于 ${minHeight}px`);
  if (maxWidth && actual.width > maxWidth) parts.push(`宽度大于 ${maxWidth}px`);
  if (maxHeight && actual.height > maxHeight) parts.push(`高度大于 ${maxHeight}px`);

  if (parts.length === 0) return { valid: true, message: '' };
  return {
    valid: false,
    message: `图片尺寸不符合要求：${parts.join('，')}（实际 ${actual.width}x${actual.height}px）`,
  };
}

async function deleteServerFile(sessionId: string, url: string) {
  if (!url.startsWith('/api/sessions/')) return;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  if (!filename) return;
  try {
    await fetch(`/api/sessions/${sessionId}/assets/${filename}`, { method: 'DELETE' });
  } catch {
    // 静默失败
  }
}

// ========== 类型定义 ==========

export interface ImageItem {
  url: string;
  alt?: string;
}

export interface ImageListWidgetProps {
  value: ImageItem[];
  onChange: (value: ImageItem[]) => void;
  maxItems?: number;
  title?: string;
  sessionId?: string;
  options?: {
    accept?: string;
    maxSize?: number;
    maxItems?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  };
}

interface ImageThumbnailProps {
  item: ImageItem;
  onDelete: () => void;
}

// ========== 子组件 ==========

function ImageThumbnail({ item, onDelete }: ImageThumbnailProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative aspect-square rounded-lg border border-border bg-muted overflow-hidden group">
      {!hasError ? (
        <>
          <img
            src={item.url}
            alt={item.alt || '图片'}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-200',
              isLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onError={() => setHasError(true)}
            onLoad={() => setIsLoaded(true)}
          />
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
          <span className="text-[10px] text-muted-foreground text-center px-1">
            加载失败
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
        aria-label="删除图片"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-3 py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground border-2 border-dashed border-border rounded-lg bg-muted/30">
      <div className="p-2 rounded-full bg-muted">
        <ImageIcon className="w-5 h-5 text-muted-foreground/60" />
      </div>
      <div className="text-center">
        <span className="text-sm block">暂无图片</span>
        <span className="text-xs text-muted-foreground/60 mt-0.5 block">点击下方按钮添加</span>
      </div>
    </div>
  );
}

// ========== 主组件 ==========

export function ImageListWidget({
  value = [],
  onChange,
  maxItems: propMaxItems,
  title = '图片列表',
  sessionId,
  options = {},
}: ImageListWidgetProps) {
  const maxItems = propMaxItems ?? options.maxItems ?? 20;
  const maxSize = options.maxSize ?? 5 * 1024 * 1024;
  const accept = options.accept ?? 'image/*';

  const dimensionOptions: DimensionOptions = {
    minWidth: options.minWidth,
    minHeight: options.minHeight,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
  };
  const hasDimensionCheck = Object.values(dimensionOptions).some((v) => typeof v === 'number');

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sizeWarning, setSizeWarning] = useState<{
    file: File;
    message: string;
  } | null>(null);

  const handleDelete = useCallback(
    async (index: number) => {
      const item = value[index];
      if (sessionId && item?.url?.startsWith('/api/sessions/')) {
        await deleteServerFile(sessionId, item.url);
      }
      const newValue = value.filter((_, i) => i !== index);
      onChange(newValue);
    },
    [value, onChange, sessionId]
  );

  const doUpload = useCallback(
    async (file: File, skipDimensionCheck = false) => {
      if (!sessionId) {
        setUploadError('请先创建 Session');
        return;
      }

      if (file.size > maxSize) {
        setUploadError(`文件大小超过 ${maxSize / 1024 / 1024}MB 限制`);
        return;
      }

      if (hasDimensionCheck && !skipDimensionCheck) {
        try {
          const dims = await getImageDimensions(file);
          const result = validateImageDimensions(dims, dimensionOptions);
          if (!result.valid) {
            setSizeWarning({ file, message: result.message });
            return;
          }
        } catch {
          setUploadError('无法读取图片尺寸，请检查文件是否有效');
          return;
        }
      }

      setIsUploading(true);
      setUploadError('');

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`/api/sessions/${sessionId}/assets/upload`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!data.success) {
          setUploadError(data.error?.message || '上传失败');
          return;
        }

        const newItem: ImageItem = {
          url: data.data.url,
          alt: file.name,
        };

        onChange([...value, newItem]);
        setIsDialogOpen(false);
        setUploadError('');
      } catch {
        setUploadError('上传失败，请重试');
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId, maxSize, hasDimensionCheck, dimensionOptions, value, onChange]
  );

  const handleFileUpload = useCallback(
    (file: File) => {
      doUpload(file);
    },
    [doUpload]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileUpload(files[0]);
      }
      e.target.value = '';
    },
    [handleFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload]
  );

  const canAddMore = value.length < maxItems;
  const isUrlValid = newUrl.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {value.length} / {maxItems}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {value.length === 0 ? (
          <EmptyState />
        ) : (
          value.map((item, index) => (
            <ImageThumbnail
              key={`${item.url}-${index}`}
              item={item}
              onDelete={() => handleDelete(index)}
            />
          ))
        )}
      </div>

      {canAddMore && (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            'relative flex flex-col items-center justify-center gap-1.5 py-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
            isUploading
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleInputChange}
            disabled={isUploading}
            className="hidden"
          />
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">点击或拖拽上传图片</span>
            </div>
          )}
        </div>
      )}

      {uploadError && <p className="text-xs text-destructive text-center">{uploadError}</p>}

      {/* 尺寸警告弹窗 */}
      <Dialog open={!!sizeWarning} onOpenChange={(open) => !open && setSizeWarning(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              图片尺寸不符合要求
            </DialogTitle>
            <DialogDescription>{sizeWarning?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSizeWarning(null)}>
              取消上传
            </Button>
            <Button
              onClick={() => {
                if (sizeWarning) {
                  const file = sizeWarning.file;
                  setSizeWarning(null);
                  doUpload(file, true);
                }
              }}
            >
              继续上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ImageListWidget;
