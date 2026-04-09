'use client'

import { cn } from '@/lib/utils'
import { useState } from 'react'
import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface TimelineProps {
  children: React.ReactNode
  className?: string
  title?: string
  defaultExpanded?: boolean
}

export function Timeline({
  children,
  className,
  title = '处理过程',
  defaultExpanded = false,
}: TimelineProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={cn('border-l-2 border-muted pl-4 space-y-2', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium">{title}</span>
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
          {React.Children.count(children)} 个步骤
        </span>
      </button>
      {isExpanded && (
        <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  )
}

interface TimelineItemProps {
  children: React.ReactNode
  className?: string
  indicator?: React.ReactNode
  status?: 'running' | 'completed' | 'error' | 'pending'
}

export function TimelineItem({
  children,
  className,
  indicator,
  status = 'pending',
}: TimelineItemProps) {
  const statusColors = {
    running: 'bg-yellow-500',
    completed: 'bg-green-500',
    error: 'bg-red-500',
    pending: 'bg-muted-foreground/30',
  }

  return (
    <div className={cn('relative flex gap-3', className)}>
      {/* 时间轴指示器 */}
      <div className="flex flex-col items-center">
        {indicator || (
          <div
            className={cn(
              'h-2 w-2 rounded-full flex-shrink-0',
              statusColors[status]
            )}
          />
        )}
      </div>
      {/* 内容 */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}
