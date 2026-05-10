'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Upload, X, Loader2, ImageIcon, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
    // 静默失败，不阻塞用户操作
  }
}

// ========== ColorPickerWidget ==========

export function ColorPickerWidget(props: WidgetProps) {
  const { id, value, onChange, label, required } = props;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-border cursor-pointer"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
        />
      </div>
    </div>
  );
}

// ========== FileUploadWidget ==========

export interface FileUploadWidgetOptions {
  accept?: string;
  maxSize?: number;
  placeholder?: string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export interface FileUploadWidgetProps {
  id?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  sessionId?: string;
  options?: FileUploadWidgetOptions;
}

export function FileUploadWidget(props: WidgetProps | FileUploadWidgetProps) {
  const {
    id,
    value,
    onChange,
    label,
    required,
    disabled,
  } = props as any;

  const sessionId = (props as any).sessionId ?? (props as any).formContext?.sessionId;
  const rawOptions = ((props as any).options || {}) as FileUploadWidgetOptions;

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sizeWarning, setSizeWarning] = useState<{
    file: File;
    message: string;
  } | null>(null);

  const accept = rawOptions.accept || 'image/*';
  const maxSize = rawOptions.maxSize || 50 * 1024 * 1024;

  const dimensionOptions: DimensionOptions = {
    minWidth: rawOptions.minWidth,
    minHeight: rawOptions.minHeight,
    maxWidth: rawOptions.maxWidth,
    maxHeight: rawOptions.maxHeight,
  };

  const hasDimensionCheck = Object.values(dimensionOptions).some((v) => typeof v === 'number');

  const doUpload = useCallback(
    async (file: File, skipDimensionCheck = false) => {
      if (!sessionId) {
        setError('请先创建 Session');
        return;
      }

      if (file.size > maxSize) {
        setError(`文件大小超过 ${maxSize / 1024 / 1024}MB 限制`);
        return;
      }

      // 尺寸校验
      if (hasDimensionCheck && !skipDimensionCheck) {
        try {
          const dims = await getImageDimensions(file);
          const result = validateImageDimensions(dims, dimensionOptions);
          if (!result.valid) {
            setSizeWarning({ file, message: result.message });
            return;
          }
        } catch {
          setError('无法读取图片尺寸，请检查文件是否有效');
          return;
        }
      }

      setIsUploading(true);
      setError('');

      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`/api/sessions/${sessionId}/assets/upload`, {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();

        if (!data.success) {
          setError(data.error?.message || '上传失败');
          return;
        }

        // 如果之前有上传的文件，先删除旧文件
        if (typeof value === 'string' && value.startsWith('/api/sessions/')) {
          await deleteServerFile(sessionId, value);
        }

        onChange(data.data.url);
      } catch {
        setError('上传失败，请重试');
      } finally {
        setIsUploading(false);
      }
    },
    [sessionId, maxSize, hasDimensionCheck, dimensionOptions, value, onChange]
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      doUpload(file);
    },
    [doUpload]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
      e.target.value = '';
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleClear = useCallback(async () => {
    if (sessionId && typeof value === 'string' && value.startsWith('/api/sessions/')) {
      await deleteServerFile(sessionId, value);
    }
    onChange(undefined);
    setError('');
  }, [sessionId, value, onChange]);

  const isValueFromUpload = useMemo(() => {
    return typeof value === 'string' && value.startsWith('/api/sessions/');
  }, [value]);

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-start gap-3">
          <div className="relative w-[120px] h-[120px] rounded-lg border border-border overflow-hidden bg-muted shrink-0 group">
            <img
              src={value}
              alt="Preview"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).parentElement!.classList.add('flex', 'items-center', 'justify-center');
              }}
            />
            {/* 悬浮遮罩层 */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploading}
                className="p-2 rounded-full bg-background/90 text-foreground hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
                aria-label="重新上传"
              >
                <Upload className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={disabled || isUploading}
                className="p-2 rounded-full bg-background/90 text-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
                aria-label="删除图片"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {sessionId && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                'relative w-[120px] h-[120px] flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-lg cursor-pointer transition-colors shrink-0',
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
                disabled={disabled || isUploading}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {isUploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <div className="p-1.5 rounded-full bg-muted">
                    <Upload className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="text-xs text-muted-foreground">Upload</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

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

// ========== RichTextWidget ==========

export function RichTextWidget(props: WidgetProps) {
  const { id, value, onChange, label, required } = props;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-foreground mb-1">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <textarea
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring resize-none"
      />
    </div>
  );
}

export const customWidgets = {
  color: ColorPickerWidget,
  file: FileUploadWidget,
  richtext: RichTextWidget,
};
