'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'

interface ToolProps {
  name: string
  status: 'running' | 'completed' | 'error' | 'awaiting-approval'
  parameters?: Record<string, unknown>
  result?: unknown
  className?: string
}

export function Tool({
  name,
  status,
  parameters,
  result,
  className,
}: ToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const statusConfig = {
    running: {
      color: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
      icon: (
        <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
      ),
      label: '运行中',
    },
    completed: {
      color: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
      icon: <div className="h-2 w-2 rounded-full bg-green-500" />,
      label: '已完成',
    },
    error: {
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: <div className="h-2 w-2 rounded-full bg-red-500" />,
      label: '错误',
    },
    'awaiting-approval': {
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
      icon: <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />,
      label: '等待确认',
    },
  }

  const config = statusConfig[status]

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        config.bg,
        config.border,
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-black/5 transition-colors"
      >
        {config.icon}
        <span className="font-mono font-medium">{name}</span>
        <span className={cn('ml-auto', config.color)}>{config.label}</span>
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
        <div className="px-3 py-2 border-t border-current/10 space-y-2">
          {parameters && (
            <div>
              <div className="text-xs font-medium mb-1">参数</div>
              <pre className="bg-background/50 rounded p-2 overflow-x-auto">
                <code className="text-xs">
                  {JSON.stringify(parameters, null, 2)}
                </code>
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <div className="text-xs font-medium mb-1">结果</div>
              <pre className="bg-background/50 rounded p-2 overflow-x-auto">
                <code className="text-xs">
                  {typeof result === 'string'
                    ? result
                    : JSON.stringify(result, null, 2)}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ToolHeader({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center justify-between px-3 py-2', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function ToolContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-3 py-2', className)} {...props}>
      {children}
    </div>
  )
}

export function ToolInput({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-1', className)} {...props}>
      <div className="text-xs font-medium">输入</div>
      <div className="bg-background/50 rounded p-2">{children}</div>
    </div>
  )
}

export function ToolOutput({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-1', className)} {...props}>
      <div className="text-xs font-medium">输出</div>
      <div className="bg-background/50 rounded p-2">{children}</div>
    </div>
  )
}

// 别名导出，方便在 ai-chat 中使用
export const ToolCall = Tool
