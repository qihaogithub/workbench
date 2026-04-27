'use client';

import { useMemo, useState, useCallback, useRef } from 'react';
import { WidgetProps } from '@rjsf/utils';
import { Upload, X, ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ColorPickerWidget(props: WidgetProps) {
  const { id, value, onChange, label, required } = props;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          id={id}
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}

export function FileUploadWidget(props: WidgetProps) {
  const { id, value, onChange, label, required, formContext, disabled } = props;
  const sessionId = (formContext as { sessionId?: string } | undefined)?.sessionId;
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const options = (props.options || {}) as {
    accept?: string;
    maxSize?: number;
    placeholder?: string;
  };

  const accept = options.accept || 'image/*';
  const maxSize = options.maxSize || 5 * 1024 * 1024;
  const placeholder = options.placeholder || 'https://example.com/image.png';

  const handleFileSelect = useCallback(async (file: File) => {
    if (!sessionId) {
      setError('请先创建 Session');
      return;
    }

    if (file.size > maxSize) {
      setError(`文件大小超过 ${maxSize / 1024 / 1024}MB 限制`);
      return;
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

      onChange(data.data.url);
    } catch {
      setError('上传失败，请重试');
    } finally {
      setIsUploading(false);
    }
  }, [sessionId, maxSize, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    e.target.value = '';
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  const handleClear = useCallback(() => {
    onChange(undefined);
    setError('');
  }, [onChange]);

  const isValueFromUpload = useMemo(() => {
    return typeof value === 'string' && value.startsWith('/api/sessions/');
  }, [value]);

  return (
    <div className="mb-4 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>

      {value ? (
        <div className="space-y-2">
          <div className="relative rounded-lg border border-border overflow-hidden bg-muted group">
            <img
              src={value}
              alt="Preview"
              className="w-full h-32 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled || isUploading}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-background/80 text-foreground backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled || isUploading}
              className="flex-1 px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring disabled:opacity-50"
            />
            {isValueFromUpload && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">已上传</span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            id={id}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || isUploading}
            className="w-full px-3 py-2 text-sm bg-input border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring disabled:opacity-50"
          />

          {sessionId && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                'relative flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
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
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="p-2 rounded-full bg-muted">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    点击或拖拽上传图片
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    支持 JPG、PNG、GIF、WebP，最大 {maxSize / 1024 / 1024}MB
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

export function RichTextWidget(props: WidgetProps) {
  const { id, value, onChange, label, required } = props;

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        id={id}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

export const customWidgets = {
  color: ColorPickerWidget,
  file: FileUploadWidget,
  richtext: RichTextWidget,
};
