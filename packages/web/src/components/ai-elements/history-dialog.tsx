'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trash2, Plus, Clock, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SessionItem {
  sessionId: string
  demoId: string
  createdAt: number
  expiresAt: number
  isExpired: boolean
}

interface HistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  currentSessionId?: string
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
}

export function HistoryDialog({
  open,
  onOpenChange,
  projectId,
  currentSessionId,
  onSelectSession,
  onNewSession,
}: HistoryDialogProps) {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const handleNewSession = () => {
    onNewSession()
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
                      if (!session.isExpired) {
                        onSelectSession(session.sessionId)
                        onOpenChange(false)
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {formatTime(session.createdAt)}
                        </span>
                        {session.isExpired && (
                          <span className="flex items-center gap-1 text-xs text-orange-500">
                            <AlertCircle className="h-3 w-3" />
                            已过期
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Session: {session.sessionId.slice(0, 16)}...
                      </p>
                    </div>
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
