'use client'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bot, User, Copy, Check, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Streamdown } from 'streamdown'
import { Tool } from './tool'
import { Reasoning } from './reasoning'

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
  isStreaming?: boolean
}

export function Message({ message, className, isStreaming = false }: MessageProps) {
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
    <div className={cn('flex flex-col gap-2 group', isUser && 'items-end', className)}>
      {/* 工具调用展示 */}
      {message.tools && message.tools.length > 0 && (
        <div className="space-y-2">
          {message.tools.map((tool, index) => (
            <Tool
              key={index}
              name={tool.name}
              status={tool.status}
              parameters={tool.parameters}
              result={tool.result}
            />
          ))}
        </div>
      )}

      {/* 思考过程展示 */}
      {message.reasoning && message.reasoning.content && (
        <Reasoning
          content={message.reasoning.content}
          duration={message.reasoning.duration}
          isStreaming={isStreaming}
        />
      )}

      {/* 消息内容 */}
      <div
        className={cn(
          'rounded-2xl px-4 py-3 text-sm max-w-full overflow-hidden',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted text-muted-foreground rounded-tl-sm'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="overflow-x-auto max-w-full">
            <Streamdown className="prose prose-sm dark:prose-invert max-w-full [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:whitespace-pre-wrap [&_code]:break-all [&_table]:block [&_table]:overflow-x-auto [&_table]:max-w-full">
              {message.content}
            </Streamdown>
          </div>
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
