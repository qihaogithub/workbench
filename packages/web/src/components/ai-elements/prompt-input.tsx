'use client'

import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Send,
  Image,
  Square,
  Loader2,
} from 'lucide-react'
import * as React from 'react'

export interface PromptInputFile {
  id: string
  name: string
  type: string
  size: number
  url?: string
  file?: File
}

export interface PromptInputMessage {
  text: string
  files?: PromptInputFile[]
}

interface PromptInputContextValue {
  text: string
  setText: (text: string) => void
  files: PromptInputFile[]
  addFiles: (files: File[]) => void
  removeFile: (id: string) => void
  clearFiles: () => void
  status: 'idle' | 'loading' | 'streaming'
  setStatus: (status: 'idle' | 'loading' | 'streaming') => void
  onSubmit?: (message: PromptInputMessage) => void
  onCancel?: () => void
  maxFiles?: number
  maxSize?: number
  accept?: string
}

const PromptInputContext = React.createContext<PromptInputContextValue | null>(
  null,
)

function usePromptInput() {
  const context = React.useContext(PromptInputContext)
  if (!context) {
    throw new Error('usePromptInput must be used within a PromptInput')
  }
  return context
}

export function usePromptInputAttachments() {
  const context = React.useContext(PromptInputContext)
  if (!context) {
    throw new Error(
      'usePromptInputAttachments must be used within a PromptInput',
    )
  }
  return {
    files: context.files,
    add: context.addFiles,
    remove: context.removeFile,
    clear: context.clearFiles,
    openFileDialog: () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.accept = context.accept || '*/*'
      input.onchange = (e) => {
        const files = (e.target as HTMLInputElement).files
        if (files) {
          context.addFiles(Array.from(files))
        }
      }
      input.click()
    },
  }
}

interface PromptInputProps
  extends Omit<React.HTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  onSubmit?: (message: PromptInputMessage) => void
  onCancel?: () => void
  status?: 'idle' | 'loading' | 'streaming'
  maxFiles?: number
  maxSize?: number
  accept?: string
  globalDrop?: boolean
  multiple?: boolean
}

export function PromptInput({
  children,
  onSubmit,
  onCancel,
  status = 'idle',
  maxFiles = 5,
  maxSize = 10 * 1024 * 1024,
  accept = '*/*',
  globalDrop = false,
  multiple = true,
  className,
  ...props
}: PromptInputProps) {
  const [text, setText] = React.useState('')
  const [files, setFiles] = React.useState<PromptInputFile[]>([])
  const [internalStatus, setInternalStatus] =
    React.useState<'idle' | 'loading' | 'streaming'>(status)

  React.useEffect(() => {
    setInternalStatus(status)
  }, [status])

  const addFiles = React.useCallback(
    (newFiles: File[]) => {
      const validFiles = newFiles.filter((file) => {
        if (file.size > maxSize) {
          console.warn(`File ${file.name} exceeds max size`)
          return false
        }
        return true
      })

      const filesToAdd = multiple
        ? validFiles.slice(0, maxFiles - files.length)
        : validFiles.slice(0, 1)

      const promptFiles: PromptInputFile[] = filesToAdd.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
        file,
      }))

      setFiles((prev) => [...prev, ...promptFiles])
    },
    [files.length, maxFiles, maxSize, multiple],
  )

  const removeFile = React.useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id)
      if (file?.url) {
        URL.revokeObjectURL(file.url)
      }
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const clearFiles = React.useCallback(() => {
    files.forEach((file) => {
      if (file.url) {
        URL.revokeObjectURL(file.url)
      }
    })
    setFiles([])
  }, [files])

  const handleFormSubmit = React.useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (onSubmit && (text.trim() || files.length > 0)) {
        onSubmit({ text: text.trim(), files })
        setText('')
        clearFiles()
      }
    },
    [onSubmit, text, files, clearFiles],
  )

  const handleSubmit = React.useCallback(
    (message: PromptInputMessage) => {
      if (onSubmit) {
        onSubmit(message)
        setText('')
        clearFiles()
      }
    },
    [onSubmit, clearFiles],
  )

  const handleDrop = React.useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const droppedFiles = Array.from(e.dataTransfer.files)
      addFiles(droppedFiles)
    },
    [addFiles],
  )

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const contextValue: PromptInputContextValue = {
    text,
    setText,
    files,
    addFiles,
    removeFile,
    clearFiles,
    status: internalStatus,
    setStatus: setInternalStatus,
    onSubmit: handleSubmit,
    onCancel,
    maxFiles,
    maxSize,
    accept,
  }

  return (
    <PromptInputContext.Provider value={contextValue}>
      <form
        onSubmit={handleFormSubmit}
        onDrop={globalDrop ? handleDrop : undefined}
        onDragOver={globalDrop ? handleDragOver : undefined}
        className={cn('border-t bg-card p-4', className)}
        {...props}
      >
        <div className="flex flex-col gap-2">{children}</div>
      </form>
    </PromptInputContext.Provider>
  )
}

export function PromptInputHeader({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} {...props}>
      {children}
    </div>
  )
}

export function PromptInputBody({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('relative', className)} {...props}>
      {children}
    </div>
  )
}

interface PromptInputTextareaProps
  extends Omit<
    React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'onChange'
  > {
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  minHeight?: number
  maxHeight?: number
}

export function PromptInputTextarea({
  className,
  placeholder = '输入消息...',
  minHeight = 60,
  maxHeight = 240,
  value: controlledValue,
  onChange,
  ...props
}: PromptInputTextareaProps) {
  const context = usePromptInput()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const value = controlledValue !== undefined ? controlledValue : context.text

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e)
    }
    if (controlledValue === undefined) {
      context.setText(e.target.value)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && context.status === 'idle') {
        context.onSubmit?.({ text: value.trim(), files: context.files })
        context.setText('')
      }
    }
  }

  React.useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    }
  }, [value, maxHeight])

  return (
    <Textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={context.status !== 'idle'}
      className={cn(
        'min-h-[60px] max-h-[240px] resize-none pr-20 rounded-xl scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/50',
        className,
      )}
      style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
      rows={1}
      {...props}
    />
  )
}

export function PromptInputFooter({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between gap-2', className)}
      {...props}
    >
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
    <div className={cn('flex items-center gap-1', className)} {...props}>
      {children}
    </div>
  )
}

interface PromptInputButtonProps
  extends React.ComponentProps<typeof Button> {
  tooltip?: string | { content: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right' }
}

export function PromptInputButton({
  children,
  tooltip,
  className,
  ...props
}: PromptInputButtonProps) {
  if (!tooltip) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', className)}
        {...props}
      >
        {children}
      </Button>
    )
  }

  const tooltipContent =
    typeof tooltip === 'string' ? tooltip : tooltip.content
  const shortcut = typeof tooltip === 'object' ? tooltip.shortcut : undefined
  const side = typeof tooltip === 'object' ? tooltip.side : 'top'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', className)}
            {...props}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>
          <span>{tooltipContent}</span>
          {shortcut && (
            <span className="ml-2 text-xs text-muted-foreground">
              {shortcut}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface PromptInputSubmitProps extends React.ComponentProps<typeof Button> {
  status?: 'idle' | 'loading' | 'streaming'
}

export function PromptInputSubmit({
  status: propStatus,
  className,
  ...props
}: PromptInputSubmitProps) {
  const context = usePromptInput()
  const status = propStatus || context.status

  const handleClick = () => {
    if (status === 'streaming') {
      context.onCancel?.()
      return
    }
    if (status === 'idle' && (context.text.trim() || context.files.length > 0)) {
      context.onSubmit?.({ text: context.text.trim(), files: context.files })
      context.setText('')
      context.clearFiles()
    }
  }

  return (
    <Button
      type="button"
      size="icon"
      className={cn('h-8 w-8 rounded-lg', className)}
      disabled={status === 'idle' && !context.text.trim() && context.files.length === 0}
      onClick={handleClick}
      {...props}
    >
      {status === 'loading' ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : status === 'streaming' ? (
        <Square className="h-3 w-3 fill-current" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  )
}

export function PromptInputSelect({
  children,
  value,
  onValueChange,
  ...props
}: React.ComponentProps<typeof Select>) {
  return (
    <Select value={value} onValueChange={onValueChange} {...props}>
      {children}
    </Select>
  )
}

export function PromptInputSelectTrigger({
  children,
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        'h-8 w-auto min-w-[100px] border-none bg-transparent shadow-none focus:ring-0',
        className,
      )}
      {...props}
    >
      {children}
    </SelectTrigger>
  )
}

export function PromptInputSelectContent({
  children,
  ...props
}: React.ComponentProps<typeof SelectContent>) {
  return <SelectContent {...props}>{children}</SelectContent>
}

export function PromptInputSelectItem({
  children,
  ...props
}: React.ComponentProps<typeof SelectItem>) {
  return <SelectItem {...props}>{children}</SelectItem>
}

export function PromptInputSelectValue({
  placeholder,
}: {
  placeholder?: string
}) {
  return <SelectValue placeholder={placeholder} />
}

export function PromptInputAddImage({
  className,
}: {
  className?: string
}) {
  const context = usePromptInput()
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const imageFiles = files.filter((file) => file.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      context.addFiles(imageFiles)
    }
    e.target.value = ''
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8', className)}
        disabled={context.status !== 'idle'}
        onClick={() => inputRef.current?.click()}
        aria-label="添加图片"
      >
        <Image className="h-4 w-4" />
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  )
}

interface PromptInputModelSelectProps {
  currentModelId: string
  /** 模型列表;可选携带 supportsImages 用于上层逻辑,本组件 UI 不消费该字段 */
  models: Array<{ id: string; label: string; supportsImages?: boolean }>
  canSwitch: boolean
  onModelChange: (modelId: string) => void
  isLoading: boolean
}

export function PromptInputModelSelect({
  currentModelId,
  models,
  canSwitch,
  onModelChange,
  isLoading,
}: PromptInputModelSelectProps) {
  const context = usePromptInput()

  const currentModel = models.find((m) => m.id === currentModelId)
  const displayLabel = isLoading
    ? '模型...'
    : currentModel?.label || currentModelId || '选择模型'

  if (!canSwitch && !isLoading) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-muted-foreground cursor-not-allowed"
              disabled
            >
              <span className="truncate max-w-[120px]">{displayLabel}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <span>当前后端不支持切换模型</span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <PromptInputSelect
      value={currentModelId}
      onValueChange={onModelChange}
      disabled={!canSwitch || isLoading || context.status !== 'idle'}
    >
      <PromptInputSelectTrigger className="text-xs">
        <span className="truncate max-w-[120px]">{displayLabel}</span>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {models.map((model) => (
          <PromptInputSelectItem key={model.id} value={model.id}>
            {model.label}
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  )
}

export {
  PromptInputContext,
  usePromptInput,
}
