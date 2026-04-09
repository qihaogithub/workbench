'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'
import { FileText, Terminal, Edit3, FolderOpen, Search, Code } from 'lucide-react'

interface ToolProps {
  name: string
  status: 'running' | 'completed' | 'error' | 'awaiting-approval'
  parameters?: Record<string, unknown>
  result?: unknown
  className?: string
}

// 工具名称语义化映射
const TOOL_LABELS: Record<string, string> = {
  'read': '📖 读取文件',
  'write': '✍️ 写入文件',
  'edit': '✏️ 编辑代码',
  'execute': '⚡ 执行命令',
  'bash': '⚡ 执行命令',
  'search': '🔍 搜索内容',
  'glob': '📁 查找文件',
}

// 获取工具图标
const getToolIcon = (name: string) => {
  const toolName = name.toLowerCase()
  if (toolName.includes('read') || toolName.includes('file')) return <FileText className="h-3 w-3" />
  if (toolName.includes('edit') || toolName.includes('write')) return <Edit3 className="h-3 w-3" />
  if (toolName.includes('exec') || toolName.includes('bash') || toolName.includes('terminal')) return <Terminal className="h-3 w-3" />
  if (toolName.includes('search')) return <Search className="h-3 w-3" />
  if (toolName.includes('folder') || toolName.includes('glob')) return <FolderOpen className="h-3 w-3" />
  return <Code className="h-3 w-3" />
}

// 提取关键信息用于友好展示
const extractToolInfo = (name: string, parameters?: Record<string, unknown>) => {
  const toolName = name.toLowerCase()
  const info: { action: string; target?: string } = { action: name }

  // 尝试从参数中提取文件名或路径
  const path = parameters?.path as string || 
               parameters?.file_path as string || 
               parameters?.command as string

  if (path) {
    // 如果是命令，截取前50个字符
    if (toolName.includes('exec') || toolName.includes('bash')) {
      info.action = TOOL_LABELS[name.toLowerCase()] || name
      info.target = path.substring(0, 50) + (path.length > 50 ? '...' : '')
    } else {
      // 提取文件名
      const fileName = path.split(/[\/\\]/).pop() || path
      info.action = TOOL_LABELS[name.toLowerCase()] || name
      info.target = fileName
    }
  } else {
    info.action = TOOL_LABELS[name.toLowerCase()] || name
  }

  return info
}

export function Tool({
  name,
  status,
  parameters,
  result,
  className,
}: ToolProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const toolInfo = extractToolInfo(name, parameters)

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
      icon: <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>,
      label: '已完成',
    },
    error: {
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-500/20',
      icon: <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>,
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
        'border rounded-lg overflow-hidden transition-all hover:shadow-sm',
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
        <span className="text-muted-foreground">{getToolIcon(name)}</span>
        <div className="flex-1 text-left">
          <span className="font-medium">{toolInfo.action}</span>
          {toolInfo.target && (
            <span className="ml-2 text-muted-foreground font-mono text-[10px]">
              {toolInfo.target}
            </span>
          )}
        </div>
        <span className={cn('ml-auto text-[10px]', config.color)}>{config.label}</span>
        <svg
          className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t border-current/10 space-y-2">
          {parameters && Object.keys(parameters).length > 0 && (
            <div>
              <div className="text-[10px] font-medium mb-1 text-muted-foreground uppercase tracking-wider">参数</div>
              <pre className="bg-background/50 rounded p-2 overflow-x-auto text-[11px]">
                <code className="text-[11px]">
                  {JSON.stringify(parameters, null, 2)}
                </code>
              </pre>
            </div>
          )}
          {result !== undefined && result !== null && (
            <div>
              <div className="text-[10px] font-medium mb-1 text-muted-foreground uppercase tracking-wider">结果</div>
              <pre className={cn(
                "bg-background/50 rounded p-2 overflow-x-auto text-[11px]",
                status === 'error' && 'text-red-600 dark:text-red-400'
              )}>
                <code className="text-[11px]">
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
