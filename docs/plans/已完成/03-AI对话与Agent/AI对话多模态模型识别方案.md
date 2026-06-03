# AI 对话多模态模型识别 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web 端基于一份前端硬编码配置表,对后端自动获取的模型列表进行启用/禁用过滤、别名展示与多模态能力门禁;选择多模态模型时显示图片上传按钮,选择非多模态模型时隐藏。

**Architecture:** 后端零改动,继续透传 ACP 原始模型列表;前端新增 `packages/web/src/lib/ai-models.ts` 维护一份 `MODEL_CONFIGS` 数组(matcher / enabled / alias / supportsImages),`ai-chat.tsx` 在收到 `models` 消息时调用 `applyModelConfigs()` 一次性完成过滤、别名替换、能力字段注入,UI 层根据当前模型的 `supportsImages` 条件渲染图片按钮,并通过包装组件 `ModelSelectWithGuard` 拦截"已上传图片但切到非多模态模型"的非法切换。

**Tech Stack:** TypeScript / Next.js 14 (App Router) / React / Jest + Testing Library / Tailwind / shadcn-ui

---

## 一、背景与决策

### 1.1 与已有方案的关系

本方案基于已交付的 [`AI对话模型选择功能方案.md`](./AI对话模型选择功能方案.md) 之上扩展,**不修改后端任何代码**。后端继续返回 `Array<{id, label}>` 的原始模型列表,所有「能力识别」「白名单管控」「别名展示」均在前端完成。

### 1.2 关键决策

| 决策项 | 选择 | 原因 |
|:--|:--|:--|
| 配置位置 | 前端 (`packages/web/src/lib/ai-models.ts`) | 后端保持通用,产品策略前端可控 |
| matcher 类型 | `RegExp \| string`(字符串走前缀匹配) | 同时兼容"精确指定"与"覆盖所有日期变体"两种风格 |
| 未配置模型默认行为 | `enabled: true`,`supportsImages: false` | 自动透出新模型(可见)+ 默认非多模态(保守,避免误开放图片) |
| `enabled: false` 的模型 | 直接从下拉框过滤掉 | 用户根本看不到 |
| 别名缺省时 | 使用后端原始 label | 不强制覆盖 |
| 已有图片切到非多模态模型 | toast 提示 + 阻止切换 | 用户主动决定先发送/先撤图 |
| 切换到非多模态模型后图片按钮 | 隐藏(条件渲染) | 直接阻止再次添加 |

---

## 二、文件结构

| 文件 | 类型 | 职责 |
|:--|:--|:--|
| `packages/web/src/lib/ai-models.ts` | **新建** | 配置表 `MODEL_CONFIGS`、`UNCONFIGURED_DEFAULT`、`matchesId`、`resolveModelConfig`、`applyModelConfigs` |
| `packages/web/src/lib/__tests__/ai-models.test.ts` | **新建** | `ai-models` 单元测试 |
| `packages/web/src/components/ai-elements/prompt-input.tsx` | **修改** | `PromptInputModelSelectProps.models` 类型扩展,允许携带可选 `supportsImages` 字段 |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | **修改** | `modelState.models` 加 `supportsImages`、`models` 事件处理调用 `applyModelConfigs`、派生 `currentSupportsImages`、条件渲染 `<PromptInputAddImage>`、新增内部 `<ModelSelectWithGuard>` 拦截非法切换 |

**不需要改动的文件**:
- 整个 `packages/agent-service/`(后端)
- `packages/web/src/components/ai-elements/index.ts`(无新增导出)
- `packages/shared/`、`packages/agent-client/`

---

## 三、任务分解

### Task 1: 实现 `ai-models.ts` 配置表与解析函数(TDD)

**Files:**
- Create: `packages/web/src/lib/ai-models.ts`
- Test: `packages/web/src/lib/__tests__/ai-models.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `packages/web/src/lib/__tests__/ai-models.test.ts`:

```typescript
import {
  applyModelConfigs,
  matchesId,
  resolveModelConfig,
  UNCONFIGURED_DEFAULT,
} from "@/lib/ai-models";

describe("matchesId", () => {
  it("字符串 matcher 走前缀匹配", () => {
    expect(matchesId("claude-", "claude-sonnet-4-5")).toBe(true);
    expect(matchesId("claude-", "anthropic/claude-sonnet")).toBe(false);
  });

  it("正则 matcher 走 .test()", () => {
    expect(matchesId(/^claude-sonnet/, "claude-sonnet-4-5")).toBe(true);
    expect(matchesId(/^claude-sonnet/, "claude-opus-4-7")).toBe(false);
  });
});

describe("resolveModelConfig", () => {
  it("匹配到的模型返回 alias 与 supportsImages", () => {
    const r = resolveModelConfig("claude-sonnet-4-5-20250929");
    expect(r.config).not.toBeNull();
    expect(r.alias).toBe("Claude Sonnet 4.5");
    expect(r.supportsImages).toBe(true);
    expect(r.enabled).toBe(true);
  });

  it("未匹配的模型返回 UNCONFIGURED_DEFAULT", () => {
    const r = resolveModelConfig("brand-new-llm-2099");
    expect(r.config).toBeNull();
    expect(r.alias).toBeUndefined();
    expect(r.enabled).toBe(UNCONFIGURED_DEFAULT.enabled);
    expect(r.supportsImages).toBe(UNCONFIGURED_DEFAULT.supportsImages);
  });

  it("enabled:false 的家族应被禁用", () => {
    const r = resolveModelConfig("o1-preview");
    expect(r.enabled).toBe(false);
  });
});

describe("applyModelConfigs", () => {
  it("过滤掉 enabled:false 的模型", () => {
    const result = applyModelConfigs([
      { id: "claude-sonnet-4-5", label: "Sonnet" },
      { id: "o1-preview", label: "O1 Preview" },
    ]);
    expect(result.map((m) => m.id)).toEqual(["claude-sonnet-4-5"]);
  });

  it("匹配到的模型 label 替换为 alias", () => {
    const result = applyModelConfigs([
      { id: "claude-sonnet-4-5", label: "Backend Sonnet Label" },
    ]);
    expect(result[0].label).toBe("Claude Sonnet 4.5");
  });

  it("未配置的模型保留后端原始 label", () => {
    const result = applyModelConfigs([
      { id: "future-model-x", label: "Future Model X" },
    ]);
    expect(result[0].label).toBe("Future Model X");
    expect(result[0].supportsImages).toBe(false);
  });

  it("注入 supportsImages 字段:已知多模态 → true,未配置 → false", () => {
    const result = applyModelConfigs([
      { id: "claude-sonnet-4-5", label: "Sonnet" },
      { id: "future-model-x", label: "Future" },
    ]);
    expect(result[0].supportsImages).toBe(true);
    expect(result[1].supportsImages).toBe(false);
  });

  it("空数组输入返回空数组", () => {
    expect(applyModelConfigs([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @opencode-workbench/web test -- --testPathPattern="ai-models.test.ts"
```

Expected: FAIL with "Cannot find module '@/lib/ai-models'"。

- [ ] **Step 3: 实现 `ai-models.ts`**

创建 `packages/web/src/lib/ai-models.ts`:

```typescript
/**
 * AI 模型前端配置表
 *
 * 维护规则:
 * - 添加新模型:在 MODEL_CONFIGS 中追加一条,matcher 用正则覆盖日期/版本变体
 * - 禁用某家族:在配置中加 `enabled: false`
 * - 自定义展示名:在配置中加 `alias`
 * - 标记多模态:在配置中加 `supportsImages: true`
 *
 * 后端返回但未在此处配置的模型:
 * - 默认显示在下拉框中(`enabled = true`)
 * - 默认按非多模态处理(`supportsImages = false`)
 */

export type ModelMatcher = RegExp | string;

export type ModelConfig = {
  /** 匹配后端原始 model id 的正则,或字符串前缀 */
  matcher: ModelMatcher;
  /** 是否在下拉框中展示,默认 true */
  enabled?: boolean;
  /** 自定义展示名,缺省时使用后端 label */
  alias?: string;
  /** 是否支持图片输入,默认 false */
  supportsImages?: boolean;
};

export const UNCONFIGURED_DEFAULT = {
  enabled: true,
  supportsImages: false,
} as const;

export type ResolvedModel = {
  id: string;
  label: string;
  supportsImages: boolean;
};

/**
 * 模型配置表 — 维护此数组以管控前端可见模型
 *
 * 列表顺序即匹配优先级,首个命中的配置生效。
 */
export const MODEL_CONFIGS: ModelConfig[] = [
  // === Claude 系列(全部多模态)===
  { matcher: /^claude-sonnet-4-5/, alias: "Claude Sonnet 4.5", supportsImages: true },
  { matcher: /^claude-opus-4-7/, alias: "Claude Opus 4.7", supportsImages: true },
  { matcher: /^claude-haiku-4-5/, alias: "Claude Haiku 4.5", supportsImages: true },

  // === OpenAI 系列 ===
  { matcher: /^gpt-4o/, alias: "GPT-4o", supportsImages: true },
  { matcher: /^gpt-5/, alias: "GPT-5", supportsImages: true },
  // o1 暂不启用(无 ACP 后端稳定支持)
  { matcher: /^o1$|^o1-/, enabled: false },

  // === Gemini 系列 ===
  { matcher: /^gemini-2/, alias: "Gemini 2", supportsImages: true },

  // === 国内多模态 ===
  { matcher: /^qwen-vl|^qwen3-vl/, alias: "Qwen VL", supportsImages: true },
  { matcher: /^kimi-vl/, alias: "Kimi VL", supportsImages: true },
];

export function matchesId(matcher: ModelMatcher, id: string): boolean {
  if (typeof matcher === "string") return id.startsWith(matcher);
  return matcher.test(id);
}

export function resolveModelConfig(rawId: string): {
  config: ModelConfig | null;
  enabled: boolean;
  alias: string | undefined;
  supportsImages: boolean;
} {
  const config = MODEL_CONFIGS.find((c) => matchesId(c.matcher, rawId)) ?? null;
  return {
    config,
    enabled: config?.enabled ?? UNCONFIGURED_DEFAULT.enabled,
    alias: config?.alias,
    supportsImages: config?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages,
  };
}

export function applyModelConfigs(
  raw: Array<{ id: string; label: string }>,
): ResolvedModel[] {
  const result: ResolvedModel[] = [];
  for (const m of raw) {
    const r = resolveModelConfig(m.id);
    if (!r.enabled) continue;
    result.push({
      id: m.id,
      label: r.alias ?? m.label,
      supportsImages: r.supportsImages,
    });
  }
  return result;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @opencode-workbench/web test -- --testPathPattern="ai-models.test.ts"
```

Expected: 所有用例 PASS(共 11 个 it)。

- [ ] **Step 5: 跑 typecheck**

```bash
pnpm --filter @opencode-workbench/web typecheck
```

Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
git add packages/web/src/lib/ai-models.ts packages/web/src/lib/__tests__/ai-models.test.ts
git commit -m "feat(web): 添加前端模型配置表 ai-models 用于管控启用/别名/多模态"
```

---

### Task 2: 扩展 `PromptInputModelSelectProps` 类型(允许携带 `supportsImages`)

**Files:**
- Modify: `packages/web/src/components/ai-elements/prompt-input.tsx:560-566`

- [ ] **Step 1: 修改 `PromptInputModelSelectProps`**

将 `packages/web/src/components/ai-elements/prompt-input.tsx` 第 560-566 行:

```typescript
interface PromptInputModelSelectProps {
  currentModelId: string
  models: Array<{ id: string; label: string }>
  canSwitch: boolean
  onModelChange: (modelId: string) => void
  isLoading: boolean
}
```

替换为:

```typescript
interface PromptInputModelSelectProps {
  currentModelId: string
  /** 模型列表;可选携带 supportsImages 用于上层逻辑,本组件 UI 不消费该字段 */
  models: Array<{ id: string; label: string; supportsImages?: boolean }>
  canSwitch: boolean
  onModelChange: (modelId: string) => void
  isLoading: boolean
}
```

注意:组件内部 `models.find(...)` 与渲染逻辑均不依赖新增字段,无需改动函数体。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm --filter @opencode-workbench/web typecheck
```

Expected: 无错误(`ai-chat.tsx` 当前传入的 `Array<{id, label}>` 仍兼容,因 `supportsImages` 为可选)。

- [ ] **Step 3: 提交**

```bash
git add packages/web/src/components/ai-elements/prompt-input.tsx
git commit -m "refactor(web): PromptInputModelSelect models 类型允许携带 supportsImages"
```

---

### Task 3: `ai-chat.tsx` 集成配置表 + 条件渲染图片按钮

**Files:**
- Modify: `packages/web/src/components/ai-elements/ai-chat.tsx`(多处)

#### 3.1 引入配置模块并扩展 `modelState` 类型

- [ ] **Step 1: 在 import 区域(约第 36-37 行)新增导入**

在 `import { useToast } from "@/components/ui/toast-provider";` 这一行之后插入:

```typescript
import {
  applyModelConfigs,
  UNCONFIGURED_DEFAULT,
  type ResolvedModel,
} from "@/lib/ai-models";
```

- [ ] **Step 2: 修改 `modelState` 类型(第 229-239 行)**

将:

```typescript
const [modelState, setModelState] = useState<{
  currentModelId: string;
  models: Array<{ id: string; label: string }>;
  canSwitch: boolean;
  isLoading: boolean;
}>({
  currentModelId: '',
  models: [],
  canSwitch: false,
  isLoading: true,
});
```

替换为:

```typescript
const [modelState, setModelState] = useState<{
  currentModelId: string;
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
}>({
  currentModelId: '',
  models: [],
  canSwitch: false,
  isLoading: true,
});
```

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm --filter @opencode-workbench/web typecheck
```

Expected: 报错于第 318-323 行(`stream.on("models", ...)` 中 `event.models` 不是 `ResolvedModel[]`),将在 3.2 修复。第 287-296 行的 setModelState 重置逻辑应仍兼容(空数组与字面量赋值)。

#### 3.2 在 `models` 事件处理中应用 `applyModelConfigs`

- [ ] **Step 1: 修改 `stream.on("models", ...)` 处理(第 317-324 行)**

将:

```typescript
stream.on("models", (event: StreamEvent) => {
  setModelState((prev) => ({
    currentModelId: event.currentModelId || prev.currentModelId,
    models: event.models ?? prev.models,
    canSwitch: event.canSwitch ?? prev.canSwitch,
    isLoading: false,
  }));
});
```

替换为:

```typescript
stream.on("models", (event: StreamEvent) => {
  setModelState((prev) => ({
    currentModelId: event.currentModelId || prev.currentModelId,
    models: event.models ? applyModelConfigs(event.models) : prev.models,
    canSwitch: event.canSwitch ?? prev.canSwitch,
    isLoading: false,
  }));
});
```

- [ ] **Step 2: 修改第 482-490 行的另一处 `stream.on("models", ...)` 处理(在聊天消息流 `streamRef` 上)**

将第 482-490 行:

```typescript
      // 监听模型列表更新
      stream.on("models", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        setModelState((prev) => ({
          currentModelId: event.currentModelId || prev.currentModelId,
          models: event.models ?? prev.models,
          canSwitch: event.canSwitch ?? prev.canSwitch,
          isLoading: false,
        }));
      });
```

替换为:

```typescript
      // 监听模型列表更新
      stream.on("models", (event: StreamEvent) => {
        if (streamSessionIdRef.current !== streamId) return;
        setModelState((prev) => ({
          currentModelId: event.currentModelId || prev.currentModelId,
          models: event.models ? applyModelConfigs(event.models) : prev.models,
          canSwitch: event.canSwitch ?? prev.canSwitch,
          isLoading: false,
        }));
      });
```

(此处与 Task 3.2 Step 1 是镜像处理:聊天消息流和持久模型流都可能收到 `models` 事件,均需走配置过滤。)

不需要修改第 915 行附近的 `setModelState((prev) => ({ ...prev, isLoading: false }))` —— 它不涉及 `models` 字段。

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm --filter @opencode-workbench/web typecheck
```

Expected: 类型错误归零。

#### 3.3 派生 `currentSupportsImages` 并条件渲染 `<PromptInputAddImage>`

- [ ] **Step 1: 在 `handleModelChange` 之前(约第 1149 行)派生能力**

在 `// 切换模型` 注释之前的位置(约第 1148-1149 行的空行)插入:

```typescript
  // 当前模型是否支持图片输入(用于条件渲染图片按钮)
  const currentSupportsImages =
    modelState.models.find((m) => m.id === modelState.currentModelId)
      ?.supportsImages ?? UNCONFIGURED_DEFAULT.supportsImages;
```

- [ ] **Step 2: 修改 `<PromptInputAddImage />` 渲染处(第 1279 行)**

将:

```tsx
            <PromptInputAddImage />
```

替换为:

```tsx
            {currentSupportsImages && <PromptInputAddImage />}
```

- [ ] **Step 3: 跑 typecheck + lint**

```bash
pnpm --filter @opencode-workbench/web typecheck
pnpm --filter @opencode-workbench/web lint
```

Expected: 均通过。

- [ ] **Step 4: 启动 dev server 手动验证**

```bash
pnpm dev:web
```

按以下流程在浏览器中验证(后端 agent-service 也需启动,可同时跑 `pnpm dev`):

1. 打开任意项目的 AI 对话
2. 等待模型下拉框加载完成
3. 选中带 alias 的多模态模型(例如 `Claude Sonnet 4.5`)→ **预期**:输入区显示图片按钮
4. 切换到非多模态模型(若没有则临时把某模型 `supportsImages` 设为 false 测试)→ **预期**:图片按钮消失
5. 后端返回但 `enabled:false` 的模型(如 `o1-preview`)→ **预期**:不出现在下拉框中
6. 后端返回未配置的模型 → **预期**:出现在下拉,显示后端原始 label,且图片按钮在选中它时隐藏

- [ ] **Step 5: 提交**

```bash
git add packages/web/src/components/ai-elements/ai-chat.tsx
git commit -m "feat(web): AI 对话基于模型多模态能力条件渲染图片按钮"
```

---

### Task 4: `ModelSelectWithGuard` 拦截已上传图片切换到非多模态模型

**Files:**
- Modify: `packages/web/src/components/ai-elements/ai-chat.tsx`(新增内部组件 + 替换调用点)

- [ ] **Step 1: 在 `AIChat` 函数体外、文件顶部其他组件附近(约 `PromptInputAttachmentsDisplay` 之后,即第 62 行附近)新增内部组件**

在 `PromptInputAttachmentsDisplay` 函数闭合 `};` 之后插入:

```typescript
function ModelSelectWithGuard(props: {
  currentModelId: string;
  models: ResolvedModel[];
  canSwitch: boolean;
  isLoading: boolean;
  onModelChange: (modelId: string) => void;
}) {
  const attachments = usePromptInputAttachments();
  const { toast } = useToast();

  const handleGuardedChange = useCallback(
    (modelId: string) => {
      const target = props.models.find((m) => m.id === modelId);
      const targetSupportsImages = target?.supportsImages ?? false;
      if (!targetSupportsImages && attachments.files.length > 0) {
        toast({
          title: "目标模型不支持图片输入",
          description: "请先移除已添加的图片再切换模型。",
        });
        return;
      }
      props.onModelChange(modelId);
    },
    [attachments.files.length, props, toast],
  );

  return (
    <PromptInputModelSelect
      currentModelId={props.currentModelId}
      models={props.models}
      canSwitch={props.canSwitch}
      onModelChange={handleGuardedChange}
      isLoading={props.isLoading}
    />
  );
}
```

注意确认顶部 import 区域已有 `useCallback`(已存在,见第 3 行)、`useToast`(已存在,见第 36 行)、`usePromptInputAttachments`(已存在,见第 18 行)、`PromptInputModelSelect`(已存在,见第 16 行)。

- [ ] **Step 2: 替换 `<PromptInputModelSelect>` 调用点(第 1295-1301 行)**

将:

```tsx
            <PromptInputModelSelect
              currentModelId={modelState.currentModelId}
              models={modelState.models}
              canSwitch={modelState.canSwitch}
              onModelChange={handleModelChange}
              isLoading={modelState.isLoading}
            />
```

替换为:

```tsx
            <ModelSelectWithGuard
              currentModelId={modelState.currentModelId}
              models={modelState.models}
              canSwitch={modelState.canSwitch}
              onModelChange={handleModelChange}
              isLoading={modelState.isLoading}
            />
```

- [ ] **Step 3: 跑 typecheck + lint**

```bash
pnpm --filter @opencode-workbench/web typecheck
pnpm --filter @opencode-workbench/web lint
```

Expected: 均通过。

- [ ] **Step 4: 手动验证切换防护**

1. 启动 dev server (`pnpm dev`)
2. 在 AI 对话输入区,选中多模态模型 → 添加一张图片
3. 在模型下拉框尝试切换到非多模态模型
4. **预期**:
   - 切换被阻止(下拉框选中状态保持原值)
   - 弹出 toast:`目标模型不支持图片输入,请先移除已添加的图片再切换模型。`
5. 移除图片后再切换 → **预期**:切换成功,图片按钮立即消失
6. 不带图片切换两个多模态模型 → **预期**:正常切换,无 toast

- [ ] **Step 5: 提交**

```bash
git add packages/web/src/components/ai-elements/ai-chat.tsx
git commit -m "feat(web): 切换到非多模态模型前若有图片则阻止并提示"
```

---

### Task 5: 端到端回归

- [ ] **Step 1: 跑全量测试**

```bash
pnpm --filter @opencode-workbench/web test
```

Expected: 所有用例通过(含新增 `ai-models.test.ts`)。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm --filter @opencode-workbench/web typecheck
```

Expected: 无错误。

- [ ] **Step 3: 跑 lint**

```bash
pnpm --filter @opencode-workbench/web lint
```

Expected: 无错误、无新警告。

- [ ] **Step 4: 跑 build**

```bash
pnpm --filter @opencode-workbench/web build
```

Expected: 构建成功。

- [ ] **Step 5: 总集成手测清单**

启动 `pnpm dev`,逐项验证:

| 场景 | 操作 | 预期 |
|:--|:--|:--|
| 多模态模型 + 显示图片按钮 | 选中 Claude Sonnet 4.5 | 图片按钮可见 |
| 非多模态模型 + 隐藏图片按钮 | 配置一个 `supportsImages: false` 的模型,选中 | 图片按钮消失 |
| 别名展示 | 切换到 GPT-4o | 下拉框显示 "GPT-4o" 而非后端原 label |
| `enabled:false` 过滤 | 后端返回 `o1-preview` | 下拉框中无此项 |
| 未配置模型默认行为 | 后端返回 `future-model-x` | 出现在下拉,使用后端 label,图片按钮隐藏 |
| 已上传图片阻止切换 | 选多模态 + 添加图 → 切非多模态 | toast 提示 + 不切换 |
| 移除图片后切换 | 接上一步,移除图后切换 | 切换成功,图片按钮消失 |
| 流式输出中下拉禁用 | AI 回复中尝试展开下拉 | 下拉禁用(原有行为保留) |
| 后端不支持切换 | `canSwitch=false` | 显示当前模型 + tooltip(原有行为保留) |
| 会话切换重置 | 切到另一会话 | 模型状态重置后重新拉取(原有行为保留) |

- [ ] **Step 6: 归档计划文档**

确认本计划所有任务通过,将 `docs/plans/进行中/AI对话多模态模型识别方案.md` 移动到 `docs/plans/归档/`:

```bash
mkdir -p docs/plans/归档
git mv docs/plans/进行中/AI对话多模态模型识别方案.md docs/plans/归档/AI对话多模态模型识别方案.md
git commit -m "docs(plans): 归档 AI 对话多模态模型识别方案"
```

---

## 四、维护说明(交付后)

### 添加新模型

在 `packages/web/src/lib/ai-models.ts` 的 `MODEL_CONFIGS` 数组中追加一条:

```typescript
{ matcher: /^new-model-prefix/, alias: "可读名称", supportsImages: true },
```

### 禁用某个家族

```typescript
{ matcher: /^bad-family/, enabled: false },
```

### 仅改别名,保持其他默认

```typescript
{ matcher: /^some-model/, alias: "新名字" },
// 等价于 enabled: true, supportsImages: false
```

### 注意事项

1. **匹配优先级**:`MODEL_CONFIGS` 数组顺序即匹配优先级,首个命中的配置生效。请将更具体的 matcher 放在更通用的之前。
2. **未配置模型默认非多模态**:这是保守策略,若需要新模型直接显示图片按钮,必须显式在配置中标记 `supportsImages: true`。
3. **后端不变更**:本方案完全不动 `agent-service`,后端继续返回完整原始模型列表,过滤与能力识别均在前端。

---

## 五、相关文件

| 文件 | 变更类型 | 说明 |
|:--|:--|:--|
| `packages/web/src/lib/ai-models.ts` | 新建 | 模型配置表 + 解析函数 |
| `packages/web/src/lib/__tests__/ai-models.test.ts` | 新建 | 单元测试 |
| `packages/web/src/components/ai-elements/prompt-input.tsx` | 修改 | `PromptInputModelSelectProps.models` 类型扩展 |
| `packages/web/src/components/ai-elements/ai-chat.tsx` | 修改 | `modelState`、`models` 事件处理、条件渲染图片按钮、`ModelSelectWithGuard` |
| `docs/plans/进行中/AI对话模型选择功能方案.md` | 关联(无修改) | 已交付的模型选择基础功能,本方案在其上扩展 |

---

## 六、回滚方案

如线上发现问题,按以下顺序回滚:

1. **小问题**:在 `ai-models.ts` 中将出问题的 `matcher` 改为 `enabled: false`(无需改业务代码,刷新即可)
2. **图片按钮显隐错误**:把 `MODEL_CONFIGS` 中所有项的 `supportsImages` 改为 `true`(等价于"恢复到所有模型都显示图片按钮")
3. **完全回滚**:`git revert` 本特性的 commits(Task 1-4 的 4 个 commits),恢复到改动前。
