'use client'

import { useState } from 'react'
import { cn } from './lib/utils'
import { Button } from './ui/button'
import { Shield, AlertTriangle, FileText, Check, X } from 'lucide-react'
import { DocumentEditor } from '@workbench/demo-ui'
import { ChatCard } from './chat-card'

interface PermissionRequestData {
  sessionId: string
  options: Array<{
    optionId: string
    name: string
  }>
  toolCall: {
    toolCallId: string
    title?: string
    kind?: string
    summary?: string
    planId?: string
    approvalKind?: 'delete' | 'plan_approval'
    editable?: boolean
    initialContent?: string
  }
}

interface PermissionDialogProps {
  request: PermissionRequestData
  onRespond: (optionId: string, responseContent?: string) => void
  onCancel: () => void
  className?: string
  variant?: 'modal' | 'inline'
}

export function PermissionDialog({
  request,
  onRespond,
  onCancel,
  className,
  variant = 'modal',
}: PermissionDialogProps) {
  const getToolKindLabel = (kind?: string) => {
    const kindMap: Record<string, string> = {
      read: '读取文件',
      edit: '编辑文件',
      execute: '执行命令',
    }
    return kind ? kindMap[kind] || kind : '操作'
  }

  const toolLabel = getToolKindLabel(request.toolCall.kind)
  const toolTitle = request.toolCall.title || request.toolCall.toolCallId
  const isInline = variant === 'inline'
  const isPlanApproval = request.toolCall.approvalKind === 'plan_approval'
  const initialPlan = request.toolCall.initialContent || request.toolCall.summary || ''
  const [isPlanOpen, setIsPlanOpen] = useState(false)
  const [editablePlan, setEditablePlan] = useState(initialPlan)

  if (isPlanApproval) {
    return (
      <>
        <div className={cn(isInline ? 'px-4 py-2' : '', className)}>
          <ChatCard className="bg-background">
            <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="p-2 rounded-full bg-blue-500/10 shrink-0">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium truncate">执行计划</h3>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setIsPlanOpen(true)}>
                  查看计划
                </Button>
                <Button size="sm" onClick={() => onRespond('allow_once', editablePlan)}>
                  <Check className="mr-1.5 h-4 w-4" />
                  批准
                </Button>
              </div>
            </div>
          </ChatCard>
        </div>

        {isPlanOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="mx-4 flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-background shadow-xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h3 className="font-medium">{toolTitle}</h3>
                  <p className="text-xs text-muted-foreground">
                    可编辑计划内容，批准后 Agent 将按最终版本继续执行
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPlanOpen(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden p-4">
                <DocumentEditor
                  value={editablePlan}
                  onChange={setEditablePlan}
                  format="markdown"
                  placeholder="编辑执行计划..."
                  className="min-h-[420px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-4 py-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsPlanOpen(false)
                    onRespond('reject_once')
                  }}
                >
                  取消
                </Button>
                <Button
                  onClick={() => {
                    setIsPlanOpen(false)
                    onRespond('allow_once', editablePlan)
                  }}
                >
                  批准执行
                </Button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return (
    <div className={cn(
      isInline
        ? 'px-4 py-2'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm',
      className
    )}>
      <ChatCard className={cn(
        'bg-background',
        isInline ? 'w-full shadow-sm' : 'shadow-xl max-w-md w-full mx-4',
      )}>
        {/* 头部 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/50">
          <div className="p-2 rounded-full bg-yellow-500/10">
            <Shield className="h-5 w-5 text-yellow-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium">权限请求</h3>
            <p className="text-xs text-muted-foreground">
              Agent 需要您的确认才能继续操作
            </p>
          </div>
        </div>

        {/* 内容 */}
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-start gap-2 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {toolLabel}: {toolTitle}
              </p>
              <p className="text-xs text-muted-foreground">
                工具调用 ID: {request.toolCall.toolCallId}
              </p>
              {request.toolCall.planId && (
                <p className="text-xs text-muted-foreground">
                  删除计划: {request.toolCall.planId}
                </p>
              )}
            </div>
          </div>

          {request.toolCall.summary && (
            <div className="max-h-48 overflow-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground font-sans">
                {request.toolCall.summary}
              </pre>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium">请选择操作:</p>
            <div className="grid grid-cols-2 gap-2">
              {request.options.map((option) => (
                <Button
                  key={option.optionId}
                  onClick={() => onRespond(option.optionId)}
                  variant="outline"
                  size="sm"
                  className="text-sm"
                >
                  {option.name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* 底部 */}
        <div className="px-4 py-3 border-t bg-muted/30">
          <Button
            onClick={onCancel}
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
          >
            取消请求
          </Button>
        </div>
      </ChatCard>
    </div>
  )
}
