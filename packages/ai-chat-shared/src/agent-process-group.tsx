'use client'

import { cn } from './lib/utils'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Brain, Wrench } from 'lucide-react'
import { Reasoning } from './reasoning'
import { Tool } from './tool'

interface AgentProcessGroupProps {
  reasonings: Array<{
    content: string
    duration?: number
    timestamp?: number
  }>
  tools: Array<{
    name: string
    status: 'running' | 'completed' | 'error'
    parameters?: Record<string, unknown>
    result?: unknown
  }>
  isStreaming?: boolean
  className?: string
}

/**
 * Agent 处理过程分组组件
 *
 * 功能:
 * 1. 将思考和工具调用组织在一个可折叠的组内
 * 2. 区分中间过程(Process)和最终回复(Final Answer)
 * 3. 支持展开/折叠,默认折叠以节省空间
 * 4. 显示步骤计数和状态指示
 */
export function AgentProcessGroup({
  reasonings,
  tools,
  isStreaming = false,
  className,
}: AgentProcessGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const hasReasonings = reasonings && reasonings.length > 0
  const hasTools = tools && tools.length > 0

  if (!hasReasonings && !hasTools) return null

  // 计算总步骤数
  const totalSteps = reasonings.length + tools.length

  // 获取最新状态(用于指示器颜色)
  const latestStatus = getLatestStatus(tools)

  return (
    <div className={cn('border-l-2 border-muted/50 pl-4 space-y-2', className)}>
      {/* 折叠/展开按钮 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'flex items-center gap-2 text-xs hover:text-foreground transition-colors',
          isExpanded ? 'text-muted-foreground' : 'text-muted-foreground/70'
        )}
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}

        {/* 状态指示器 */}
        <div className={cn(
          'h-2 w-2 rounded-full',
          isStreaming ? 'bg-violet-500 animate-pulse' : getStatusColor(latestStatus)
        )} />

        <span className="font-medium">
          {isStreaming ? '处理中...' : 'AI 处理过程'}
        </span>

        {/* 步骤计数 */}
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full">
          {totalSteps} 个步骤
        </span>

        {/* 提示文本 */}
        {!isExpanded && (
          <span className="text-[10px] text-muted-foreground/60">
            (点击展开详情)
          </span>
        )}
      </button>

      {/* 展开的内容 */}
      {isExpanded && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          {/* 思考过程 - 独立展示,最新思考优先 */}
          {hasReasonings && (
            <div className="space-y-1.5">
              {reasonings.map((r, index) => {
                const isLatest = index === reasonings.length - 1
                return (
                  <div
                    key={index}
                    className={cn(
                      'relative flex gap-2',
                      !isLatest && 'opacity-75'
                    )}
                  >
                    {/* 时间轴指示器 */}
                    <div className="flex flex-col items-center">
                      <Brain className={cn(
                        'h-3 w-3 flex-shrink-0',
                        isLatest && isStreaming
                          ? 'text-violet-500 animate-pulse'
                          : 'text-violet-500'
                      )} />
                    </div>

                    {/* 思考内容 */}
                    <div className="flex-1 min-w-0">
                      <Reasoning
                        content={r.content}
                        duration={r.duration}
                        isStreaming={isLatest && isStreaming}
                        className="text-[11px]"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* 工具调用 - 独立展示 */}
          {hasTools && (
            <div className="space-y-1.5">
              {tools.map((tool, index) => (
                <div key={index} className="relative flex gap-2">
                  {/* 时间轴指示器 */}
                  <div className="flex flex-col items-center">
                    <Wrench className={cn(
                      'h-3 w-3 flex-shrink-0',
                      tool.status === 'running' && 'text-yellow-500',
                      tool.status === 'completed' && 'text-green-500',
                      tool.status === 'error' && 'text-red-500'
                    )} />
                  </div>

                  {/* 工具组件 */}
                  <div className="flex-1 min-w-0">
                    <Tool
                      entries={[{
                        name: tool.name,
                        status: tool.status,
                        parameters: tool.parameters,
                        result: tool.result,
                      }]}
                      className="text-[11px]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// 获取最新工具状态
function getLatestStatus(tools: AgentProcessGroupProps['tools']): string {
  if (!tools || tools.length === 0) return 'completed'
  return tools[tools.length - 1].status
}

// 状态颜色映射
function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-yellow-500'
    case 'completed':
      return 'bg-green-500'
    case 'error':
      return 'bg-red-500'
    default:
      return 'bg-muted-foreground/30'
  }
}
