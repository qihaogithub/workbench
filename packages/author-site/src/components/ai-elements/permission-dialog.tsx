'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Shield, AlertTriangle } from 'lucide-react'

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
  }
}

interface PermissionDialogProps {
  request: PermissionRequestData
  onRespond: (optionId: string) => void
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

  return (
    <div className={cn(
      isInline
        ? 'px-4 py-2'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm',
      className
    )}>
      <div className={cn(
        'bg-background rounded-lg border',
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
      </div>
    </div>
  )
}
