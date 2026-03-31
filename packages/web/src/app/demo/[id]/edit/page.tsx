'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PreviewPanel, ConfigForm } from '../../../../../components/demo'
import { parseFigmaText, buildFigmaText } from '../../../../../lib/parser'
import { validateAll, ValidationResult, getDefaultValues } from '../../../../../lib/validator'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-provider'

interface DemoEditPageProps {
  params: {
    id: string
  }
}

type ActiveTab = 'ai' | 'code'

export default function DemoEditPage({ params }: DemoEditPageProps) {
  const router = useRouter()
  const { id: demoId } = params
  const { toast } = useToast()

  // 当前代码和 Schema
  const [code, setCode] = useState('')
  const [schema, setSchema] = useState('')
  const [editorContent, setEditorContent] = useState('')

  // 配置数据
  const [configData, setConfigData] = useState<Record<string, unknown>>({})

  // 校验结果
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  })

  // 当前激活的 Tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('code')

  // AI 对话相关
  const [aiMessages, setAiMessages] = useState<
    { role: 'user' | 'assistant'; content: string; id?: string }[]
  >([])
  const [aiInput, setAiInput] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)

  // 加载状态
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Session ID
  const [sessionId, setSessionId] = useState('')

  // 加载 Demo 数据
  useEffect(() => {
    const loadDemo = async () => {
      try {
        setIsLoading(true)

        // 1. 创建 Session
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

        // 2. 加载文件内容
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

        // 初始化默认值
        const defaults = getDefaultValues(loadedSchema)
        setConfigData(defaults)

        // 执行初始校验
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
  }, [demoId])

  // 处理编辑器内容变更
  const handleEditorChange = useCallback((value: string) => {
    setEditorContent(value)

    // 解析分隔符格式
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

    // 更新代码和 Schema
    setCode(parsed.code)
    setSchema(parsed.schema)

    // 执行完整校验
    const result = validateAll(parsed.code, parsed.schema)
    setValidationResult(result)

    // 更新配置数据的默认值
    const defaults = getDefaultValues(parsed.schema)
    setConfigData((prev) => ({ ...defaults, ...prev }))
  }, [])

  // 处理配置表单变更
  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    setConfigData(data)
  }, [])

  // 处理保存
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

      // 1. 保存文件到 Session
      const saveRes = await fetch(`/api/sessions/${sessionId}/files`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, schema }),
      })

      if (!saveRes.ok) {
        throw new Error('保存文件失败')
      }

      // 2. 合并到 Demo
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

  // 处理取消
  const handleCancel = async () => {
    try {
      // 删除 Session
      if (sessionId) {
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'DELETE',
        })
      }
    } catch {
      // 忽略删除错误
    }
    router.push('/')
  }

  // 处理 AI 发送消息
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">编辑 Demo</h1>
          <span className="text-sm text-muted-foreground">{demoId}</span>
          {sessionId && (
            <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded">
              Session: {sessionId.slice(0, 8)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={!validationResult.isValid || isSaving}
          >
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* 三栏布局 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：AI 对话区 / 代码编辑区 Tab */}
        <div className="w-1/4 flex flex-col border-r bg-card">
          {/* Tab 切换 */}
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('ai')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'ai'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              AI 对话
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'code'
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              代码编辑
            </button>
          </div>

          {/* Tab 内容 */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'ai' ? (
              <div className="h-full flex flex-col">
                {/* AI 消息列表 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {aiMessages.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      <div className="text-4xl mb-2">🤖</div>
                      <p className="text-sm">输入自然语言指令，AI 将帮您修改代码</p>
                      <p className="text-xs mt-2 text-muted-foreground">
                        例如：&quot;把标题改成轮播图&quot;、&quot;添加一个按钮组件&quot;
                      </p>
                    </div>
                  )}
                  {aiMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isAiLoading && (
                    <div className="flex justify-start">
                      <div className="px-4 py-2 rounded-lg bg-secondary">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-100"></div>
                          <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce delay-200"></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI 输入框 */}
                <div className="p-4 border-t">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiInput}
                      onChange={(e) => setAiInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAiSend()}
                      placeholder="输入指令..."
                      className="flex-1 px-3 py-2 border rounded-md text-sm bg-background"
                    />
                    <Button
                      onClick={handleAiSend}
                      disabled={!aiInput.trim() || isAiLoading}
                      size="sm"
                    >
                      发送
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* 代码编辑器 */}
                <div className="flex-1 relative">
                  <textarea
                    value={editorContent}
                    onChange={(e) => handleEditorChange(e.target.value)}
                    spellCheck={false}
                    className="w-full h-full p-4 resize-none outline-none font-mono text-sm bg-zinc-900 text-zinc-100"
                    style={{ tabSize: 2 }}
                    placeholder={`${'=== DEMO CODE ==='}\n// 在此处粘贴 React 组件代码\n\n${'=== DEMO SCHEMA ==='}\n// 在此处粘贴 JSON Schema 配置\n\n${'=== END ==='}`}
                  />
                </div>

                {/* 错误提示区 */}
                {validationResult.errors.length > 0 && (
                  <div className="max-h-32 overflow-y-auto border-t bg-destructive/10">
                    {validationResult.errors.map((error: { type: string; message: string; line?: number }, index: number) => (
                      <div
                        key={index}
                        className="px-4 py-2 text-xs border-b border-destructive/20 last:border-b-0"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-destructive font-medium shrink-0">
                            {error.type === 'json_syntax'
                              ? '[语法]'
                              : error.type === 'props_mismatch'
                              ? '[不匹配]'
                              : error.type === 'required_missing'
                              ? '[必填]'
                              : '[警告]'}
                          </span>
                          <span className="text-destructive/90">
                            {error.message}
                            {error.line && (
                              <span className="text-destructive/70 ml-1">
                                (第 {error.line} 行)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 底部信息栏 */}
                <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span>{editorContent.length} 字符</span>
                    <span>{editorContent.split('\n').length} 行</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {validationResult.isValid ? (
                      <span className="text-green-600 dark:text-green-400">✓ 有效</span>
                    ) : (
                      <span className="text-destructive">✗ {validationResult.errors.length} 个错误</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 中间：预览区 */}
        <div className="w-1/2 p-4 bg-muted/50">
          <PreviewPanel code={code} configData={configData} />
        </div>

        {/* 右侧：配置面板 */}
        <div className="w-1/4 border-l bg-card flex flex-col">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-medium">配置面板</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ConfigForm
              schema={schema}
              onChange={handleConfigChange}
              initialData={configData}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
