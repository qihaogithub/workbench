# Demo 目录命名 Agent 友好性优化方案

> 创建日期：2026-06-04
> 状态：进行中
> 优先级：中

---

## 一、问题定义

### 1.1 当前命名规则

```
demo_{13位毫秒时间戳}_{6位base36随机串}
```

示例：`demo_1778077850198_fjxwmf`、`demo_1778751411983_7h2rpo`

**生成函数**：`packages/author-site/src/lib/fs-utils.ts` → `generateDemoPageId()`

```typescript
export function generateDemoPageId(): string {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

### 1.2 Agent 交互链路分析

Agent 与 demo 目录的交互分 4 层：

| 层级              | 机制                                               | 涉及文件                                         | Agent 看到的内容                                                                        |
| :---------------- | :------------------------------------------------- | :----------------------------------------------- | :-------------------------------------------------------------------------------------- |
| **L2 静态提示词** | `system-prompt.md` 硬编码生成规则                  | `system-prompt.md:21`                            | "生成唯一 demoId，格式：`demo_{时间戳}_{6位随机字母数字}`"                              |
| **L3 动态上下文** | `scan-workspace.ts` 扫描后注入到 user message 前缀 | `workspace-status.template.ts`                   | `- 配置展示 · 数据内容类`<br>`  - index.tsx: demos/demo_1778077850198_fjxwmf/index.tsx` |
| **文件操作**      | Agent 通过 readFile/writeFile/listFiles 工具读写   | `pi-tools/file-tools.ts`                         | 路径参数：`demos/demo_1778077850198_fjxwmf/index.tsx`                                   |
| **兜底扫描**      | `workspace-tree.json` 不存在时按目录名作页面名     | `fs-utils.ts:447-452`、`scan-workspace.ts:74-87` | 页面名 = `demo_1778077850198_fjxwmf`（完全无语义）                                      |

### 1.3 问题量化

#### Token 浪费

每个页面在 L3 上下文中占约 **90 tokens**（目录名出现 2 次 + 页面名 + 格式符号），一个 4 页面项目消耗 ~360 tokens。如果将目录名从 28 字符缩到 15 字符，同等场景降到 ~60 tokens/页，节省 ~33%。

#### 路径生成错误率

Agent 创建新页面时需要自行拼写 `demo_{Date.now()}_{random6}` 格式。这个 28 字符的长串在 LLM 输出中容易出现：

- 随机后缀位数不对（5 位或 7 位）
- 时间戳幻觉（生成不合理的值）
- 格式混淆（用 `-` 代替 `_`）

#### 兜底场景完全退化

当 `workspace-tree.json` 不存在或损坏时：

- `scan-workspace.ts:79-84` 将目录名直接作为页面名
- `fs-utils.ts:449` 同样 `name: entry.name`
- Agent 看到的页面列表变成 `demo_1778077850198_fjxwmf`、`demo_1778751411983_7h2rpo` —— **完全无法区分页面用途**

---

## 二、方案选型

### 方案 A：语义 Slug + 短哈希（推荐）

**目录名格式**：`{语义slug}_{4位随机串}`

```
demos/
├── data-content_fjxw/        # 原 demo_1778077850198_fjxwmf
│   ├── index.tsx
│   └── config.schema.json
└── style-layout_7h2r/        # 原 demo_1778751411983_7h2rpo
    ├── index.tsx
    └── config.schema.json
```

**Slug 生成规则**：

1. 优先使用用户提供的页面名称（中文转拼音或英文直接使用）
2. 空格/特殊字符替换为 `-`，统一小写
3. 截断到 20 字符
4. 如果名称为空，使用 `page` 作为默认 slug

**示例**：

| 页面名称     | 生成 slug              | 完整目录名                  |
| :----------- | :--------------------- | :-------------------------- |
| 首页         | `shou-ye`              | `shou-ye_a3f2`              |
| 商品详情     | `shang-pin-xiang-qing` | `shang-pin-xiang-qing_k8m2` |
| Landing Page | `landing-page`         | `landing-page_9x1z`         |
| （空名称）   | `page`                 | `page_w4t7`                 |

**优点**：

- Agent 看到目录名即可理解页面用途（即使 `workspace-tree.json` 不存在）
- 目录名从 28 字符降到 ~20 字符，节省 L3 token
- 创建页面的 system prompt 更简单："用页面名称生成目录名，如 `demos/{slug}_{4位随机}/`"
- 保留随机后缀，碰撞概率可控（4 位 base36 = ~170 万种组合，同一 slug 下碰撞概率极低）

**缺点**：

- 需要 slug 生成函数（拼音/英文转换）
- 页面重命名时目录名不变（与当前行为一致，不是新问题）
- 存量数据需要迁移

**碰撞概率分析**：

同一项目内同 slug 下的碰撞概率 = `1 / 36^4 ≈ 1/1,679,616`。一个项目通常不超过 20 个页面，碰撞概率可忽略。如果发生碰撞（极罕见），追加 1 位随机字符即可。

### 方案 B：纯数字短 ID + 增强 L3

**目录名格式**：`p{递增数字}`

```
demos/
├── p1/
├── p2/
└── p3/
```

**优点**：

- 最短目录名（2-4 字符）
- 绝对无碰撞

**缺点**：

- 兜底场景仍无语义（目录名 `p1` 不如 `data-content_fjxw` 有意义）
- 需要引入自增计数器（当前无此机制）
- Agent 创建新页面时需要读取当前最大编号，多一步操作
- 与现有 `proj_`、`session-`、`demo_` 命名风格不一致

### 方案 C：保持现有 ID，仅优化 L3 注入

不改目录命名，仅优化 `scan-workspace.ts` 的 L3 输出格式，减少 Agent 上下文中长路径的冗余。

```
当前工作空间中的页面（系统自动扫描）：

- 配置展示 · 数据内容类 [id: demo_1778077850198_fjxwmf]
  - demos/{id}/index.tsx
  - demos/{id}/config.schema.json
```

改为引用式写法，每个页面只在第一行出现一次 ID，后续用 `{id}` 替代。

**优点**：

- 零迁移成本
- 不动目录结构

**缺点**：

- Agent 实际写文件时仍需要拼写完整 28 字符路径
- 兜底场景仍然完全退化
- 只是缓解，不是根治

### 方案对比

| 维度         | 方案 A（语义 Slug） | 方案 B（短 ID） | 方案 C（仅优化 L3） |
| :----------- | :------------------ | :-------------- | :------------------ |
| Agent 可读性 | ⭐⭐⭐              | ⭐⭐            | ⭐⭐                |
| Token 节省   | ⭐⭐⭐ (~33%)       | ⭐⭐⭐ (~50%)   | ⭐⭐ (~15%)         |
| 兜底退化表现 | ⭐⭐⭐ 有语义       | ⭐ 无语义       | ⭐ 无语义           |
| Prompt 简化  | ⭐⭐⭐              | ⭐⭐            | ⭐                  |
| 实现复杂度   | 中                  | 中              | 低                  |
| 迁移成本     | 有                  | 有              | 无                  |
| 碰撞安全性   | ⭐⭐⭐              | ⭐⭐⭐          | ⭐⭐⭐              |

**推荐方案 A**。它在可读性、兜底表现和 prompt 简化上全面领先，迁移成本可控。

---

## 三、方案 A 实施计划

### Task 1：新增 Slug 生成工具函数

**文件**：`packages/author-site/src/lib/fs-utils.ts`

```typescript
/**
 * 将页面名称转为 URL-safe 的 slug。
 * 规则：中文 → 拼音，空格/特殊字符 → `-`，小写，截断 20 字符。
 */
export function generatePageSlug(name: string): string {
  // 1. 中文转拼音（使用 pinyin 库或简单映射）
  // 2. 替换非字母数字为 `-`
  // 3. 合并连续 `-`，去除首尾
  // 4. 小写
  // 5. 截断 20 字符
  // 6. 空结果回退 `page`
}

/**
 * 生成语义化 Demo 页面 ID。
 * 格式 `{slug}_{4位随机}`，如 `shou-ye_a3f2`
 */
export function generateDemoPageId(name?: string): string {
  const slug = generatePageSlug(name || "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}_${rand}`;
}
```

**拼音库选型**：

- 方案一：引入 `pinyin-pro`（~200KB，最准确）
- 方案二：自建常用字映射表（~5KB，覆盖 3000 常用字）
- 方案三：使用 `Intl.Collator` + 正则，无额外依赖但准确度有限

推荐方案二，在精确度和包大小之间取平衡。

### Task 2：更新所有调用点

`generateDemoPageId()` 的调用点：

| 文件          | 行号  | 当前调用               | 修改为                           |
| :------------ | :---- | :--------------------- | :------------------------------- |
| `fs-utils.ts` | L485  | `generateDemoPageId()` | `generateDemoPageId("默认页面")` |
| `fs-utils.ts` | L1192 | `generateDemoPageId()` | `generateDemoPageId(name)`       |

### Task 3：更新 Agent System Prompt

**文件**：`packages/author-site/src/lib/agent/prompts/system-prompt.md`

**当前内容**（第 21 行）：

```
1. 生成唯一 demoId，格式：`demo_{时间戳}_{6位随机字母数字}`，例：`demo_1777894487658_a3f2k1`
```

**改为**：

```
1. 在 `demos/` 下创建新目录，目录名格式：`{页面名称拼音}_{4位随机字母数字}`
   - 示例：`demos/shou-ye_a3f2/`、`demos/xiang-qing-ye_k8m2/`
   - 中文名称转拼音，空格用 `-` 连接，全小写
   - 英文名称直接使用，小写，空格用 `-` 连接
   - 目录名最长 25 字符（拼音部分 20 + `_` + 4 位随机）
```

### Task 4：更新测试

**文件**：`packages/author-site/src/lib/__tests__/fs-utils-multi-demo.test.ts`

更新 `generateDemoPageId` 的测试用例：

```typescript
describe("generateDemoPageId", () => {
  it("有名称时应生成 slug_rand 格式", () => {
    const id = generateDemoPageId("首页");
    expect(id).toMatch(/^shou-ye_[0-9a-z]{4}$/);
  });

  it("英文名称应保持小写", () => {
    const id = generateDemoPageId("Landing Page");
    expect(id).toMatch(/^landing-page_[0-9a-z]{4}$/);
  });

  it("无名称时应使用 page 前缀", () => {
    const id = generateDemoPageId();
    expect(id).toMatch(/^page_[0-9a-z]{4}$/);
  });
});
```

### Task 5：存量数据迁移（可选）

**触发条件**：仅在用户下次打开项目时，如果检测到旧格式目录名则提示迁移。

**迁移步骤**：

1. 读取 `workspace-tree.json` 获取 `pages` 数组中每个页面的 `name` 和 `id`
2. 对每个旧格式页面（匹配 `demo_\d+_[a-z0-9]+`）：
   - 根据 `name` 生成新 slug
   - 新 ID = `{slug}_{旧随机4位}`（保留原随机后缀的一部分以减少冲突）
   - 重命名目录 `demos/{oldId}` → `demos/{newId}`
   - 更新 `workspace-tree.json` 中对应页面的 `id`
   - 更新 `project.json` 中 `demoPages` 对应项的 `id`
3. 快照目录（`data/snapshots/`）中的旧目录也需同步重命名

**风险**：

- 快照路径可能跨多个版本引用，迁移可能破坏历史快照
- **建议**：存量项目不做自动迁移，仅在用户主动触发时执行；新项目直接使用新格式

### Task 6：更新 system prompt 测试

**文件**：`packages/author-site/src/lib/agent/__tests__/system-prompt.test.ts`

确保 `buildDynamicContextPrefix` 输出中的新格式目录名被正确展示。

---

## 四、边界情况处理

### 4.1 同名页面

同一项目内两个页面名称相同（如两个"首页"）：

- 拼音 slug 相同 → 随机后缀不同 → 目录名自然区分
- 示例：`shou-ye_a3f2` vs `shou-ye_k8m2`

### 4.2 超长页面名称

- 拼音部分截断到 20 字符
- 示例："这是一个非常非常长的页面名称用来测试" → slug = `zhe-shi-yi-ge-fei-c`（截断）→ `zhe-shi-yi-ge-fei-c_x7z1`

### 4.3 特殊字符

- emoji、特殊符号直接忽略
- 纯 emoji 名称回退到 `page` 前缀
- 示例："📱手机端" → `shou-ji-duan`

### 4.4 已有目录碰撞

`generateDemoPageId()` 返回后检查目录是否存在，如果存在则重新生成随机后缀（最多重试 3 次）。

```typescript
export function generateUniqueDemoPageId(
  workspacePath: string,
  name?: string,
): string {
  for (let i = 0; i < 3; i++) {
    const id = generateDemoPageId(name);
    if (!fs.existsSync(getDemoDirPath(workspacePath, id))) {
      return id;
    }
  }
  // 3 次碰撞，追加额外随机字符
  return `${generateDemoPageId(name)}_${Math.random().toString(36).slice(2, 4)}`;
}
```

---

## 五、验收标准

- [ ] 新建项目的默认页面目录名包含语义 slug
- [ ] Agent 创建的页面目录名包含语义 slug（符合 system prompt 指导）
- [ ] 兜底场景（workspace-tree.json 不存在）下 Agent 仍能从目录名识别页面用途
- [ ] 存量项目不受影响（不自动迁移）
- [ ] 所有现有测试通过
- [ ] 新增 slug 生成函数的单元测试

---

## 六、依赖与风险

| 风险                  | 概率 | 影响 | 缓解措施                                  |
| :-------------------- | :--- | :--- | :---------------------------------------- |
| 拼音库增加包大小      | 确定 | 低   | 自建常用字映射表（~5KB）                  |
| 存量快照路径失效      | 低   | 中   | 不自动迁移，新项目才用新格式              |
| Agent 仍生成旧格式 ID | 低   | 低   | 更新 system prompt + 兜底扫描兼容两种格式 |
| 多页面同名 slug 碰撞  | 极低 | 低   | 随机后缀保证唯一性                        |

---

## 七、参考

- `packages/author-site/src/lib/fs-utils.ts` — `generateDemoPageId()` 定义
- `packages/author-site/src/lib/agent/prompts/system-prompt.md` — Agent 指令
- `packages/author-site/src/lib/agent/scan-workspace.ts` — L3 上下文扫描
- `packages/author-site/src/lib/agent-prompts/workspace-status.template.ts` — L3 模板
- `packages/author-site/src/lib/agent/system-prompt.ts` — 静态/动态 prompt 构建
- `packages/author-site/src/lib/__tests__/fs-utils-multi-demo.test.ts` — 相关测试
- `docs/plans/已完成/06-项目管理与页面/项目多Demo页面支持方案.md` — 原始多页面设计文档
