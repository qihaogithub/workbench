'use client'

import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Send, Paperclip, Square } from 'lucide-react'
import * as React from 'react'

interface PromptInputProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel?: () => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  maxRows?: number
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = '输入消息...',
  disabled = false,
  loading = false,
  maxRows = 10,
  className,
  ...props
}: PromptInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !loading) {
        onSubmit()
      }
    }
  }

  const handleAutoResize = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxRows * 24)}px`
    }
  }

  React.useEffect(() => {
    handleAutoResize()
  }, [value])

  return (
    <div className={cn('border-t bg-card p-4', className)} {...props}>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || loading}
            className="min-h-[60px] max-h-[240px] resize-none pr-20 rounded-xl"
            rows={1}
          />
          <div className="absolute right-2 bottom-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={disabled || loading}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 rounded-lg"
              disabled={!loading && !value.trim()}
              onClick={loading ? onCancel : onSubmit}
            >
              {loading ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PromptInputFooter({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between px-2 py-1', className)} {...props}>
      {children}
    </div>
  )
}

export function PromptInputTools({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {children}
    </div>
  )
}

export function PromptInputButton({
  children,
  className,
  variant = 'ghost',
  size = 'sm',
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button variant={variant} size={size} className={cn('gap-1', className)} {...props}>
      {children}
    </Button>
  )
}
