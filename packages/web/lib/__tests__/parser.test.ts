/**
 * 混合格式解析器单元测试
 */

import {
  parseFigmaText,
  buildFigmaText,
  isValidFigmaFormat,
  fixFigmaTextFormat,
} from '../parser'

describe('parseFigmaText', () => {
  it('应正确解析标准格式文本', () => {
    const input = `=== DEMO CODE ===
import React from 'react';

export default function Demo() {
  return <div>Hello</div>;
}
=== DEMO SCHEMA ===
{
  "type": "object",
  "properties": {
    "title": { "type": "string" }
  }
}
=== END ===`

    const result = parseFigmaText(input)

    expect(result.success).toBe(true)
    expect(result.code).toContain("import React from 'react'")
    expect(result.schema).toContain('"type": "object"')
  })

  it('应处理缺少 END 分隔符的情况', () => {
    const input = `=== DEMO CODE ===
console.log('hello');
=== DEMO SCHEMA ===
{"type": "object"}`

    const result = parseFigmaText(input)

    expect(result.success).toBe(true)
    expect(result.code).toBe("console.log('hello');")
    expect(result.schema).toBe('{"type": "object"}')
  })

  it('应处理缺失 CODE 分隔符的情况', () => {
    const input = 'invalid content without markers'

    const result = parseFigmaText(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('=== DEMO CODE ===')
  })

  it('应处理缺失 SCHEMA 分隔符的情况', () => {
    const input = `=== DEMO CODE ===
console.log('hello');`

    const result = parseFigmaText(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('=== DEMO SCHEMA ===')
  })

  it('应处理分隔符顺序错误的情况', () => {
    const input = `=== DEMO SCHEMA ===
{"type": "object"}
=== DEMO CODE ===
console.log('hello');`

    const result = parseFigmaText(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('顺序错误')
  })

  it('应处理空的 CODE 部分', () => {
    const input = `=== DEMO CODE ===
=== DEMO SCHEMA ===
{"type": "object"}
=== END ===`

    const result = parseFigmaText(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('CODE 部分不能为空')
  })

  it('应处理空的 SCHEMA 部分', () => {
    const input = `=== DEMO CODE ===
console.log('hello');
=== DEMO SCHEMA ===
=== END ===`

    const result = parseFigmaText(input)

    expect(result.success).toBe(false)
    expect(result.error).toContain('SCHEMA 部分不能为空')
  })

  it('应正确去除首尾空白字符', () => {
    const input = `
    === DEMO CODE ===
    code here
    === DEMO SCHEMA ===
    {"type": "object"}
    === END ===
    `

    const result = parseFigmaText(input)

    expect(result.success).toBe(true)
    expect(result.code).toBe('code here')
  })
})

describe('buildFigmaText', () => {
  it('应正确拼接 code 和 schema', () => {
    const code = "console.log('hello');"
    const schema = '{"type": "object"}'

    const result = buildFigmaText(code, schema)

    expect(result).toContain('=== DEMO CODE ===')
    expect(result).toContain(code)
    expect(result).toContain('=== DEMO SCHEMA ===')
    expect(result).toContain(schema)
    expect(result).toContain('=== END ===')
  })

  it('应去除 code 和 schema 的首尾空白', () => {
    const code = '  code here  '
    const schema = '  {"type": "object"}  '

    const result = buildFigmaText(code, schema)

    expect(result).toContain('code here')
    expect(result).toContain('{"type": "object"}')
    expect(result).not.toContain('  code here  ')
  })
})

describe('isValidFigmaFormat', () => {
  it('应识别有效的格式', () => {
    const input = `=== DEMO CODE ===
code
=== DEMO SCHEMA ===
schema`

    expect(isValidFigmaFormat(input)).toBe(true)
  })

  it('应识别缺少 CODE 分隔符的无效格式', () => {
    const input = '=== DEMO SCHEMA ===\nschema'

    expect(isValidFigmaFormat(input)).toBe(false)
  })

  it('应识别缺少 SCHEMA 分隔符的无效格式', () => {
    const input = '=== DEMO CODE ===\ncode'

    expect(isValidFigmaFormat(input)).toBe(false)
  })

  it('应识别顺序错误的无效格式', () => {
    const input = `=== DEMO SCHEMA ===
schema
=== DEMO CODE ===
code`

    expect(isValidFigmaFormat(input)).toBe(false)
  })
})

describe('fixFigmaTextFormat', () => {
  it('应统一换行符', () => {
    const input = 'line1\r\nline2\rline3'

    const result = fixFigmaTextFormat(input)

    expect(result).not.toContain('\r\n')
    expect(result).not.toContain('\r')
  })

  it('应尝试修复缺少分隔符的格式', () => {
    const input = `import React from 'react';

export default function Demo() {
  return <div>Hello</div>;
}
{
  "type": "object",
  "properties": {}
}`

    const result = fixFigmaTextFormat(input)

    // 应该尝试添加分隔符
    expect(result).toContain('=== DEMO CODE ===')
    expect(result).toContain('=== DEMO SCHEMA ===')
  })
})
