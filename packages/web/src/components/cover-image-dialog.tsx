'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-provider'
import { uploadCover, deleteCover } from '@/lib/api'
import { ImagePlus, Trash2, Upload, Loader2 } from 'lucide-react'

interface CoverImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  currentThumbnail?: string
  onThumbnailChange: (thumbnail: string | null) => void
}

export function CoverImageDialog({
  open,
  onOpenChange,
  projectId,
  currentThumbnail,
  onThumbnailChange,
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
        const result = await uploadCover(projectId, file)
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
    [projectId, onThumbnailChange, toast],
  )

  const handleDelete = useCallback(async () => {
    setIsDeleting(true)
    try {
      const result = await deleteCover(projectId)
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
  }, [projectId, onThumbnailChange, toast])

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
          <div className="relative aspect-video bg-muted rounded-md overflow-hidden">
            {currentThumbnail ? (
              <img
                src={currentThumbnail}
                alt="封面图预览"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <ImagePlus className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">暂无封面图</p>
                </div>
              </div>
            )}
          </div>

          <div
            className={`border-2 border-dashed rounded-md p-6 text-center transition-colors cursor-pointer ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                上传中...
              </div>
            ) : (
              <>
                <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  点击或拖拽上传封面图
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  支持 JPG / PNG / WebP，最大 5MB，建议 16:9 比例
                </p>
              </>
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

          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isProcessing || !currentThumbnail}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            删除封面图
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
