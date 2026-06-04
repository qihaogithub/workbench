'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Plus, Clock, AlertCircle, MessageSquare, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionItem {
  sessionId: string
  demoId: string
  workspaceId?: string | null
  title?: string | null
  createdAt: number
  expiresAt: number
  isExpired: boolean
  messageCount: number
  lastMessageAt: number
  hasUnsavedChanges: boolean
}

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId?: string
  currentSessionId?: string
  onSelectSession: (sessionId: string, workspaceId?: string) => void
  onNewSession: (workspaceId?: string) => void
}

export function HistoryDialog({
  open,
  onOpenChange,
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

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins} 分钟前`
    if (diffHours < 24) return `${diffHours} 小时前`
    if (diffDays < 7) return `${diffDays} 天前`
    return date.toLocaleDateString('zh-CN')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            对话历史
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Button onClick={handleNewSession} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            新建对话
          </Button>

          <ScrollArea className="h-[300px] pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                加载中...
              </div>
            ) : sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mb-2 opacity-50" />
                <p>暂无历史对话</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => (
                  <div
                    key={session.sessionId}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                      session.isExpired
                        ? 'bg-muted/50 opacity-60'
                        : 'hover:bg-muted cursor-pointer',
                      session.sessionId === currentSessionId &&
                        'border-primary bg-primary/5',
                    )}
                    onClick={() => {
                      onSelectSession(session.sessionId, session.workspaceId || undefined)
                      onOpenChange(false)
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {session.title || formatTime(session.createdAt)}
                        </span>
                        {session.isExpired && (
                          <Badge variant="outline" className="text-orange-500 text-[10px] px-1.5 py-0">
                            <AlertCircle className="h-3 w-3 mr-0.5" />
                            已过期
                          </Badge>
                        )}
                        {session.hasUnsavedChanges && !session.isExpired && (
                          <Badge variant="outline" className="text-yellow-600 text-[10px] px-1.5 py-0">
                            未保存
                          </Badge>
                        )}
                        {session.messageCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            <MessageSquare className="h-3 w-3 mr-0.5" />
                            {session.messageCount}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {session.title ? formatTime(session.createdAt) : `Session: ${session.sessionId.slice(0, 16)}...`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExport(session.sessionId, session.createdAt)
                      }}
                      disabled={exportingId === session.sessionId}
                      title="导出对话"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(session.sessionId)
                      }}
                      disabled={deletingId === session.sessionId}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
