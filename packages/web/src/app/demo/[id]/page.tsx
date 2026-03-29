'use client'

import { MainLayout } from '@/components/layout/main-layout'

interface DemoUsePageProps {
  params: {
    id: string
  }
}

export default function DemoUsePage({ params }: DemoUsePageProps) {
  return (
    <MainLayout
      breadcrumbs={[
        { label: '首页', href: '/' },
        { label: `Demo ${params.id}` },
        { label: '使用' },
      ]}
    >
      <div className="flex items-center justify-center min-h-[600px] border-2 border-dashed rounded-lg">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-muted-foreground">
            Demo 使用页面
          </h2>
          <p className="text-muted-foreground mt-2">
            此页面由任务C负责开发
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Demo ID: {params.id}
          </p>
        </div>
      </div>
    </MainLayout>
  )
}
