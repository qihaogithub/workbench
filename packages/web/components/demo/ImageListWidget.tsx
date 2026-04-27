'use client';

import React, { useState, useCallback, useRef } from 'react';
import { X, Plus, ImageIcon, Upload, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

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
}

interface ImageThumbnailProps {
  item: ImageItem;
  onDelete: () => void;
}

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
              <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <ImageIcon className="w-8 h-8 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground text-center px-2">
            加载失败
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={onDelete}
        className="absolute top-1 right-1 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-destructive/90 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        aria-label="删除图片"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="col-span-3 py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground border-2 border-dashed border-border rounded-lg">
      <ImageIcon className="w-10 h-10 text-muted-foreground/50" />
      <span className="text-sm">暂无图片</span>
      <span className="text-xs text-muted-foreground/70">
        点击下方 + 按钮添加图片
      </span>
    </div>
  );
}

export function ImageListWidget({
  value = [],
  onChange,
  maxItems = 20,
  title = '图片列表',
  sessionId,
}: ImageListWidgetProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newAlt, setNewAlt] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    if (!newUrl.trim()) return;

    const newItem: ImageItem = {
      url: newUrl.trim(),
      alt: newAlt.trim() || undefined,
    };

    onChange([...value, newItem]);
    setNewUrl('');
    setNewAlt('');
    setIsDialogOpen(false);
  }, [newUrl, newAlt, value, onChange]);

  const handleDelete = useCallback(
    (index: number) => {
      const newValue = value.filter((_, i) => i !== index);
      onChange(newValue);
    },
    [value, onChange]
  );

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setNewUrl('');
    setNewAlt('');
    setUploadError('');
    setActiveTab('url');
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    if (!sessionId) {
      setUploadError('请先创建 Session');
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('文件大小超过 5MB 限制');
      return;
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
  }, [sessionId, value, onChange]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
    e.target.value = '';
  }, [handleFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const canAddMore = value.length < maxItems;
  const isUrlValid = newUrl.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          {value.length} / {maxItems}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
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
        <Button
          type="button"
          variant="outline"
          className="w-full h-16 border-dashed"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="w-5 h-5 mr-2" />
          添加图片
        </Button>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加图片</DialogTitle>
          </DialogHeader>

          {sessionId && (
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('url')}
                className={cn(
                  'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === 'url'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                图片 URL
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('upload');
                  setUploadError('');
                }}
                className={cn(
                  'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
                  activeTab === 'upload'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                本地上传
              </button>
            </div>
          )}

          {activeTab === 'url' ? (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label
                  htmlFor="image-url"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  图片 URL
                  <span className="text-destructive ml-1">*</span>
                </label>
                <Input
                  id="image-url"
                  type="url"
                  placeholder="https://example.com/image.png"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isUrlValid) {
                      handleAdd();
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="image-alt"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  替代文本 (可选)
                </label>
                <Input
                  id="image-alt"
                  type="text"
                  placeholder="图片描述"
                  value={newAlt}
                  onChange={(e) => setNewAlt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isUrlValid) {
                      handleAdd();
                    }
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="py-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                  isUploading
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleInputChange}
                  disabled={isUploading}
                  className="absolute opacity-0 cursor-pointer"
                  style={{ width: 0, height: 0 }}
                />
                {isUploading ? (
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                ) : (
                  <Upload className="w-8 h-8 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">
                  {isUploading ? '上传中...' : '点击或拖拽上传图片'}
                </span>
                <span className="text-xs text-muted-foreground/70">
                  支持 JPG、PNG、GIF、WebP，最大 5MB
                </span>
              </div>
              {uploadError && (
                <p className="mt-2 text-xs text-destructive text-center">{uploadError}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseDialog}>
              取消
            </Button>
            {activeTab === 'url' && (
              <Button
                type="button"
                onClick={handleAdd}
                disabled={!isUrlValid}
              >
                添加
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ImageListWidget;
