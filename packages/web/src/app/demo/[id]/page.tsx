'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { MainLayout } from '@/components/layout/main-layout'
import { PreviewPanel, ConfigForm } from '../../../../components/demo'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast-provider'
import { getDefaultValues, getPreviewSize } from '../../../../lib/validator'

interface DemoUsePageProps {
  params: {
    id: string
  }
}

export default function DemoUsePage({ params }: DemoUsePageProps) {
  const router = useRouter()
  const { id: demoId } = params
  const { toast } = useToast()

  const [code, setCode] = useState('')
  const [schema, setSchema] = useState('')
  const [configData, setConfigData] = useState<Record<string, unknown>>({})
  const [previewSize, setPreviewSize] = useState<import('../../../../components/demo/types').PreviewSize>()
  const [isLoading, setIsLoading] = useState(true)
  const [demoName, setDemoName] = useState('')

  // 加载 Demo 数据
  useEffect(() => {
    const loadDemo = async () => {
      try {
        setIsLoading(true)

        // 1. 获取 Demo 列表以获取名称
        const demosRes = await fetch('/api/demos')
        const demosData = await demosRes.json()
        if (demosData.success) {
          const demo = demosData.data.find((d: { id: string; name: string }) => d.id === demoId)
          if (demo) {
            setDemoName(demo.name)
          }
        }

        // 2. 创建临时 Session 来读取文件
        const sessionRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demoId }),
        })

        if (!sessionRes.ok) {
          throw new Error('加载 Demo 失败')
        }

        const sessionData = await sessionRes.json()
        if (!sessionData.success) {
          throw new Error(sessionData.error?.message || '加载 Demo 失败')
        }

        // 3. 加载文件内容
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

        // 初始化默认值
        const defaults = getDefaultValues(loadedSchema)
        setConfigData(defaults)

        // 解析预览尺寸配置
        const size = getPreviewSize(loadedSchema)
        setPreviewSize(size)

        // 4. 清理临时 Session（使用页面不需要保持 Session）
        await fetch(`/api/sessions/${sessionData.data.sessionId}`, {
          method: 'DELETE',
        })
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

  const handleConfigChange = useCallback((data: Record<string, unknown>) => {
    setConfigData(data)
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回首页
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">{demoName || 'Demo'}</h1>
          <span className="text-sm text-muted-foreground">{demoId}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/demo/${demoId}/edit`}>
            <Button>
              <Pencil className="h-4 w-4 mr-2" />
              编辑 Demo
            </Button>
          </Link>
        </div>
      </div>

      {/* 两栏布局：预览区 + 配置面板 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：预览区 */}
        <div className="w-2/3 p-4 bg-muted/50">
          <div className="h-full border rounded-lg overflow-hidden bg-background">
            <PreviewPanel code={code} configData={configData} previewSize={previewSize} />
          </div>
        </div>

        {/* 右侧：配置面板 */}
        <div className="w-1/3 border-l bg-card flex flex-col">
          <div className="px-4 py-3 border-b">
            <h2 className="text-sm font-medium">配置面板</h2>
            <p className="text-xs text-muted-foreground mt-1">
              修改配置项，预览区将实时更新
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
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
