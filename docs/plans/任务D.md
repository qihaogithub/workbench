## 任务 D：AI 混合代码编辑器与一致性校验
**目标**：开发"AI 编辑工作台"中的代码编辑器（支持双向解析）和前后端一致性校验逻辑。
**前置说明**：这是整个项目最复杂的前端业务逻辑，独立于应用骨架进行开发，最终以纯组件形式接入 `/demo/[id]/edit`。

### 1. 核心职责
*   **混合格式解析器 (`utils/parser.ts`)**：
    *   实现 `parseFigmaText(text: string)`：将带有 `=== DEMO CODE ===`、`=== DEMO SCHEMA ===` 和 `=== END ===` 的大文本拆分为 `code` 和 `schema` 两个字符串。
    *   实现 `buildFigmaText(code: string, schema: string)`：将内容拼接为上述统一分隔符格式。
*   **代码编辑区 (`<CodeEditor />`)**：
    *   集成 Monaco Editor 或简单高亮编辑器。
    *   用户在编辑器中看到的是拼接后的**单文本**，编辑后自动防抖（debounce）调用 `parseFigmaText` 更新到内部状态。
*   **一致性校验服务 (`utils/validator.ts`)**：
    *   校验 1：Schema 语法是否为合法 JSON。
    *   校验 2：通过简单的正则或 AST 解析 React `interface DemoProps` 中的属性，校验其是否与 Schema 的 `properties` 键名对齐。
    *   返回校验报告：`{ isValid: boolean; errors: ValidationError[] }`。

### 2. 组件接口定义

```typescript
// 校验错误结构
interface ValidationError {
  type: 'json_syntax' | 'props_mismatch' | 'required_missing';
  message: string;
  line?: number;
}

// 校验报告
interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// 代码编辑器 Props
interface CodeEditorProps {
  initialCode: string;
  initialSchema: string;
  onChange: (code: string, schema: string) => void;
  onValidationChange: (result: ValidationResult) => void;
  debounceMs?: number;
}

// 解析器返回值
interface ParsedContent {
  code: string;
  schema: string;
  success: boolean;
  error?: string;
}
```

### 3. 解析器实现规范

#### parseFigmaText 函数
```typescript
function parseFigmaText(text: string): ParsedContent {
  // 1. 使用正则匹配分隔符
  // 2. 提取 CODE 和 SCHEMA 内容
  // 3. 验证格式完整性（是否包含所有必需分隔符）
  // 4. 返回解析结果
}
```

#### buildFigmaText 函数
```typescript
function buildFigmaText(code: string, schema: string): string {
  // 按照标准格式拼接：
  // === DEMO CODE ===
  // {code}
  // === DEMO SCHEMA ===
  // {schema}
  // === END ===
}
```

### 4. 校验器实现规范

#### JSON Schema 语法校验
```typescript
function validateJsonSyntax(schema: string): ValidationError | null {
  try {
    JSON.parse(schema);
    return null;
  } catch (e) {
    return {
      type: 'json_syntax',
      message: `JSON 语法错误: ${e.message}`,
    };
  }
}
```

#### Props 与 Schema 一致性校验
```typescript
function validatePropsSchema(code: string, schema: string): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // 1. 解析 code 中的 interface DemoProps
  // 2. 提取 props 属性名列表
  // 3. 解析 schema 中的 properties 键名
  // 4. 对比两边是否一致
  // 5. 检查 required 字段是否都存在于 properties 中
  
  return errors;
}
```

### 5. 与任务C的组件复用

任务D 应复用任务C 产出的组件：

| 任务C组件 | 任务D使用方式 |
|-----------|---------------|
| `<PreviewPanel />` | 在编辑工作台中间栏展示实时预览 |
| `<ConfigForm />` | 在编辑工作台右侧配置面板使用 |

**复用接口**：
```typescript
// 从任务C导入
import { PreviewPanel, ConfigForm } from '@/components/demo';

// 在任务D中使用
<PreviewPanel 
  code={parsedCode} 
  configData={configData}
  sdkFiles={sdkFiles}
/>

<ConfigForm 
  schema={parsedSchema}
  onChange={handleConfigChange}
  initialData={defaultConfig}
/>
```

### 6. 编辑器集成方案

推荐使用 Monaco Editor（VS Code 同款编辑器）：

```bash
pnpm add @monaco-editor/react
```

**配置要点**：
- 语言模式：TypeScript + JSON 混合高亮
- 主题：与系统主题一致（支持深色/浅色）
- 防抖延迟：建议 300ms
- 自动保存：编辑后自动触发 onChange

### 7. DoD (完成标准)
*   编辑器支持语法高亮（TypeScript + JSON）。
*   解析器正确处理分隔符格式，能处理边界情况（如缺失分隔符）。
*   校验服务能检测出 Props 与 Schema 不一致的情况。
*   编辑器内容变化能实时同步到预览区。
*   提供独立的单元测试覆盖解析器和校验器逻辑。

### 8. 测试用例

#### 解析器测试
```typescript
describe('parseFigmaText', () => {
  it('应正确解析标准格式文本', () => {
    const input = `=== DEMO CODE ===
console.log('hello');
=== DEMO SCHEMA ===
{"type": "object"}
=== END ===`;
    const result = parseFigmaText(input);
    expect(result.success).toBe(true);
    expect(result.code).toBe("console.log('hello');");
    expect(result.schema).toBe('{"type": "object"}');
  });

  it('应处理缺失分隔符的情况', () => {
    const input = 'invalid content';
    const result = parseFigmaText(input);
    expect(result.success).toBe(false);
  });
});
```

#### 校验器测试
```typescript
describe('validatePropsSchema', () => {
  it('应检测出 Props 与 Schema 不一致', () => {
    const code = `interface DemoProps { title: string; count: number; }`;
    const schema = `{"properties": {"title": {"type": "string"}}}`;
    const errors = validatePropsSchema(code, schema);
    expect(errors).toContainEqual(
      expect.objectContaining({ type: 'props_mismatch' })
    );
  });
});
```

---
