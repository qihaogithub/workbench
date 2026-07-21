'use client'

import { cn } from './lib/utils'
import { Button } from './ui/button'
import { X, FileText, Image as ImageIcon } from 'lucide-react'
import * as React from 'react'
import type { PromptInputFile } from './prompt-input'

interface AttachmentsProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'inline' | 'grid'
  children: React.ReactNode
}

export function Attachments({
  variant = 'inline',
  children,
  className,
  ...props
}: AttachmentsProps) {
  return (
    <div
      className={cn(
        variant === 'inline'
          ? 'flex flex-wrap gap-2'
          : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface AttachmentContextValue {
  data: PromptInputFile
  onRemove?: () => void
}

const AttachmentContext = React.createContext<AttachmentContextValue | null>(
  null,
)

interface AttachmentProps extends React.HTMLAttributes<HTMLDivElement> {
  data: PromptInputFile
  onRemove?: () => void
  children: React.ReactNode
}

export function Attachment({
  data,
  onRemove,
  children,
  className,
  ...props
}: AttachmentProps) {
  return (
    <AttachmentContext.Provider value={{ data, onRemove }}>
      <div
        className={cn(
          'relative group flex items-center gap-2 p-2 bg-muted rounded-lg border',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentContext.Provider>
  )
}

export function AttachmentPreview({
  className,
}: {
  className?: string
}) {
  const context = React.useContext(AttachmentContext)
  if (!context) return null

  const { data } = context
  const isImage = data.type.startsWith('image/')

  if (isImage && data.url) {
    return (
      <img
        src={data.url}
        alt={data.name || "附件图片"}
        className={cn(
          'w-10 h-10 object-cover rounded',
          className,
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        'w-10 h-10 flex items-center justify-center bg-muted-foreground/10 rounded',
        className,
      )}
    >
      {isImage ? (
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      ) : (
        <FileText className="h-5 w-5 text-muted-foreground" />
      )}
    </div>
  )
}

export function AttachmentInfo({
  className,
}: {
  className?: string
}) {
  const context = React.useContext(AttachmentContext)
  if (!context) return null

  const { data } = context

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className={cn('flex flex-col min-w-0', className)}>
      <span className="text-sm font-medium truncate">{data.name}</span>
      <span className="text-xs text-muted-foreground">
        {formatSize(data.size)}
      </span>
    </div>
  )
}

export function AttachmentRemove({
  className,
}: {
  className?: string
}) {
  const context = React.useContext(AttachmentContext)
  if (!context) return null

  const { onRemove } = context

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'h-6 w-6 absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity',
        className,
      )}
      onClick={onRemove}
    >
      <X className="h-3 w-3" />
    </Button>
  )
}

Attachment.displayName = 'Attachment'
AttachmentPreview.displayName = 'AttachmentPreview'
AttachmentInfo.displayName = 'AttachmentInfo'
AttachmentRemove.displayName = 'AttachmentRemove'

export {
  AttachmentContext,
}
