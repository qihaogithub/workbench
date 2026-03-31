'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { PreviewPanel, ConfigForm } from '../../../../../components/demo'
import { parseFigmaText, buildFigmaText } from '../../../../../lib/parser'
import { validateAll, ValidationResult, getDefaultValues } from '../../../../../lib/validator'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-provider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ChatBubble, type ChatMessage } from '@/components/ui/chat-bubble'
import { Bot, Code2, Send, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

interface DemoEditPageProps {
  params: {
    id: string
  }
}

export default function DemoEditPage({ params }: DemoEditPageProps) {
  const router = useRouter()
  const { id: demoId } = params
  const { toast } = useToast()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [code, setCode] = useState('')
  const [schema, setSchema] = useState('')
  const [editorContent, setEditorContent] = useState('')

  const [configData, setConfigData] = useState<Record<string, unknown>>({})

  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  })

  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([])
  const [aiInput, setAiInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [sessionId, setSessionId] = useState('')

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [aiMessages, isAiLoading])

  useEffect(() => {
    const loadDemo = async () => {
      try {
        setIsLoading(true)

        const sessionRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demoId }),
        })

        if (!sessionRes.ok) {
          throw new Error('创建 Session 失败')
        }

        const sessionData = await sessionRes.json()
        if (!sessionData.success) {
          throw new Error(sessionData.error?.message || '创建 Session 失败')
        }

        setSessionId(sessionData.data.sessionId)

        const filesRes = await fetch(`/api/sessions/${sessionData.data.sessionId}/files`)
        if (!filesRes.ok) {
          throw new Error('加载文件失败')
        }

        const filesData = await filesRes.json()
        if (!filesData.success) {
          throw new Error(filesData.error?.message || '加载文件失败')
        }

        const loadedCode = filesData.data.code
        const loadedSchema = filesData.data.schema

        setCode(loadedCode)
        setSchema(loadedSchema)
        setEditorContent(buildFigmaText(loadedCode, loadedSchema))

        const defaults = getDefaultValues(loadedSchema)
        setConfigData(defaults)

        const result = validateAll(loadedCode, loadedSchema)
        setValidationResult(result)
      } catch (error) {
        toast({
          title: '加载失败',
          description: error instanceof Error ? error.message : '未知错误',
          variant: 'destructive',
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadDemo()
  }, [demoId, toast])

  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value)

    const parsed = parseFigmaText(value)

    if (!parsed.success) {
      setValidationResult({
        isValid: false,
        errors: [
          {
            type: 'json_syntax',
            message: parsed.error || '解析错误',
          },
        ],
      })
      return
    }

    setCode(parsed.code)
    setSchema(parsed.schema)

    const result = validateAll(parsed.code, parsed.schema)
    setValidationResult(result)

    const defaults = getDefaultValues(parsed.schema)
    setConfigData((prev) => ({ ...defaults, ...prev }))
  }, [])

  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    setConfigData(data)
  }, [])

  const handleSave = async () => {
    if (!validationResult.isValid) {
      toast({
        title: '保存失败',
        description: '请修复所有错误后再保存',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsSaving(true)

      const saveRes = await fetch(`/api/sessions/${sessionId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, schema }),
      })

      if (!saveRes.ok) {
        throw new Error('保存文件失败')
      }

      const mergeRes = await fetch(`/api/sessions/${sessionId}/merge`, {
        method: 'POST',
      })

      if (!mergeRes.ok) {
        throw new Error('合并到 Demo 失败')
      }

      toast({
        title: '保存成功',
        description: 'Demo 已更新',
      })

      router.push('/')
    } catch (error) {
      toast({
        title: '保存失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = async () => {
    try {
      if (sessionId) {
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'DELETE',
        })
      }
    } catch {
      // ignore
    }
    router.push('/')
  }

  const handleAiSend = async () => {
    if (!aiInput.trim() || isAiLoading) return

    const userMessage = aiInput.trim()
    setAiInput('')
    setAiMessages((prev) => [...prev, { role: 'user', content: userMessage }])
    setIsAiLoading(true)

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          sessionId,
          demoId,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error?.message || 'AI 请求失败')
      }

      const aiReply = result.data.aiReply || '抱歉，我没有收到有效的回复。'

      setAiMessages((prev) => [
        ...prev,
        { role: 'assistant', content: aiReply },
      ])

      if (result.data.code) {
        setCode(result.data.code)
      }
      if (result.data.schema) {
        setSchema(result.data.schema)
        setEditorContent(buildFigmaText(result.data.code || code, result.data.schema))
      }
    } catch (error) {
      toast({
        title: 'AI 请求失败',
        description: error instanceof Error ? error.message : '未知错误',
        variant: 'destructive',
      })
      setAiMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `错误: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      ])
    } finally {
      setIsAiLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">编辑 Demo</h1>
          <Badge variant="secondary">{demoId.slice(0, 8)}</Badge>
          {sessionId && (
            <Badge variant="outline" className="font-mono text-xs">
              Session: {sessionId.slice(0, 8)}...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={!validationResult.isValid || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              '保存'
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[320px] flex flex-col border-r bg-card">
          <Tabs defaultValue="ai" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b px-2 h-12 bg-transparent">
              <TabsTrigger value="ai" className="gap-2">
                <Bot className="h-4 w-4" />
                AI 对话
              </TabsTrigger>
              <TabsTrigger value="code" className="gap-2">
                <Code2 className="h-4 w-4" />
                代码编辑
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai" className="flex-1 flex flex-col m-0">
              <ScrollArea className="flex-1 px-4">
                <div className="space-y-4 py-4">
                  {aiMessages.length === 0 && (
                    <div className="text-center py-8 space-y-3">
                      <div className="flex justify-center">
                        <div className="p-3 rounded-full bg-primary/10">
                          <Bot className="h-8 w-8 text-primary" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">AI 助手</p>
                        <p className="text-xs text-muted-foreground">
                          输入自然语言指令，AI 将帮您修改代码
                        </p>
                      </div>
                      <div className="pt-2 space-y-2 text-left">
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
                  {aiMessages.map((msg, idx) => (
                    <ChatBubble key={idx} message={msg} />
                  ))}
                  {isAiLoading && (
                    <div className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-purple-600">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                        <div className="flex gap-1">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" />
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce delay-100" />
                          <div className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce delay-200" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleAiSend()
                      }
                    }}
                    placeholder="输入指令，按 Enter 发送..."
                    className="min-h-[80px] resize-none"
                    disabled={isAiLoading}
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <Button
                    onClick={handleAiSend}
                    disabled={!aiInput.trim() || isAiLoading}
                    size="sm"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    发送
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="code" className="flex-1 flex flex-col m-0">
              <div className="flex-1 relative">
                <Textarea
                  value={editorContent}
                  onChange={(e) => handleEditorChange(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full resize-none outline-none font-mono text-sm bg-zinc-950 text-zinc-100 border-0 rounded-none"
                  style={{ tabSize: 2 }}
                  placeholder={`${'=== DEMO CODE ==='}
// 在此处粘贴 React 组件代码

${'=== DEMO SCHEMA ==='}
// 在此处粘贴 JSON Schema 配置

${'=== END ==='}`}
                />
              </div>

              {validationResult.errors.length > 0 && (
                <ScrollArea className="h-[120px] border-t bg-destructive/5">
                  <div className="p-3 space-y-2">
                    {validationResult.errors.map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-xs"
                      >
                        <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                        <span className="text-destructive">
                          {error.type === 'json_syntax'
                            ? '[语法]'
                            : error.type === 'props_mismatch'
                            ? '[不匹配]'
                            : error.type === 'required_missing'
                            ? '[必填]'
                            : '[警告]'}
                          {' '}{error.message}
                          {error.line && ` (第 ${error.line} 行)`}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <div className="px-4 py-2 border-t bg-muted/50 flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>{editorContent.length} 字符</span>
                  <span>{editorContent.split('\n').length} 行</span>
                </div>
                <div className="flex items-center gap-1">
                  {validationResult.isValid ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      <span className="text-green-500">有效</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-destructive" />
                      <span className="text-destructive">
                        {validationResult.errors.length} 个错误
                      </span>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex-1 p-4 bg-muted/30">
          <div className="h-full border rounded-lg overflow-hidden bg-background shadow-sm">
            <PreviewPanel code={code} configData={configData} />
          </div>
        </div>

        <div className="w-[300px] border-l bg-card flex flex-col">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-medium">配置面板</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              修改配置项，预览区将实时更新
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              <ConfigForm
                schema={schema}
                onChange={handleConfigChange}
                initialData={configData}
              />
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  )
}
