# config.schema.json 隐藏问题排查

> **创建日期**: 2026-07-31
> **关联**: `docs/plans/进行中/配置面板-Agent友好语法重构方案.md`

## 现象

当同目录存在 `config.ts` 时，Agent 仍可能直接编辑编译产物 `config.schema.json` 而非源文件 `config.ts`。

## 最终方案：permission-manager 集中守卫

**不在各工具中分散判断**。在 `PermissionManager.validateToolCall` 中集中处理——所有 AI 文件工具的统一权限入口（`tool_call` hook）。

### 改动的文件

| 文件 | 变更 |
|------|------|
| `packages/agent-service/src/backends/managers/permission-manager.ts` | 新增 `isShadowedSchemaJson` 助函数 + `validateToolCall` 中追加 `writeFile`/`editFile` 编译产物写保护 |
| `packages/agent-service/tests/unit/permission-manager.test.ts` | 新增 4 个测试 |
| `packages/agent-service/tests/unit/file-tools-live-workspace.test.ts` | 新增 2 个 `listFiles` 隐匿测试 |
| `packages/agent-service/src/backends/pi-tools/file-tools.ts` | `listFiles` 中保留隐藏逻辑 + 诊断日志 |

### 实现

```typescript
// permission-manager.ts

function isShadowedSchemaJson(filePath: string, workingDir: string): boolean {
  const resolved = path.resolve(workingDir, filePath);
  const normalized = resolved.replace(/\\/g, '/');
  if (!normalized.endsWith('/config.schema.json')) return false;
  const configTsPath = normalized.replace(/config\.schema\.json$/, 'config.ts');
  try { return fs.existsSync(configTsPath); } catch { return false; }
}

// validateToolCall 中：
if (['writeFile', 'editFile'].includes(toolName)) {
  const writePath = input?.path || input?.filePath;
  if (writePath && isShadowedSchemaJson(writePath, workingDir)) {
    return {
      block: true,
      reason: `Cannot write to "${writePath}": this file is compiled from config.ts. Please edit "${configTsRef}" instead.`,
    };
  }
}
```

`listFiles` 中的隐匿逻辑保持不变（从 `seen` 集中移除 `config.schema.json`），在 `file-tools.ts` 中独立处理。

### 覆盖范围

| 操作 | 行为 |
|------|------|
| `listFiles` | 保留 `file-tools.ts` 中的过滤逻辑（从 seen 集中移除） |
| `writeFile` → `config.schema.json` | `permission-manager` 拦截，提示编辑 `config.ts` |
| `editFile` → `config.schema.json` | `permission-manager` 拦截，提示编辑 `config.ts` |
| `readFile` → `config.schema.json` | 允许（供 AI 参考） |

### 为什么是 permission-manager

- `validateToolCall` 已经是所有文件工具的**统一权限入口**
- shadowed schema 是权限规则的延伸：编译产物不可直接编辑
- 一处改动，`writeFile`/`editFile` 自动继承，无需逐个工具加守卫
- 未来新增编译产物关系（如 `sketch.scene.json` 由 `sketch.tsx` 编译），只需在 `isShadowedSchemaJson` 追加规则

## 备选方案

### 方案 B：Authority 快照层过滤（待评估）

在 `WorkspaceMutationAuthority.getSnapshot()` 构建 `resources` 时，扫描完所有 key 后追加后处理：若 `demos/{pageId}/config.ts` 存在，从结果中删除 `demos/{pageId}/config.schema.json`。

**切入位置**：`workspace-mutation-authority.ts:238-246`，在 `for (const resourcePath of Object.keys(state.resourceHashes))` 循环后、`return { state, resources }` 前，对 `resources` 做一次 shadow key 清理。

**核心代码**：

```typescript
// getSnapshot() 中，resources 构建完成后：
const shadowed = new Set<string>();
for (const key of Object.keys(resources)) {
  if (/\/config\.schema\.json$/.test(key)) {
    const tsKey = key.replace(/config\.schema\.json$/, 'config.ts');
    if (resources[tsKey] !== undefined) shadowed.add(key);
  }
}
for (const key of shadowed) delete resources[key];
```

**配套变更**：

| 位置 | 变更 |
|------|------|
| `readResourceHashes` | 同样需要后处理，确保 `state.resourceHashes` 也不包含 shadowed key，否则 rootHash 不一致会始终触发 drift |
| `listFiles`（`file-tools.ts`） | 可移除 `seen` 集的隐匿逻辑（快照已过滤） |
| `permission-manager` | 写保护守卫保留 or 移除均可（快照已无此文件的基线，writeFile 差异取决于是否允许 AI 通过文件系统 fallback 写入） |
| 编译管线 | 不受影响——`config.schema.json` 仍是物理文件，编译工具直接读取文件系统，不走 Authority 快照 |

**优势**：

- **真正一次性解决**：代理快照的所有消费者（`listFiles`、`readFile`、`writeFile` 基线、协作同步）都天然看不到 shadowed 文件
- `listFiles` 的隐匿逻辑可简化为零——快照中不存在，自然不显示
- 权限守卫可选保留（双重防线）或移除

**风险**：

- `readFile` 的 Authority 路径会走 `snapshot.resources[args.path]`（line 220），若快照中不包含 `config.schema.json`，会落回文件系统 `fs.promises.readFile` 且成功。需要在 `readFile` 中也补一个写保护或 shadow 判断，非真正的单一切入点。
- 需要同时修改 `readResourceHashes`（用于 rootHash 计算），否则每次 snapshot 都检测到 drift 并触发 reconciliation，引入性能开销
- `readResourceHashes` 是 Authority 启动恢复和状态持久化的核心路径，改动影响面比 permission-manager 更大

### 两种方案对比

| 维度 | 方案 A：permission-manager | 方案 B：Authority 快照层 |
|------|---------------------------|------------------------|
| 切入位置 | `validateToolCall` | `getSnapshot` + `readResourceHashes` |
| 覆盖范围 | `writeFile`/`editFile` | 所有从快照读取的路径 |
| 单一切入点 | ✅ 是（权限层统一） | ⚠️ 近似，但 `readFile` 文件系统 fallback 仍需单独处理 |
| listFiles 简化 | 不可（需保留当前过滤逻辑） | 可（快照中已无该 key） |
| 影响面 | `permission-manager.ts` 一个文件 | `workspace-mutation-authority.ts` 核心路径 |
| 扩展性 | 追加守卫规则 | 追加 shadow 规则 |
| 风险 | 低 | 中（涉及 rootHash 一致性） |

当前采用方案 A，方案 B 留待后续评估。

## 排查历史

1. **初版方案**：仅依赖 Authority 快照中的 `seen.has("config.ts")` → 失败，Authority 快照未包含 `config.ts`。
2. **根因 1**：`shared/src/contracts.ts` 的 `isManagedWorkspaceResource` 正则未包含 `config\.ts`，导致 Authority 启动恢复时跳过该文件 → 已修复。
3. **根因 2**：已有 live workspace 的快照不会自动重扫新增文件 → 添加文件系统 `existsSync` 兜底。
4. **代码审计**：`config.workingDir` 始终指向 live workspace 路径，排除路径不匹配假设。`listFiles` 隐匿逻辑验证正确。
5. **最终方案**：在 `permission-manager` 集中切入，让 `writeFile`/`editFile` 到 shadowed `config.schema.json` 时直接拦截。

## 已注册的资源链条

`config.ts` 在整个系统中已完整注册：

| 位置 | 文件 | 状态 |
|------|------|------|
| 资源类型注册 | `project-core/src/workspace-resource-registry.ts` | 已注册为 `page-schema` |
| 资源管理白名单 | `shared/src/contracts.ts` (`isManagedWorkspaceResource`) | 正则已包含 `config\.(schema\.json\|ts)` |
| 协作房间路由 | `agent-service/src/collab/workspace-file-persistence.ts` | 映射为 `page-schema` |
| 文件访问白名单 | `agent-service/src/session/session-guard.ts` | `ALLOWED_FILES` 包含 `config.ts` |
| 路径权限白名单 | `agent-service/src/backends/pi-tools/permissions.ts` | 显式添加 |

## 影响范围

- 仅影响 Agent 端的文件列表展示和写操作拦截，不影响 `config.ts` 写入、编译、配置面板等任何功能
- `config.schema.json` 仍然是所有运行时消费者的合法读取文件
- 只涉及 `packages/agent-service` 一个包
