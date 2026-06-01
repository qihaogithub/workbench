import { notFound } from 'next/navigation'
import fs from 'fs'
import path from 'path'
import {
  projectExists,
  getProjectPath,
  listDemoPages,
  getDemoDirPath,
  getDataDir,
} from '@/lib/fs-utils'
import { mergeConfigToProps } from '@/lib/runtime-props'
import { EmbedPageContent } from './EmbedConfigPanel'

interface EmbedPageProps {
  params: {
    demoId: string
  }
}

function extractSchemaDefaults(schemaContent: string): Record<string, unknown> {
  try {
    const schema = JSON.parse(schemaContent)
    const defaults: Record<string, unknown> = {}
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        const p = prop as Record<string, unknown>
        if (p.default !== undefined) {
          defaults[key] = p.default
        }
      }
    }
    return defaults
  } catch {
    return {}
  }
}

export default function EmbedPage({ params }: EmbedPageProps) {
  const { demoId } = params

  if (!projectExists(demoId)) {
    notFound()
  }

  const projectPath = getProjectPath(demoId)
  const workspacePath = path.join(projectPath, 'workspace')

  const publishedJsonPath = path.join(getDataDir(), 'published', demoId, 'project.json')
  if (fs.existsSync(publishedJsonPath)) {
    try {
      const published = JSON.parse(fs.readFileSync(publishedJsonPath, 'utf-8'))
      const publishedPages: Array<{
        id: string
        name: string
        schemaPath?: string
        iframeHtmlPath?: string
        embedCode?: string
      }> = published.demoPages || []

      if (publishedPages.length > 0) {
        const viewerBaseUrl = process.env.VIEWER_LAN_URL || process.env.VIEWER_CLOUDFLARE_URL || ''
        const projectConfigSchemaPath = path.join(getDataDir(), 'published', demoId, 'config-schema.json')
        const projectConfigSchema = fs.existsSync(projectConfigSchemaPath)
          ? fs.readFileSync(projectConfigSchemaPath, 'utf-8')
          : undefined

        if (publishedPages.length === 1) {
          const page = publishedPages[0]
          const publishedSchemaPath = page.schemaPath
            ? path.join(getDataDir(), 'published', demoId, page.schemaPath)
            : ''
          const schema = fs.existsSync(publishedSchemaPath)
            ? fs.readFileSync(publishedSchemaPath, 'utf-8')
            : '{}'

          const iframeUrl = viewerBaseUrl
            ? `${viewerBaseUrl}/data/${demoId}/${page.iframeHtmlPath || `demos/${page.id}/iframe.html`}`
            : `/${page.iframeHtmlPath || `demos/${page.id}/iframe.html`}`

          const mergedConfigData = mergeConfigToProps(projectConfigSchema, schema)

          return (
            <EmbedPageContent
              embedCode={page.embedCode || ''}
              iframeUrl={iframeUrl}
              schema={schema}
              projectConfigSchema={projectConfigSchema}
              initialConfigData={mergedConfigData}
            />
          )
        }

        const projectConfigData = projectConfigSchema
          ? extractSchemaDefaults(projectConfigSchema)
          : {}

        const pages = publishedPages.map((page) => {
          const publishedSchemaPath = page.schemaPath
            ? path.join(getDataDir(), 'published', demoId, page.schemaPath)
            : ''
          const pageSchema = fs.existsSync(publishedSchemaPath)
            ? fs.readFileSync(publishedSchemaPath, 'utf-8')
            : '{}'

          let pageConfigData: Record<string, unknown> = {}
          try {
            pageConfigData = mergeConfigToProps(projectConfigSchema, pageSchema)
          } catch {}

          const iframeUrl = viewerBaseUrl
            ? `${viewerBaseUrl}/data/${demoId}/${page.iframeHtmlPath || `demos/${page.id}/iframe.html`}`
            : `/${page.iframeHtmlPath || `demos/${page.id}/iframe.html`}`

          return {
            id: page.id,
            name: page.name,
            schema: pageSchema,
            iframeUrl,
            initialConfigData: pageConfigData,
          }
        })

        return (
          <EmbedPageContent
            embedCode={publishedPages[0]?.embedCode || ''}
            iframeUrl=""
            schema="{}"
            projectConfigSchema={projectConfigSchema}
            initialConfigData={projectConfigData}
            projectConfigData={projectConfigData}
            pages={pages}
          />
        )
      }
    } catch {
      // 解析失败，回退到未发布逻辑
    }
  }

  const iframeUrl = `/api/embed/${demoId}/iframe`
  const embedCode = `<iframe
  src="${iframeUrl}"
  sandbox="allow-scripts allow-same-origin"
  style="width: 100%; border: none;"
/>`

  const schemaPath = path.join(workspacePath, 'config.schema.json')
  const projectSchemaPath = path.join(workspacePath, 'project.config.schema.json')

  const projectConfigSchema = fs.existsSync(projectSchemaPath)
    ? fs.readFileSync(projectSchemaPath, 'utf-8')
    : undefined

  const demoPages = listDemoPages(workspacePath)

  if (demoPages.length > 1) {
    const projectConfigData: Record<string, unknown> = {}
    if (projectConfigSchema) {
      try {
        const parsed = JSON.parse(projectConfigSchema)
        if (parsed.properties) {
          for (const [key, prop] of Object.entries(parsed.properties)) {
            const p = prop as Record<string, unknown>
            if (p.default !== undefined) {
              projectConfigData[key] = p.default
            }
          }
        }
      } catch {}
    }

    const pages = demoPages.map((meta) => {
      const demoDir = getDemoDirPath(workspacePath, meta.id)
      const pageSchemaPath = path.join(demoDir, 'config.schema.json')
      const pageSchema = fs.existsSync(pageSchemaPath)
        ? fs.readFileSync(pageSchemaPath, 'utf-8')
        : '{}'

      let pageConfigData: Record<string, unknown> = {}
      try {
        pageConfigData = mergeConfigToProps(
          projectConfigSchema,
          pageSchema
        )
      } catch {}

      return {
        id: meta.id,
        name: meta.name,
        schema: pageSchema,
        iframeUrl: `/api/embed/${demoId}/iframe?page=${encodeURIComponent(meta.id)}`,
        initialConfigData: pageConfigData,
      }
    })

    return (
      <EmbedPageContent
        embedCode={embedCode}
        iframeUrl=""
        schema="{}"
        projectConfigSchema={projectConfigSchema}
        initialConfigData={projectConfigData}
        projectConfigData={projectConfigData}
        pages={pages}
      />
    )
  }

  const schema = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, 'utf-8')
    : '{}'

  const mergedConfigData = mergeConfigToProps(projectConfigSchema, schema)

  return (
    <EmbedPageContent
      embedCode={embedCode}
      iframeUrl={iframeUrl}
      schema={schema}
      projectConfigSchema={projectConfigSchema}
      initialConfigData={mergedConfigData}
    />
  )
}