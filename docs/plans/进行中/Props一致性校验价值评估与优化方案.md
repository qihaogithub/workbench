# Props 一致性校验价值评估与优化方案

> 版本：v1.0
> 创建日期：2026-05-25
> 状态：进行中

---

## 一、评估背景

### 1.1 触发问题

系统在检查 AI 生成代码时，会产生如下警告：

```
[警告] 未找到 DemoProps 接口定义，无法校验 props 一致性 (代码)
  建议: 添加 interface DemoProps { ... } 或 type DemoProps = { ... }
```

**观察**：即便不修复此警告，系统仍能正常运行——预览正常渲染、配置表单正常工作。

**核心问题**：这类一致性检测是否有价值？是否需要优化？

### 1.2 校验系统现状

当前校验系统由 [validator.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/lib/validator.ts) 实现，`validateAll()` 执行两项检查：

| 检查 | 说明 |
|:-----|:-----|
| `validateJsonSyntax` | Schema JSON 语法校验 |
| `validatePropsSchema` | 代码 Props 与 Schema Properties 双向一致性校验 |

其中 `validatePropsSchema` 会产生 5 类错误/警告：

| 类型 | 含义 | 严重级别 |
|:-----|:-----|:---------|
| `json_syntax` | Schema JSON 语法错误 | error |
| `props_code_not_in_schema` | 代码有但 Schema 没有 | warning |
| `props_schema_not_in_code` | Schema 有但代码没有 | info |
| `required_missing` | required 字段未在 properties 中定义 | error |
| **`interface_not_found`** | **未找到 DemoProps 接口定义** | **warning** |

---

## 二、为什么"不修复也能正常运行"

### 2.1 降级提取机制

当找不到 `interface DemoProps` 或 `type DemoProps` 时，系统会降级到**函数参数解构提取**（[validator.ts:111-143](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/lib/validator.ts#L111-L143)）：

```
优先级 1: interface DemoProps { title, desc } → 提取成功
优先级 2: type DemoProps = { title, desc }    → 提取成功
优先级 3: function Demo({ title, desc })      → 降级提取
```

如果降级提取成功，仍能进行部分一致性校验。

### 2.2 渲染层不依赖接口定义

iframe 沙箱渲染时，通过 `<currentComponent {...configData} />` 直接展开配置数据为 props（[01_动态编译方案.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/项目文档/创作端/04-配置与预览/技术/01_动态编译方案.md)）。这意味着：

- **无论代码中是否定义了 DemoProps，所有配置值都会作为 props 传入**
- TypeScript 接口在编译后不存在，不影响运行时行为
- sucrase 编译时 `jsxRuntime: 'automatic'` + `production: true` 会剥离类型信息

### 2.3 表单生成不依赖接口定义

配置表单由 Schema 驱动（RJSF），与代码中的 TypeScript 接口完全独立。Schema 的 `properties` 定义了表单字段，与代码中是否有 DemoProps 无关。

---

## 三、一致性检测的价值评估

### 3.1 价值矩阵

| 价值维度 | 有无 DemoProps 的差异 | 价值等级 |
|:---------|:----------------------|:---------|
| **双向一致性校验** | 有 DemoProps → 代码↔Schema 双向比对；无 → 仅降级单向比对 | **高** |
| **解构提取可靠性** | 接口提取稳定可靠；解构正则对复杂模式（嵌套解构、重命名、默认值）容易漏提取 | **高** |
| **AI 代码质量信号** | 缺少 DemoProps 意味着 AI 未遵循编码规范，可能还有其他问题 | **中** |
| **类型安全** | 无接口 = 无编译时类型检查，但当前系统运行时不依赖类型 | **低** |
| **代码可维护性** | 接口是组件的"契约文档"，缺失时人类难以理解组件期望的输入 | **中** |

### 3.2 关键结论

**一致性检测有价值，但当前实现存在"狼来了"问题**——警告过于笼统，用户无法区分"真正有风险"和"仅是风格问题"。

具体场景分析：

| 场景 | 是否有实际风险 | 当前是否报警 |
|:-----|:-------------|:------------|
| 代码用了解构 `{ title, desc }`，Schema 也有这两个字段，但没写 DemoProps | 无风险 | 报 warning |
| 代码用了解构 `{ title }`，Schema 有 `{ title, desc }`，没写 DemoProps | desc 字段可能被遗漏 | 报 warning（但降级提取能发现） |
| 代码用了 `props.title`，完全没解构，也没 DemoProps | **有风险**——无法提取任何 props 信息 | 报 warning |
| 代码用了复杂解构 `{ title: t = 'hi', ...rest }`，没 DemoProps | **有风险**——降级正则提取不准 | 报 warning |

**核心问题**：4 种场景严重程度差异巨大，但当前统一报同一个 warning，导致用户认为"不修也能跑"而忽视所有警告。

### 3.3 价值总结

| 评估项 | 结论 |
|:-------|:-----|
| 一致性检测是否有价值？ | **是**，它是代码-配置一致性的唯一防线 |
| 当前 `interface_not_found` 警告是否有价值？ | **部分有价值**，但需要分级 |
| 是否需要优化？ | **是**，需要让警告更精准、更有可操作性 |

---

## 四、优化方案

### 4.1 核心思路：从"一刀切警告"到"分级智能诊断"

```
当前：interface_not_found → 统一 warning

优化后：
  ├─ 降级提取成功 + 双向一致 → info（"建议添加接口定义以获得更好的类型安全"）
  ├─ 降级提取成功 + 存在不一致 → warning（保留，附带具体不一致字段）
  └─ 降级提取失败 → warning（"无法提取 props 信息，强烈建议添加接口定义"）
```

### 4.2 具体优化项

#### 优化 1：降级提取结果影响警告级别

**当前逻辑**（[validator.ts:196-233](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/lib/validator.ts#L196-L233)）：

```typescript
if (!codeProps) {
  // 只要找不到接口定义就报 warning
  errors.push({ type: "interface_not_found", severity: "warning", ... });
  return errors;  // 直接返回，不做双向比对
}
```

**优化后逻辑**：

```typescript
const codePropsFromInterface = extractPropsFromCode(code);
const codePropsFromDestructuring = extractPropsFromDestructuring(code);

if (codePropsFromInterface) {
  // 接口提取成功 → 完整双向比对
  codeProps = codePropsFromInterface;
} else if (codePropsFromDestructuring) {
  // 降级提取成功 → 仍做双向比对，但附加 info 提示
  codeProps = codePropsFromDestructuring;
  errors.push({
    type: "interface_not_found",
    severity: "info",  // 降级：从 warning → info
    message: "建议添加 DemoProps 接口定义，以获得更完整的类型检查",
    ...
  });
} else {
  // 完全无法提取 → 保留 warning
  errors.push({
    type: "interface_not_found",
    severity: "warning",
    message: "无法提取 props 信息，强烈建议添加 DemoProps 接口定义",
    ...
  });
}
// 继续执行双向比对（不再提前 return）
```

**效果**：
- 降级提取成功且双向一致时 → 仅 info，不打断用户
- 降级提取成功但不一致时 → warning + 具体不一致字段
- 完全无法提取时 → warning，强调风险

#### 优化 2：解构提取增强

当前 `extractPropsFromDestructuring()` 的正则无法处理以下模式：

| 模式 | 当前能否提取 | 说明 |
|:-----|:-----------|:-----|
| `{ title, desc }` | 能 | 简单解构 |
| `{ title: t }` | 否 | 重命名 |
| `{ title = 'hi' }` | 否 | 默认值 |
| `{ ...rest }` | 否 | 剩余参数 |
| `{ title }: { title: string }` | 否 | 带类型注解 |

建议增强正则或引入轻量 AST 解析（如 sucrase 的 parser），提升降级提取的覆盖率。

#### 优化 3：AI Prompt 强化

当前 AI Agent 提示词（[demo-generator.template.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/src/lib/agent-prompts/demo-generator.template.md)）已要求生成 DemoProps，但 AI 有时不遵守。

建议：
- 在 AI 修复指令中，当检测到 `interface_not_found` 时，优先修复为添加接口定义
- 在验证结果反馈给 AI 时，明确说明"添加 DemoProps 接口是编码规范要求"

#### 优化 4：与现有优化方案的协同

已有两份相关优化方案：

| 方案 | 关联点 |
|:-----|:------|
| [验证错误提示优化方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/验证错误提示优化方案.md) | 错误分级展示、修复建议 |
| [验证错误提示迁移至 AI 对话框方案](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/验证错误提示迁移至AI对话框方案.md) | 错误通俗化、一键 AI 修复 |

本方案与它们的关系：
- **本方案是"检测层"优化**：让检测更精准，减少无效警告
- **已有方案是"展示层"优化**：让展示更友好，提升修复率
- 两者互补：检测精准了，展示自然更有意义

### 4.3 优化优先级

| 优化项 | 优先级 | 理由 |
|:-------|:------|:-----|
| 优化 1：降级提取结果影响警告级别 | **P0** | 直接解决"狼来了"问题，投入小收益大 |
| 优化 3：AI Prompt 强化 | **P1** | 从源头减少 interface_not_found 的出现频率 |
| 优化 2：解构提取增强 | **P2** | 技术难度较高，收益相对间接 |
| 优化 4：与现有方案协同 | **P1** | 确保检测层与展示层优化不冲突 |

---

## 五、实施建议

### 5.1 推荐路径

**第一步（P0）**：修改 `validatePropsSchema()` 函数，当降级提取成功时将 `interface_not_found` 从 warning 降为 info，并继续执行双向比对。

**第二步（P1）**：配合"验证错误提示迁移至 AI 对话框方案"一起实施，确保 info 级别的提示不触发 ErrorBanner，仅 warning/error 级别触发。

**第三步（P2）**：评估是否需要增强解构提取，或引入轻量 AST 解析。

### 5.2 风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|:-----|:-----|:-----|:---------|
| 降级提取遗漏 props 导致不一致未检出 | 中 | 中 | 优化后仍保留 info 提示，不完全静默 |
| 用户习惯忽略 info 级别提示 | 低 | 低 | info 提示文案强调"建议添加"而非"必须添加" |
| 与展示层优化方案冲突 | 低 | 低 | 提前对齐 severity 分级规则 |

---

## 六、结论

| 问题 | 回答 |
|:-----|:-----|
| 一致性检测有价值吗？ | **有**。它是代码-配置一致性的唯一自动化防线，缺失时问题只能靠人工发现 |
| 不修复也能正常运行，是否意味着检测无意义？ | **否**。"能运行"≠"正确运行"。降级提取可能遗漏字段，导致配置项静默失效 |
| 是否需要优化？ | **是**。当前"一刀切 warning"导致警告疲劳，需分级处理 |
| 优化方向？ | 检测精准化（降级提取成功→info）+ 展示友好化（配合已有方案）+ 源头治理（AI Prompt 强化） |

---

## 七、相关文档

| 文档 | 说明 |
|:-----|:-----|
| [validator.ts](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/packages/author-site/lib/validator.ts) | 校验器核心实现 |
| [01_动态编译方案.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/项目文档/创作端/04-配置与预览/技术/01_动态编译方案.md) | iframe 渲染机制 |
| [01_架构设计.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/项目文档/创作端/04-配置与预览/技术/01_架构设计.md) | 配置系统架构 |
| [验证错误提示优化方案.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/验证错误提示优化方案.md) | 展示层优化方案 |
| [验证错误提示迁移至AI对话框方案.md](file:///Users/qh2/Documents/PGM/1·Work/opencode-workbench/docs/plans/进行中/验证错误提示迁移至AI对话框方案.md) | AI 修复集成方案 |
