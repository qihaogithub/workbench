'use client'

import { useState, useEffect, useCallback } from 'react'
import { PopoverContent } from './ui/popover'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Trash2, Plus, Clock, Download } from 'lucide-react'
import { cn } from './lib/utils'

interface SessionItem {
  sessionId: string
  demoId: string
  workspaceId?: string | null
  title?: string | null
  createdAt: number
  lastActivityAt?: number
  lastMessageAt?: number
}

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** AIChat 宿主列宽；用于覆盖 Popover 首次测量异常时的宽度。 */
  popoverWidth?: number | null
  projectId: string
  workspaceId?: string
  currentSessionId?: string
  onSelectSession: (sessionId: string, workspaceId?: string) => void
  onNewSession: (workspaceId?: string) => void
}

export function HistoryDialog({
  open,
  onOpenChange,
  popoverWidth,
  projectId,
  workspaceId,
  currentSessionId,
  onSelectSession,
  onNewSession,
}: HistoryDialogProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sessions/project/${projectId}`)
      const data = await res.json()
      if (data.success) {
        setSessions(data.data)
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) {
      fetchSessions()
    }
  }, [open, fetchSessions])

  const handleDelete = async (sessionId: string) => {
    setDeletingId(sessionId)
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
    } finally {
      setDeletingId(null)
    }
  }

  const handleExport = async (sessionId: string, createdAt: number) => {
    setExportingId(sessionId)
    try {
      const [messagesRes, metaRes] = await Promise.all([
        fetch(`/api/sessions/${sessionId}/messages`),
        fetch(`/api/sessions/${sessionId}`),
      ])
      const messagesData = await messagesRes.json()
      const metaData = await metaRes.json()

      const exportData = {
        sessionId,
        exportedAt: new Date().toISOString(),
        session: metaData.success ? metaData.data : null,
        messages: messagesData.success ? messagesData.data : [],
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date(createdAt).toLocaleDateString('zh-CN').replace(/\//g, '-')
      a.href = url
      a.download = `对话记录-${date}-${sessionId.slice(0, 8)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export session:', error)
    } finally {
      setExportingId(null)
    }
  }

  const handleNewSession = () => {
    onNewSession(workspaceId)
    onOpenChange(false)
  }

  // PromptInput 的 p-4 + 加号按钮 w-8 + gap-1，使历史按钮距侧栏左边缘 52px。
  return (
    <PopoverContent
      side="top"
      align="start"
      alignOffset={-52}
      sideOffset={8}
      aria-label="对话历史"
      style={{
        width:
          popoverWidth != null && popoverWidth > 0
            ? `${popoverWidth}px`
            : "min(360px, calc(100vw - 1rem))",
      }}
      className="w-[min(360px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] min-w-0 overflow-hidden rounded-xl border border-muted-foreground/50 bg-popover p-3 shadow-xl"
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="truncate text-base font-semibold leading-5">
              对话历史
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 cursor-pointer px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={handleNewSession}
            aria-label="新建对话"
            title="新建对话"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建对话
          </Button>
        </div>

        <ScrollArea className="max-h-[min(55vh,340px)] w-full min-w-0 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              加载中...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
              <Clock className="mb-2 h-10 w-10 opacity-40" />
              <p>暂无历史对话</p>
            </div>
          ) : (
            <div className="w-full min-w-0 space-y-1.5">
              {sessions.map((session) => {
                return (
                  <div
                    key={session.sessionId}
                    className={cn(
                      'group flex w-full min-w-0 items-center gap-2 rounded-lg border border-muted-foreground/50 p-2 transition-colors',
                      'hover:bg-muted/70',
                      session.sessionId === currentSessionId &&
                        'border-primary bg-primary/5',
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 cursor-pointer rounded-sm p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        onSelectSession(session.sessionId, session.workspaceId || undefined)
                        onOpenChange(false)
                      }}
                    >
                      <div className="truncate text-sm font-semibold">
                        {session.title || '新对话'}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                        aria-label="导出对话"
                        title="导出对话"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleExport(session.sessionId, session.createdAt)
                        }}
                        disabled={exportingId === session.sessionId}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive"
                        aria-label="删除对话"
                        title="删除对话"
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(session.sessionId)
                        }}
                        disabled={deletingId === session.sessionId}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </PopoverContent>
  )
}
