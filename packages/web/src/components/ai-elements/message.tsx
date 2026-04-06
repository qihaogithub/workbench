'use client'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bot, User, Copy, Check, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Streamdown } from 'streamdown'

export interface MessagePart {
  type: 'text' | 'reasoning' | 'tool' | 'image' | 'file'
  content?: string
  name?: string
  status?: 'running' | 'completed' | 'error' | 'awaiting-approval'
  parameters?: Record<string, unknown>
  result?: unknown
  duration?: number
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  parts?: MessagePart[]
  reasoning?: {
    content: string
    duration?: number
  }
  tools?: Array<{
    name: string
    status: 'running' | 'completed' | 'error'
    parameters?: Record<string, unknown>
    result?: unknown
  }>
  images?: Array<{
    url: string
    alt?: string
  }>
  files?: Array<{
    name: string
    url: string
    size?: number
  }>
}

interface MessageProps {
  message: ChatMessage
  className?: string
}

export function Message({ message, className }: MessageProps) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={cn('flex gap-3 group', isUser && 'flex-row-reverse', className)}>
      <Avatar className="h-8 w-8 shrink-0">
        {isUser ? (
          <>
            <AvatarImage src="" />
            <AvatarFallback className="bg-primary text-primary-foreground">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </>
        ) : (
          <>
            <AvatarImage src="" />
            <AvatarFallback className="bg-gradient-to-br from-violet-500 to-purple-600 text-white">
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </>
        )}
      </Avatar>

      <div className={cn('flex flex-col gap-2 max-w-[80%]', isUser && 'items-end')}>
        {/* 工具调用展示 */}
        {message.tools && message.tools.length > 0 && (
          <div className="space-y-2">
            {message.tools.map((tool, index) => (
              <ToolCall key={index} tool={tool} />
            ))}
          </div>
        )}

        {/* 思考过程展示 */}
        {message.reasoning && message.reasoning.content && (
          <ReasoningDisplay
            content={message.reasoning.content}
            duration={message.reasoning.duration}
          />
        )}

        {/* 消息内容 */}
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted text-muted-foreground rounded-tl-sm'
          )}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <Streamdown className="prose prose-sm dark:prose-invert max-w-none">
              {message.content}
            </Streamdown>
          )}
        </div>

        {/* 图片展示 */}
        {message.images && message.images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {message.images.map((img, index) => (
              <img
                key={index}
                src={img.url}
                alt={img.alt || ''}
                className="rounded-lg max-w-full h-auto object-contain"
              />
            ))}
          </div>
        )}

        {/* 文件附件展示 */}
        {message.files && message.files.length > 0 && (
          <div className="space-y-1">
            {message.files.map((file, index) => (
              <FileAttachment key={index} file={file} />
            ))}
          </div>
        )}

        {/* 消息操作按钮（仅 AI 消息） */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ThumbsUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ThumbsDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// 工具调用组件
function ToolCall({ tool }: { tool: NonNullable<ChatMessage['tools']>[number] }) {
  const statusColors = {
    running: 'text-yellow-500',
    completed: 'text-green-500',
    error: 'text-red-500',
  }

  const statusIcons = {
    running: <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />,
    completed: <div className="h-2 w-2 rounded-full bg-green-500" />,
    error: <div className="h-2 w-2 rounded-full bg-red-500" />,
  }

  return (
    <div className="bg-muted/50 border border-muted rounded-lg p-3 text-xs">
      <div className="flex items-center gap-2 mb-2">
        {statusIcons[tool.status]}
        <span className="font-mono font-medium">{tool.name}</span>
        <span className={cn('ml-auto', statusColors[tool.status])}>{tool.status}</span>
      </div>
      {tool.parameters && (
        <pre className="bg-background rounded p-2 mt-2 overflow-x-auto">
          <code className="text-xs">{JSON.stringify(tool.parameters, null, 2)}</code>
        </pre>
      )}
    </div>
  )
}

// 思考过程展示组件
function ReasoningDisplay({
  content,
  duration,
}: {
  content: string
  duration?: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-muted/30 border border-muted rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-violet-500" />
          <span className="font-medium">
            {duration ? `思考中 ${duration}s` : '思考过程'}
          </span>
        </div>
        <svg
          className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 border-t border-muted">
          <Streamdown className="prose prose-sm dark:prose-invert max-w-none text-xs text-muted-foreground">
            {content}
          </Streamdown>
        </div>
      )}
    </div>
  )
}

// 文件附件组件
function FileAttachment({ file }: { file: NonNullable<ChatMessage['files']>[number] }) {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    const iconMap: Record<string, string> = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      txt: '📃',
      zip: '📦',
      rar: '📦',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
    }
    return iconMap[ext || ''] || '📎'
  }

  return (
    <a
      href={file.url}
      download={file.name}
      className="flex items-center gap-2 p-2 bg-muted/50 hover:bg-muted rounded-lg transition-colors cursor-pointer"
    >
      <span className="text-lg">{getFileIcon(file.name)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{file.name}</p>
        {file.size && <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>}
      </div>
    </a>
  )
}
