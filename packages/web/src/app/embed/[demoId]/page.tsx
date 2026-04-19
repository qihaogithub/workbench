import { notFound } from 'next/navigation'
import { projectExists } from '@/lib/fs-utils'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'

interface EmbedPageProps {
  params: {
    demoId: string
  }
}

export default function EmbedPage({ params }: EmbedPageProps) {
  const { demoId } = params

  if (!projectExists(demoId)) {
    notFound()
  }

  const iframeUrl = `/embed/${demoId}/iframe`
  const embedCode = `<iframe
  src="${iframeUrl}"
  sandbox="allow-scripts allow-same-origin"
  style="width: 100%; border: none;"
/>`

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-2">嵌入 Demo</h1>
        <p className="text-muted-foreground mb-8">
          将以下 iframe 代码复制到你的页面中即可嵌入此 Demo。
        </p>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-medium mb-2">嵌入代码</h2>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto font-mono">
                {embedCode}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  navigator.clipboard.writeText(embedCode)
                }}
              >
                <Copy className="h-3 w-3 mr-1" />
                复制
              </Button>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium mb-2">预览</h2>
            <div className="border rounded-lg overflow-hidden">
              <iframe
                src={iframeUrl}
                sandbox="allow-scripts allow-same-origin"
                className="w-full"
                style={{ minHeight: '400px' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
