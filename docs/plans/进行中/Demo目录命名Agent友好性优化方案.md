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

### 1.2 问题

| 问题                   | 影响                                                                                          |
| :--------------------- | :-------------------------------------------------------------------------------------------- |
| **28 字符无语义**      | Agent 每次文件操作需拼写完整长串，L3 上下文每页消耗 ~90 tokens                                |
| **Agent 需自造时间戳** | system-prompt.md 要求 Agent 生成 `demo_{Date.now()}_{random6}`，LLM 容易位数/格式出错         |
| **兜底场景退化**       | `workspace-tree.json` 不存在时，目录名直接当页面名 → `demo_1778077850198_fjxwmf` 完全无法识别 |

---

## 二、设计决策

### 2.1 新目录名格式

```
{有意义的名称}_{4位随机串}
```

示例：`product-detail_a3f2`、`homepage_k8m2`、`default-page_w4t7`

### 2.2 三条创建路径 — 各自命名

| 路径           | 触发方                   | 谁命名                    | 命名方式                               | 示例                        |
| :------------- | :----------------------- | :------------------------ | :------------------------------------- | :-------------------------- |
| **UI 创建**    | 用户点击"新建页面"       | 用户给名称，系统生成 slug | `generatePageSlug(中文名)` — 中文→拼音 | `shang-pin-xiang-qing_k8m2` |
| **Agent 创建** | Agent 按指令操作         | Agent 自主命名            | Agent 用有意义的英文名称               | `product-detail_a3f2`       |
| **系统初始化** | `ensureWorkspaceFiles()` | 默认名称                  | `generatePageSlug("Default Page")`     | `default-page_w4t7`         |

**核心原则**：

- **Agent 不需要拼音转换** — 自主用英文命名即可
- **不需要专门工具** — Agent 直接 writeFile 创建目录
- **显示名与目录名分离** — `workspace-tree.json` 中 `name` 字段是中文展示名，目录名是英文 ID（现有架构已支持）

### 2.3 与当前架构的关系

现有 `workspace-tree.json` 已经实现了 **目录名（id）与显示名（name）分离**：

```json
{
  "pages": [
    {
      "id": "product-detail_a3f2",
      "name": "商品详情",
      "order": 0,
      "parentId": null
    }
  ]
}
```

- `id` = 目录名 = `product-detail_a3f2`（Agent 可见可读）
- `name` = 前端展示名 = `商品详情`（用户可见可读）

**无需修改数据结构，只需改生成规则。**

---

## 三、实施计划

### Task 1：新增 `generatePageSlug` 函数

**文件**：`packages/author-site/src/lib/fs-utils.ts`

```typescript
/**
 * 将页面名称转为文件系统安全的 slug。
 * - ASCII 字符：保留字母数字，空格/特殊字符 → `-`，小写
 * - 非 ASCII 字符（中文等）：转拼音
 * - 截断到 20 字符，合并连续 `-`，去除首尾
 * - 空结果回退 `page`
 */
export function generatePageSlug(name: string): string {
  // 实现
}
```

**拼音库选型**（仅 UI 路径使用）：

- 方案一：引入 `pinyin-pro`（~200KB，最准确）
- 方案二：自建常用字映射表（~5KB，覆盖 3000 常用字）
- 方案三：非 ASCII 字符直接丢弃，仅保留 ASCII 部分（零依赖，中文名可能退化）

### Task 2：修改 `generateDemoPageId` 签名

```typescript
// 当前
export function generateDemoPageId(): string {
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 改为
export function generateDemoPageId(name?: string): string {
  const slug = generatePageSlug(name || "Default Page");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}_${rand}`;
}
```

### Task 3：更新系统侧调用点

| 文件                | 函数                        | 当前调用               | 改为                                 |
| :------------------ | :-------------------------- | :--------------------- | :----------------------------------- |
| `fs-utils.ts` L485  | `ensureWorkspaceFiles()`    | `generateDemoPageId()` | `generateDemoPageId("Default Page")` |
| `fs-utils.ts` L1192 | `createWorkspaceDemoPage()` | `generateDemoPageId()` | `generateDemoPageId(name)`           |

`name` 来自 UI 用户输入（中文），由 `generatePageSlug` 转为拼音 slug。

### Task 4：更新 Agent System Prompt

**文件**：`packages/author-site/src/lib/agent/prompts/system-prompt.md`

**当前**（第 21 行）：

```
1. 生成唯一 demoId，格式：`demo_{时间戳}_{6位随机字母数字}`，例：`demo_1777894487658_a3f2k1`
```

**改为**：

```
1. 在 `demos/` 下创建新目录，用一个有意义的英文名称命名，后缀 4 位随机字母数字
   - 示例：`demos/product-detail_a3f2/`、`demos/homepage_k8m2/`
   - 英文小写，单词用 `-` 连接，目录名最长 25 字符
   - 不要用时间戳或纯数字作为目录名
2. 在目录中创建 `index.tsx` 和 `config.schema.json`
3. 在 `workspace-tree.json` 的 `pages` 数组中追加记录，`id` 为目录名，`name` 为中文显示名
```

### Task 5：更新兜底扫描的显示名

**文件**：`packages/author-site/src/lib/agent/scan-workspace.ts`（L79-84）和 `fs-utils.ts`（L447-452）

当前兜底逻辑用目录名作为页面名。改为：提取目录名中 `_` 前的 slug 部分，将 `-` 转为空格作为可读名。

```typescript
// 当前
name: entry.name; // → "product-detail_a3f2"

// 改为
name: entry.name.split("_")[0].replace(/-/g, " "); // → "product detail"
```

### Task 6：更新测试

**文件**：`packages/author-site/src/lib/__tests__/fs-utils-multi-demo.test.ts`

```typescript
describe("generateDemoPageId", () => {
  it("有名称时应生成 slug_rand 格式", () => {
    const id = generateDemoPageId("Homepage");
    expect(id).toMatch(/^homepage_[0-9a-z]{4}$/);
  });

  it("中文名称应转拼音", () => {
    const id = generateDemoPageId("首页");
    expect(id).toMatch(/^shou-ye_[0-9a-z]{4}$/);
  });

  it("无名称时应使用 default-page", () => {
    const id = generateDemoPageId();
    expect(id).toMatch(/^default-page_[0-9a-z]{4}$/);
  });
});
```

---

## 四、边界情况

| 场景                      | 处理                                                        |
| :------------------------ | :---------------------------------------------------------- |
| **同名页面**              | slug 相同但随机后缀不同：`homepage_a3f2` vs `homepage_k8m2` |
| **超长名称**              | slug 截断到 20 字符                                         |
| **纯 emoji/特殊字符名称** | 回退到 `page` 前缀                                          |
| **目录碰撞**              | 重试 3 次生成不同随机后缀，仍碰撞则追加额外随机字符         |
| **存量项目**              | 不自动迁移，旧格式 `demo_{ts}_{rand}` 仍正常工作            |

---

## 五、验收标准

- [ ] UI 创建的页面：目录名包含中文拼音 slug
- [ ] Agent 创建的页面：目录名包含 Agent 自主选取的英文名
- [ ] 系统初始化的默认页面：目录名包含 `default-page` slug
- [ ] 兜底场景下 Agent 能从目录名识别页面用途
- [ ] 存量项目不受影响
- [ ] 所有现有测试通过

---

## 六、风险

| 风险               | 概率 | 缓解                                 |
| :----------------- | :--- | :----------------------------------- |
| 拼音库增加包大小   | 确定 | 自建常用字映射表（~5KB）或零依赖方案 |
| 存量快照路径失效   | 低   | 不自动迁移                           |
| Agent 仍生成旧格式 | 低   | 更新 prompt + 兜底扫描兼容两种格式   |

---

## 七、参考文件

- `packages/author-site/src/lib/fs-utils.ts` — `generateDemoPageId()` 定义
- `packages/author-site/src/lib/agent/prompts/system-prompt.md` — Agent 指令
- `packages/author-site/src/lib/agent/scan-workspace.ts` — L3 上下文扫描
- `packages/author-site/src/lib/__tests__/fs-utils-multi-demo.test.ts` — 相关测试
- `docs/plans/已完成/06-项目管理与页面/项目多Demo页面支持方案.md` — 原始多页面设计文档
