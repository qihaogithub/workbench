'use client';

import React, { useState, useCallback, useRef } from 'react';
import { X, Plus, Loader2, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

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
  const maxSize = options.maxSize ?? 50 * 1024 * 1024;
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
        Array.from(files).forEach((file) => {
          handleFileUpload(file);
        });
      }
      e.target.value = '';
    },
    [handleFileUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        Array.from(files).forEach((file) => {
          handleFileUpload(file);
        });
      }
    },
    [handleFileUpload]
  );

  const canAddMore = value.length < maxItems;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {value.length} / {maxItems}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {value.map((item, index) => (
          <div
            key={`${item.url}-${index}`}
            className="relative aspect-square rounded-lg border border-border bg-muted overflow-hidden group"
          >
            <img
              src={item.url}
              alt={item.alt || '图片'}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.classList.add('flex', 'items-center', 'justify-center');
              }}
            />
            <button
              type="button"
              onClick={() => handleDelete(index)}
              className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground"
              aria-label="删除图片"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {isUploading && (
          <div className="aspect-square rounded-lg border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 p-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">文件上传中</span>
            <div className="w-full max-w-[80px] h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}

        {canAddMore && !isUploading && (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
          >
            <Plus className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Upload</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={isUploading}
        className="hidden"
        multiple
      />

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
