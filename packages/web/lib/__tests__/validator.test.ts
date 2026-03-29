/**
 * 一致性校验服务单元测试
 */

import {
  validateJsonSyntax,
  validatePropsSchema,
  validateAll,
  isValidJson,
  getDefaultValues,
} from '../validator'

describe('validateJsonSyntax', () => {
  it('应验证有效的 JSON', () => {
    const schema = '{"type": "object"}'
    const result = validateJsonSyntax(schema)

    expect(result).toBeNull()
  })

  it('应检测出 JSON 语法错误', () => {
    const schema = '{"type": "object",}'
    const result = validateJsonSyntax(schema)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('json_syntax')
    expect(result?.message).toContain('JSON 语法错误')
  })

  it('应检测出缺少闭合括号', () => {
    const schema = '{"type": "object"'
    const result = validateJsonSyntax(schema)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('json_syntax')
  })

  it('应检测出无效的 JSON 格式', () => {
    const schema = 'not json at all'
    const result = validateJsonSyntax(schema)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('json_syntax')
  })
})

describe('validatePropsSchema', () => {
  it('应通过一致的 Props 和 Schema', () => {
    const code = `
interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return <div>{title}</div>;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors).toHaveLength(0)
  })

  it('应检测出 Props 与 Schema 不一致', () => {
    const code = `
interface DemoProps {
  title: string;
  count: number;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((e) => e.type === 'props_mismatch')).toBe(true)
  })

  it('应检测出代码中的 props 未在 Schema 中定义', () => {
    const code = `
interface DemoProps {
  title: string;
  extraProp: string;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors.some((e) => e.message.includes('extraProp'))).toBe(true)
  })

  it('应检测出 Schema 中的 property 未在代码中定义', () => {
    const code = `
interface DemoProps {
  title: string;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        missingInCode: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors.some((e) => e.message.includes('missingInCode'))).toBe(true)
  })

  it('应支持 type DemoProps 语法', () => {
    const code = `
type DemoProps = {
  title: string;
  count: number;
};`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        count: { type: 'number' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors).toHaveLength(0)
  })

  it('应支持从函数参数解构中提取 props', () => {
    const code = `
export default function Demo({ title, description }) {
  return <div>{title}</div>;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors).toHaveLength(0)
  })

  it('应支持可选属性标记', () => {
    const code = `
interface DemoProps {
  title: string;
  subtitle?: string;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    expect(errors).toHaveLength(0)
  })

  it('应检测出 required 字段未在 properties 中定义', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title', 'missingRequired'],
    })

    const code = `
interface DemoProps {
  title: string;
}`

    const errors = validatePropsSchema(code, schema)

    expect(errors.some((e) => e.type === 'required_missing')).toBe(true)
    expect(errors.some((e) => e.message.includes('missingRequired'))).toBe(true)
  })

  it('应在找不到 interface 时返回警告', () => {
    const code = `
export default function Demo() {
  return <div>Hello</div>;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    })

    const errors = validatePropsSchema(code, schema)

    // 没有 props 使用，不应该报错
    expect(errors).toHaveLength(0)
  })

  it('应处理空的 properties', () => {
    const code = `
interface DemoProps {}

export default function Demo() {
  return <div>Hello</div>;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {},
    })

    const errors = validatePropsSchema(code, schema)

    // 空 interface 和空 properties 应该是一致的，没有错误
    expect(errors).toHaveLength(0)
  })
})

describe('validateAll', () => {
  it('应返回有效的校验结果', () => {
    const code = `
interface DemoProps {
  title: string;
}

export default function Demo({ title }: DemoProps) {
  return <h1>{title}</h1>;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string', default: 'Hello' },
      },
    })

    const result = validateAll(code, schema)

    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('应返回包含 JSON 语法错误的校验结果', () => {
    const code = 'console.log("hello");'
    const schema = '{invalid json'

    const result = validateAll(code, schema)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.type === 'json_syntax')).toBe(true)
  })

  it('应返回包含 Props 不匹配的校验结果', () => {
    const code = `
interface DemoProps {
  title: string;
  extra: string;
}`

    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    })

    const result = validateAll(code, schema)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.type === 'props_mismatch')).toBe(true)
  })
})

describe('isValidJson', () => {
  it('应返回 true 对于有效的 JSON', () => {
    expect(isValidJson('{"type": "object"}')).toBe(true)
    expect(isValidJson('[]')).toBe(true)
    expect(isValidJson('"string"')).toBe(true)
    expect(isValidJson('123')).toBe(true)
    expect(isValidJson('true')).toBe(true)
    expect(isValidJson('null')).toBe(true)
  })

  it('应返回 false 对于无效的 JSON', () => {
    expect(isValidJson('{invalid}')).toBe(false)
    expect(isValidJson('{"key": }')).toBe(false)
    expect(isValidJson('undefined')).toBe(false)
  })
})

describe('getDefaultValues', () => {
  it('应提取默认值', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string', default: 'Hello World' },
        count: { type: 'number', default: 42 },
        enabled: { type: 'boolean', default: true },
      },
    })

    const defaults = getDefaultValues(schema)

    expect(defaults).toEqual({
      title: 'Hello World',
      count: 42,
      enabled: true,
    })
  })

  it('应处理没有默认值的 schema', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
    })

    const defaults = getDefaultValues(schema)

    expect(defaults).toEqual({})
  })

  it('应处理无效的 JSON', () => {
    const schema = 'invalid json'

    const defaults = getDefaultValues(schema)

    expect(defaults).toEqual({})
  })

  it('应处理空的 properties', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {},
    })

    const defaults = getDefaultValues(schema)

    expect(defaults).toEqual({})
  })
})
