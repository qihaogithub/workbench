## 任务 C：沙盒预览与动态表单引擎（前端渲染层）
**目标**：开发"Demo 使用页面"所需的核心组件：Sandpack 实时预览和基于 JSON Schema 的动态表单。
**前置说明**：无需管路由和文件系统，封装独立的 `PreviewPanel` 和 `ConfigForm` 组件即可。

### 1. 核心职责
*   **Sandpack 预览区 (`<PreviewPanel />`)**：
    *   引入 `@codesandbox/sandpack-react`。
    *   组件 Props 接收：`code` (React源码), `configData` (当前表单配置数据)。
    *   实现逻辑：在 Sandpack 虚拟文件系统中注入 `code`，并通过入口文件将 `configData` 作为 props 传递给渲染的组件。
    *   *(可选/占位)* 实现虚拟的 `/sdk` 目录注入逻辑（接收额外参数 `sdkFiles`）。
*   **动态配置表单 (`<ConfigForm />`)**：
    *   引入 `react-json-schema-form` (RJSF) 或 `@formily/core`。
    *   组件 Props 接收：`schema` (JSON Schema 字符串)。
    *   组件 Events：`onChange(data: any)`，输出表单填写的 JSON 数据。
    *   支持 Schema 扩展解析（如 `ui:widget: 'color'` 渲染颜色选择器，`ui:widget: 'file'` 渲染图片链接输入框）。
*   **组件联动**：在一个 Demo 展示页中，将 `<ConfigForm />` 产出的 `data` 实时喂给 `<PreviewPanel />` 的 `configData`。

### 2. 组件接口定义

#### 2.1 PreviewPanel 组件

```typescript
interface PreviewPanelProps {
  code: string;                          // React 组件源码
  configData: Record<string, unknown>;   // 当前配置数据
  sdkFiles?: Record<string, string>;     // SDK 文件映射（可选）
  onError?: (error: Error) => void;      // 错误回调
  className?: string;                    // 自定义样式类名
}

// 使用示例
<PreviewPanel
  code={demoCode}
  configData={{ title: 'Hello', description: 'World' }}
  sdkFiles={{
    '/sdk/utils.ts': 'export const format = (s) => s.toUpperCase();',
  }}
  onError={(err) => console.error(err)}
/>
```

#### 2.2 ConfigForm 组件

```typescript
interface ConfigFormProps {
  schema: string;                                    // JSON Schema 字符串
  onChange: (data: Record<string, unknown>) => void; // 配置变更回调
  initialData?: Record<string, unknown>;             // 初始配置数据
  readonly?: boolean;                                // 只读模式
  className?: string;                                // 自定义样式类名
}

// 使用示例
<ConfigForm
  schema={jsonSchemaString}
  onChange={(data) => setConfigData(data)}
  initialData={{ title: 'Default Title' }}
/>
```

### 3. Sandpack 预览实现方案

#### 3.1 文件系统注入

```typescript
import { Sandpack } from '@codesandbox/sandpack-react';

function PreviewPanel({ code, configData, sdkFiles, onError }: PreviewPanelProps) {
  const entryCode = `
import Demo from './Demo';
export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`;

  const files = {
    '/Demo.tsx': code,
    '/App.tsx': entryCode,
    ...sdkFiles,
  };

  return (
    <Sandpack
      template="react-ts"
      files={files}
      options={{
        showNavigator: false,
        showTabs: false,
        showLineNumbers: true,
        showInlineErrors: true,
        wrapContent: true,
        editorHeight: '100%',
        classes: {
          'sp-wrapper': 'h-full',
          'sp-layout': 'h-full',
          'sp-stack': 'h-full',
        },
      }}
    />
  );
}
```

#### 3.2 SDK 注入逻辑（可选）

```typescript
function injectSdkFiles(sdkPath: string): Record<string, string> {
  // 在服务端读取 SDK 目录
  // 将文件内容映射到虚拟文件系统
  // 此逻辑在 Server Component 或 getServerSideProps 中实现
  return {
    '/sdk/index.ts': '...',
    '/sdk/components/Button.tsx': '...',
  };
}
```

### 4. 动态表单实现方案

#### 4.1 使用 RJSF (推荐)

```bash
pnpm add @rjsf/core @rjsf/validator-ajv8
```

```typescript
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';

function ConfigForm({ schema, onChange, initialData, readonly }: ConfigFormProps) {
  const parsedSchema = JSON.parse(schema);
  
  return (
    <Form
      schema={parsedSchema}
      validator={validator}
      formData={initialData}
      onChange={(e) => onChange(e.formData)}
      readonly={readonly}
      liveValidate
      showErrorList="bottom"
    />
  );
}
```

#### 4.2 自定义 Widget 支持

```typescript
const customWidgets = {
  color: ColorPickerWidget,
  file: FileUploadWidget,
  richtext: RichTextWidget,
};

const uiSchema = {
  'ui:widget': 'color',
};

function ConfigForm({ schema, onChange, initialData }: ConfigFormProps) {
  const parsedSchema = JSON.parse(schema);
  
  return (
    <Form
      schema={parsedSchema}
      validator={validator}
      widgets={customWidgets}
      formData={initialData}
      onChange={(e) => onChange(e.formData)}
    />
  );
}
```

### 5. 表单控件映射实现

| JSON Schema 类型 | format / ui:widget | 实现方式 |
|------------------|-------------------|----------|
| `string` | - | `<input type="text" />` |
| `string` | `uri` + `ui:widget: file` | 自定义 FileUploadWidget |
| `string` | `uri` | `<input type="url" />` |
| `string` | `enum` | `<select>` |
| `string` | `ui:widget: richtext` | 自定义 RichTextWidget |
| `string` | `ui:widget: color` | 自定义 ColorPickerWidget |
| `number` / `integer` | - | `<input type="number" />` |
| `boolean` | - | `<Switch />` |
| `array` | - | ArrayField (RJSF 内置) |
| `object` | - | ObjectField (RJSF 内置) |

### 6. 组件联动示例

```typescript
function DemoPage() {
  const [configData, setConfigData] = useState({});
  const demoCode = `...`; // 从 API 获取
  const demoSchema = `...`; // 从 API 获取

  return (
    <div className="flex h-screen">
      {/* 左侧预览区 */}
      <div className="w-2/3 p-4">
        <PreviewPanel
          code={demoCode}
          configData={configData}
        />
      </div>
      
      {/* 右侧配置面板 */}
      <div className="w-1/3 p-4 border-l">
        <ConfigForm
          schema={demoSchema}
          onChange={setConfigData}
        />
      </div>
    </div>
  );
}
```

### 7. 导出规范

组件应从统一的入口导出，供任务D 复用：

```typescript
// packages/web/components/demo/index.ts
export { PreviewPanel } from './PreviewPanel';
export { ConfigForm } from './ConfigForm';
export type { PreviewPanelProps, ConfigFormProps } from './types';
```

### 8. DoD (完成标准)
*   Sandpack 能够毫秒级响应 `code` 或 `configData` 的变化并无刷新重渲染（Hot Reload）。
*   输入合法的 JSON Schema，表单能正确生成对应的 input/select/color 控件。
*   提供一个静态 Mock 页面，左右分栏，左边 Sandpack，右边 Form，证明联动成功。
*   组件接口符合开发计划中定义的契约。
*   组件可被任务D 直接导入复用。

### 9. 测试用例

```typescript
describe('PreviewPanel', () => {
  it('应正确渲染 React 组件', async () => {
    const code = `export default function Demo({ title }) { return <h1>{title}</h1>; }`;
    render(<PreviewPanel code={code} configData={{ title: 'Test' }} />);
    
    await waitFor(() => {
      expect(screen.getByText('Test')).toBeInTheDocument();
    });
  });

  it('应响应 configData 变化', async () => {
    const { rerender } = render(
      <PreviewPanel code={code} configData={{ title: 'Old' }} />
    );
    
    rerender(<PreviewPanel code={code} configData={{ title: 'New' }} />);
    
    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument();
    });
  });
});

describe('ConfigForm', () => {
  it('应根据 schema 生成表单', () => {
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string', title: '标题' },
      },
    });
    
    render(<ConfigForm schema={schema} onChange={() => {}} />);
    
    expect(screen.getByLabelText('标题')).toBeInTheDocument();
  });

  it('应在变更时触发 onChange', () => {
    const onChange = jest.fn();
    const schema = JSON.stringify({
      type: 'object',
      properties: {
        title: { type: 'string', title: '标题' },
      },
    });
    
    render(<ConfigForm schema={schema} onChange={onChange} />);
    
    fireEvent.change(screen.getByLabelText('标题'), {
      target: { value: 'New Title' },
    });
    
    expect(onChange).toHaveBeenCalledWith({ title: 'New Title' });
  });
});
```

---
