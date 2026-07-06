/**
 * Markdown Code Block 格式解析器单元测试
 */

import {
  parseFigmaMarkdown,
  buildFigmaMarkdown,
  isFigmaMarkdownFormat,
} from '../markdown-parser'

describe('parseFigmaMarkdown', () => {
  it('应正确解析标准 Markdown Code Block 格式', () => {
    const input = `# Workbench Export

## Component Code

\`\`\`tsx
import React from 'react';

interface DemoProps {
  title: string;
}

export default function Demo({ title }: DemoProps) {
  return <h1>{title}</h1>;
}
\`\`\`

## Schema Config

\`\`\`json
{
  "type": "object",
  "properties": {
    "title": { "type": "string", "default": "" }
  }
}
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(true)
    expect(result.code).toContain("import React from 'react'")
    expect(result.code).toContain("interface DemoProps")
    expect(result.code).toContain("export default function Demo")
    expect(result.schema).toContain('"type": "object"')
    expect(result.schema).toContain('"title"')
  })

  it('应处理缺少主标题的情况', () => {
    const input = `## Component Code

\`\`\`tsx
const hello = "world";
\`\`\`

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(true)
    expect(result.code).toBe('const hello = "world";')
    expect(result.schema).toBe('{"type": "object"}')
  })

  it('应处理缺失 Component Code 区块的情况', () => {
    const input = `# Workbench Export

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Component Code')
  })

  it('应处理缺失 Schema Config 区块的情况', () => {
    const input = `# Workbench Export

## Component Code

\`\`\`tsx
const hello = "world";
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Schema Config')
  })

  it('应处理区块顺序错误的情况', () => {
    const input = `## Schema Config

\`\`\`json
{"type": "object"}
\`\`\`

## Component Code

\`\`\`tsx
const hello = "world";
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('顺序错误')
  })

  it('应处理空的代码块内容', () => {
    const input = `## Component Code

\`\`\`tsx
\`\`\`

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Component Code')
  })

  it('应处理 Schema JSON 语法错误', () => {
    const input = `## Component Code

\`\`\`tsx
const hello = "world";
\`\`\`

## Schema Config

\`\`\`json
{ invalid json }
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('JSON')
  })

  it('应处理带 JSDoc 注释的组件代码', () => {
    const input = `# Workbench Export

## Component Code

\`\`\`tsx
import React from 'react';

interface BannerDemoProps {
  /**
   * @title 顶部 Banner 图
   * @format uri
   * @widget image-upload
   */
  banner: string;
  /**
   * @title 活动标题
   */
  title: string;
}

export default function BannerDemo({ banner, title }: BannerDemoProps) {
  return (
    <div>
      <img src={banner} />
      <h1>{title}</h1>
    </div>
  );
}
\`\`\`

## Schema Config

\`\`\`json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Demo 配置",
  "type": "object",
  "properties": {
    "banner": {
      "type": "string",
      "format": "uri",
      "title": "顶部 Banner 图",
      "default": "",
      "ui:widget": "file",
      "ui:options": { "accept": "image/*" }
    },
    "title": {
      "type": "string",
      "title": "活动标题",
      "default": ""
    }
  },
  "required": ["banner", "title"]
}
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(true)
    expect(result.code).toContain('@title 顶部 Banner 图')
    expect(result.code).toContain('@widget image-upload')
    expect(result.schema).toContain('"ui:widget": "file"')
    expect(result.schema).toContain('"accept": "image/*"')
  })

  it('应处理包含多个代码块的复杂内容（仅提取第一个）', () => {
    const input = `# Workbench Export

## Component Code

\`\`\`tsx
const main = "component";
\`\`\`

一些说明文字

\`\`\`tsx
const extra = "should not be extracted";
\`\`\`

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(true)
    expect(result.code).toContain('const main = "component"')
    expect(result.code).not.toContain('should not be extracted')
  })

  it('应去除代码块前后的空白字符', () => {
    const input = `## Component Code

\`\`\`tsx

  const hello = "world";

\`\`\`

## Schema Config

\`\`\`json

  {"type": "object"}

\`\`\``

    const result = parseFigmaMarkdown(input)

    expect(result.success).toBe(true)
    expect(result.code).toBe('const hello = "world";')
    expect(result.schema).toBe('{"type": "object"}')
  })
})

describe('buildFigmaMarkdown', () => {
  it('应正确构建 Markdown Code Block 格式', () => {
    const code = `import React from 'react';

export default function Demo() {
  return <div>Hello</div>;
}`

    const schema = `{
  "type": "object",
  "properties": {
    "title": { "type": "string" }
  }
}`

    const result = buildFigmaMarkdown(code, schema)

    expect(result).toContain('# Workbench Export')
    expect(result).toContain('## Component Code')
    expect(result).toContain('```tsx')
    expect(result).toContain('```json')
    expect(result).toContain("import React from 'react'")
    expect(result).toContain('"type": "object"')
  })

  it('构建的格式应能被 parseFigmaMarkdown 正确解析', () => {
    const code = `interface TestProps { name: string }

export default function Test({ name }: TestProps) {
  return <span>{name}</span>;
}`

    const schema = `{
  "type": "object",
  "properties": {
    "name": { "type": "string", "default": "" }
  }
}`

    const built = buildFigmaMarkdown(code, schema)
    const parsed = parseFigmaMarkdown(built)

    expect(parsed.success).toBe(true)
    expect(parsed.code).toBe(code)
    expect(parsed.schema).toBe(schema)
  })

  it('应自动去除代码和 Schema 的首尾空白', () => {
    const code = '\n  const x = 1;\n  \n'
    const schema = '\n  {"type": "object"}\n  '

    const result = buildFigmaMarkdown(code, schema)
    const parsed = parseFigmaMarkdown(result)

    expect(parsed.success).toBe(true)
    expect(parsed.code).toBe('const x = 1;')
    expect(parsed.schema).toBe('{"type": "object"}')
  })
})

describe('isFigmaMarkdownFormat', () => {
  it('应识别标准 Markdown Code Block 格式', () => {
    const input = `# Workbench Export

## Component Code

\`\`\`tsx
const x = 1;
\`\`\`

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    expect(isFigmaMarkdownFormat(input)).toBe(true)
  })

  it('即使缺少主标题也应识别为有效格式', () => {
    const input = `## Component Code

\`\`\`tsx
const x = 1;
\`\`\`

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    expect(isFigmaMarkdownFormat(input)).toBe(true)
  })

  it('应拒绝缺少 Component Code 区块的文本', () => {
    const input = `# Workbench Export

## Schema Config

\`\`\`json
{"type": "object"}
\`\`\``

    expect(isFigmaMarkdownFormat(input)).toBe(false)
  })

  it('应拒绝缺少 Schema Config 区块的文本', () => {
    const input = `## Component Code

\`\`\`tsx
const x = 1;
\`\`\``

    expect(isFigmaMarkdownFormat(input)).toBe(false)
  })

  it('应拒绝区块顺序错误的文本', () => {
    const input = `## Schema Config

\`\`\`json
{"type": "object"}
\`\`\`

## Component Code

\`\`\`tsx
const x = 1;
\`\`\``

    expect(isFigmaMarkdownFormat(input)).toBe(false)
  })

  it('应拒绝不符合格式的普通文本', () => {
    expect(isFigmaMarkdownFormat('hello world')).toBe(false)
    expect(isFigmaMarkdownFormat('')).toBe(false)
    expect(isFigmaMarkdownFormat('```tsx\nconst x = 1;\n```')).toBe(false)
  })
})
