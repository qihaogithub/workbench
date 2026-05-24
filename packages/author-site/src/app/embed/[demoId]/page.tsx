import { notFound } from 'next/navigation'
import fs from 'fs'
import path from 'path'
import {
  projectExists,
  getProjectPath,
  listDemoPages,
  getDemoDirPath,
} from '@/lib/fs-utils'
import { mergeConfigToProps } from '@/lib/runtime-props'
import { EmbedPageContent } from './EmbedConfigPanel'

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

  const projectPath = getProjectPath(demoId)
  const workspacePath = path.join(projectPath, 'workspace')
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