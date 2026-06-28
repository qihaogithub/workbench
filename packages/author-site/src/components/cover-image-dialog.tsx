'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-provider'
import { uploadCover, deleteCover } from '@/lib/api'
import { ImagePlus, Trash2, RefreshCcw, Loader2 } from 'lucide-react'
import type { ApiResponse } from '@opencode-workbench/shared'

interface CoverImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  currentThumbnail?: string
  onThumbnailChange: (thumbnail: string | null) => void
  onUpload?: (file: File) => Promise<ApiResponse<{ thumbnail: string }>>
  onDelete?: () => Promise<ApiResponse<{ thumbnail: string | null }>>
}

export function CoverImageDialog({
  open,
  onOpenChange,
  projectId,
  currentThumbnail,
  onThumbnailChange,
  onUpload,
  onDelete,
}: CoverImageDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleFileSelect = useCallback(
    async (file: File) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        toast({ title: '不支持的格式', description: '仅支持 JPG、PNG、WebP 格式', variant: 'destructive' })
        return
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: '文件过大', description: '图片大小不能超过 5MB', variant: 'destructive' })
        return
      }

      setIsUploading(true)
      try {
        const result = onUpload
          ? await onUpload(file)
          : await uploadCover(projectId, file)
        if (result.success) {
          onThumbnailChange(result.data.thumbnail)
          toast({ title: '封面图已更新' })
        } else {
          toast({ title: '上传失败', description: result.error.message, variant: 'destructive' })
        }
      } catch {
        toast({ title: '上传失败', description: '网络错误', variant: 'destructive' })
      } finally {
        setIsUploading(false)
      }
    },
    [projectId, onThumbnailChange, onUpload, toast],
  )

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const result = onDelete ? await onDelete() : await deleteCover(projectId)
      if (result.success) {
        onThumbnailChange(result.data.thumbnail ?? null)
        toast({ title: '封面图已删除' })
      } else {
        toast({ title: '删除失败', description: result.error.message, variant: 'destructive' })
      }
    } catch {
      toast({ title: '删除失败', description: '网络错误', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }, [projectId, onDelete, onThumbnailChange, toast])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) {
        handleFileSelect(file)
      }
    },
    [handleFileSelect],
  )

  const isProcessing = isUploading || isDeleting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>设置封面图</DialogTitle>
          <DialogDescription>
            上传自定义封面图，用于首页项目卡片展示
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {currentThumbnail ? (
            <div
              className={`relative aspect-video rounded-md overflow-hidden border-2 border-dashed transition-colors ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <img
                src={currentThumbnail}
                alt="封面图预览"
                className="h-full w-full object-cover"
              />
              <div className="absolute top-2 right-2 flex gap-1.5">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  title="重新上传"
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm hover:bg-background text-destructive hover:text-destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="删除封面图"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div
              className={`relative aspect-video rounded-md overflow-hidden border-2 border-dashed transition-colors cursor-pointer ${
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex h-full items-center justify-center">
                {isUploading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    上传中...
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground">
                    <ImagePlus className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">点击或拖拽上传封面图</p>
                    <p className="text-xs mt-1 opacity-60">
                      支持 JPG / PNG / WebP，最大 5MB，建议 16:9 比例
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                handleFileSelect(file)
              }
              e.target.value = ''
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
