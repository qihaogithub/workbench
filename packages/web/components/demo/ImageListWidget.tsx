'use client';

import React, { useState, useCallback } from 'react';
import { X, Plus, ImageIcon } from 'lucide-react';

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
}: ImageListWidgetProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newAlt, setNewAlt] = useState('');

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
  }, []);

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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCloseDialog}>
              取消
            </Button>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={!isUrlValid}
            >
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ImageListWidget;
