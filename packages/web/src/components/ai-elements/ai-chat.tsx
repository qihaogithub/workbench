'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Conversation,
  ConversationContent,
  Message,
  PromptInput,
  ReasoningDisplay,
  ToolCall,
  type ChatMessage,
} from '@/components/ai-elements'
import { AgentStream, type StreamEvent } from '@opencode-workbench/agent-client'
import { Bot, Sparkles } from 'lucide-react'

interface AIChatProps {
  sessionId: string
  agentSessionId: string
  workingDir?: string
  onCodeUpdate?: (code: string) => void
  onSchemaUpdate?: (schema: string) => void
  onFilesChange?: (files: Array<{ path: string; action: 'created' | 'modified' | 'deleted' }>) => void
}

export function AIChat({
  sessionId,
  agentSessionId,
  workingDir,
  onCodeUpdate,
  onSchemaUpdate,
  onFilesChange,
}: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const streamRef = useRef<AgentStream | null>(null)

  console.log('[AIChat] Props received - workingDir:', workingDir, 'agentSessionId:', agentSessionId)

  // 自动滚动到底部
  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamContent])

  // 清理流
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.close()
      }
    }
  }, [])

  // 处理发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming || !agentSessionId) return

    const userMessage = input.trim()
    setInput('')

    // 添加用户消息
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user',
        content: userMessage,
      },
    ])

    // 创建流式连接
    try {
      setIsStreaming(true)
      setStreamContent('')

      const { getAgentClient } = await import('@/lib/agent-client')
      const agentClient = getAgentClient()

      console.log('[AIChat] Creating WebSocket stream for session:', agentSessionId)

      // 每次发送消息时创建新的流连接
      const stream = agentClient.stream(agentSessionId)
      streamRef.current = stream

      console.log('[AIChat] WebSocket URL:', (stream as any).url)

      let accumulatedContent = ''
      let connectionEstablished = false

      // 监听流事件
      stream.on('stream', (event: StreamEvent) => {
        connectionEstablished = true
        if (event.content) {
          accumulatedContent += event.content
          setStreamContent(accumulatedContent)
        }
      })

      stream.on('finish', async (event: StreamEvent) => {
        // 完成流式响应
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: accumulatedContent || event.content || '抱歉，我没有收到有效的回复。',
        }

        setMessages((prev) => [...prev, assistantMessage])
        setStreamContent('')
        setIsStreaming(false)
        stream.close()
        streamRef.current = null

        // 处理文件变更
        if (event.files && event.files.length > 0) {
          onFilesChange?.(event.files)
        }

        // 尝试从内容中提取代码和 schema 更新
        try {
          const codeMatch = accumulatedContent.match(/```(?:tsx?|typescript|javascript)?\n([\s\S]*?)```/)
          if (codeMatch && onCodeUpdate) {
            onCodeUpdate(codeMatch[1].trim())
          }
        } catch {
          // 忽略解析错误
        }
      })

      stream.on('error', (event: StreamEvent) => {
        // 如果连接未建立且发生错误，降级到非流式模式
        if (!connectionEstablished) {
          console.warn('WebSocket 连接失败，降级到非流式模式')
          stream.close()
          streamRef.current = null
          // 这里不显示错误消息，因为会在 catch 中处理
          return
        }

        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `错误: ${event.error?.message || 'WebSocket 连接失败，请检查 Agent Service 是否运行'}`,
        }
        setMessages((prev) => [...prev, errorMessage])
        setStreamContent('')
        setIsStreaming(false)
        if (streamRef.current) {
          streamRef.current.close()
          streamRef.current = null
        }
      })

      // 等待 WebSocket 连接建立（最多等待 3 秒）
      const connectionTimeout = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket 连接超时'))
        }, 3000)

        const checkConnection = () => {
          const ws = (stream as any).ws
          if (ws?.readyState === WebSocket.OPEN) {
            clearTimeout(timeout)
            stream.off('status', onStatus)
            connectionEstablished = true
            resolve()
          }
        }

        const onStatus = (event: StreamEvent) => {
          if (event.status === 'connected') {
            checkConnection()
          }
        }

        stream.on('status', onStatus)
        
        // 立即检查
        setTimeout(checkConnection, 50)
      })

      await connectionTimeout

      // 发送消息
      console.log('[AIChat] Sending message with workingDir:', workingDir)
      stream.send(userMessage, `msg-${Date.now()}`, {
        timeout: 120000,
        stream: true,
        workingDir,
      })
    } catch (error) {
      // WebSocket 失败，降级到非流式 HTTP
      console.warn('WebSocket 失败，使用非流式模式:', error)
      
      try {
        const { getAgentClient } = await import('@/lib/agent-client')
        const agentClient = getAgentClient()
        
        const result = await agentClient.sendMessage(agentSessionId, userMessage, {
          workingDir,
          options: {
            timeout: 120000,
            stream: false,
          },
        })

        if (!result.success) {
          throw new Error(result.error?.message || 'Agent 请求失败')
        }

        const aiReply = result.data?.content || '抱歉，我没有收到有效的回复。'
        
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: aiReply,
        }

        setMessages((prev) => [...prev, assistantMessage])
        
        // 处理文件变更
        if (result.data?.files && result.data.files.length > 0) {
          onFilesChange?.(result.data.files)
        }

        // 尝试从内容中提取代码和 schema 更新
        try {
          const codeMatch = aiReply.match(/```(?:tsx?|typescript|javascript)?\n([\s\S]*?)```/)
          if (codeMatch && onCodeUpdate) {
            onCodeUpdate(codeMatch[1].trim())
          }
        } catch {
          // 忽略解析错误
        }
      } catch (httpError) {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `错误: ${httpError instanceof Error ? httpError.message : '未知错误'}。请确保 Agent Service 已启动（http://localhost:3001）`,
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsStreaming(false)
        if (streamRef.current) {
          streamRef.current.close()
          streamRef.current = null
        }
      }
    }
  }, [input, isStreaming, agentSessionId, onCodeUpdate, onSchemaUpdate, onFilesChange])

  // 取消流式响应
  const handleCancel = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close()
      streamRef.current = null
    }
    setIsStreaming(false)
    if (streamContent) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: streamContent,
        },
      ])
      setStreamContent('')
    }
  }, [streamContent])

  return (
    <div className="flex flex-col h-full">
      {/* 消息列表 */}
      <Conversation className="flex-1 min-h-0">
        <ConversationContent>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Bot className="h-12 w-12 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">AI 助手</p>
                <p className="text-sm text-muted-foreground">
                  输入自然语言指令，AI 将帮您修改代码
                </p>
              </div>
              <div className="pt-4 space-y-2 text-left max-w-sm">
                <p className="text-xs text-muted-foreground">示例指令：</p>
                <div className="space-y-1">
                  <p className="text-xs bg-muted px-2 py-1 rounded">
                    &quot;把标题改成轮播图&quot;
                  </p>
                  <p className="text-xs bg-muted px-2 py-1 rounded">
                    &quot;添加一个按钮组件&quot;
                  </p>
                  <p className="text-xs bg-muted px-2 py-1 rounded">
                    &quot;修改配色方案为蓝色&quot;
                  </p>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <Message key={msg.id} message={msg} />
          ))}

          {/* 流式响应展示 */}
          {isStreaming && streamContent && (
            <Message
              message={{
                id: 'streaming',
                role: 'assistant',
                content: streamContent,
              }}
            />
          )}

          {/* 加载指示器 */}
          {isStreaming && !streamContent && (
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3 w-fit">
              <div className="flex gap-1">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </ConversationContent>
      </Conversation>

      {/* AI 正在生成状态提示 */}
      {isStreaming && (
        <div className="px-4 py-2 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-t border-primary/20">
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              <div className="absolute inset-0 blur-sm">
                <Sparkles className="h-4 w-4 text-primary/50" />
              </div>
            </div>
            <span className="text-sm font-medium text-primary">AI 正在思考中</span>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      {/* 输入区域 */}
      <PromptInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        onCancel={handleCancel}
        placeholder="输入指令，按 Enter 发送..."
        loading={isStreaming}
        className="flex-shrink-0"
      />
    </div>
  )
}
