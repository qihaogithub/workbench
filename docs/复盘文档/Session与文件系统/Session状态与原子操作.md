# Session与文件系统：原子操作与状态恢复

> 从编辑页保存失败问题分析报告中提取的文件系统操作与Session状态管理经验

---

## 一、核心定位与设计哲学

**解决的最核心问题**：Session的创建、保存、清理生命周期中，如何保证文件系统状态的最终一致性，以及如何从异常状态中自动恢复。

**铁律**：任何依赖文件系统目录的操作，都必须先确保目录存在，而非假设它一定存在。操作失败后的清理步骤不应影响已成功的业务结果。

---

## 二、架构机制与正确方向

### 2.1 统一Session管理系统

项目中曾存在新旧两套Session管理系统：

| 系统 | 创建 | 保存 | 特性 |
|:-----|:-----|:-----|:-----|
| 旧系统（fs-utils.ts） | `createSession` | `mergeSession` | 无status管理，不检查workspace |
| 新系统（session-manager.ts） | `createEditSession` | `saveEditSession` | 有status管理，缺失workspace时可恢复 |

**正确方向**：统一使用新系统，旧系统逐步废弃。避免两套系统混用导致的链路不一致。

### 2.2 Session状态机

```
creating → editing → saving → saved
                    ↓
               (deleteSession 失败)
                    ↓
               saved(残留) + 新session创建
```

`status`字段驱动整个生命周期：
- `creating`：Session创建中
- `editing`：可编辑，正常工作状态
- `saving`：保存中
- `saved`：已保存，可被清理

### 2.3 防御式目录确保

```typescript
export function ensureWorkspaceFiles(workspacePath: string): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const codePath = path.join(workspacePath, "index.tsx");
  const schemaPath = path.join(workspacePath, "config.schema.json");

  if (!fs.existsSync(codePath)) {
    fs.writeFileSync(codePath, DEFAULT_DEMO_CODE, "utf-8");
  }
  if (!fs.existsSync(schemaPath)) {
    fs.writeFileSync(schemaPath, DEFAULT_DEMO_SCHEMA, "utf-8");
  }
}
```

在以下三处调用：
- `createProject`：创建新项目时
- `createSession`：旧系统创建session时
- `createEditSession`：新系统创建session时

---

## 三、反模式与历史避坑

### 3.1 两套系统混用导致状态不一致

**❌ 错误场景**：
1. 打开编辑页 → `POST /api/sessions` → 调用**新系统** `createEditSession`
2. 点击保存 → `POST /api/sessions/merge` → 调用**旧系统** `mergeSession`

**根因**：新系统有workspace缺失时的自动恢复能力，但旧系统没有。混用导致保存失败。

**✅ 正确做法**：统一使用新系统，废弃旧接口。

### 3.2 严格校验导致旧数据无法使用

**❌ 错误写法**：
```typescript
if (sessionMeta.status !== 'editing') {
  return { success: false, error: 'Session not in editing status' };
}
```

**根因**：旧session元数据没有`status`字段，严格校验会拒绝所有旧session。

**✅ 正确写法**：
```typescript
const status = sessionMeta.status || 'editing';  // 兼容旧数据
if (status !== 'editing') {
  return { success: false, error: 'Session not in editing status' };
}
```

### 3.3 清理失败导致状态不一致

**❌ 错误场景**：
```
saveEditSession 执行流程：
1. 检查 status === 'editing' ✅
2. 创建快照 ✅
3. 用 session 覆盖 workspace ✅
4. 记录版本信息到 project.json ✅
5. 将 .session.json 中 status 改为 'saved' ✅
6. deleteSession(sessionId) ❌ ← 失败（如Windows文件锁）
```

此时：
- 版本已成功保存
- session状态已改为saved
- 但session目录残留

下次进入编辑页，`findActiveSession`检查`status !== 'editing'`跳过此session，系统创建新session。但残留的saved状态session是一个不一致状态。

**✅ 正确做法**：
```typescript
// 清理失败不影响保存结果
try {
  deleteSession(sessionId);
} catch (e) {
  console.warn(`[saveEditSession] 清理 session 失败，但保存已成功:`, e);
}

// 自动修复残留的saved状态
if (status !== 'editing' && sessionPath && fs.existsSync(sessionPath)) {
  const metaPath = path.join(sessionPath, ".session.json");
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.status = 'editing';
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  }
}
```

### 3.4 假设workspace必然存在

**❌ 错误场景**：
```typescript
fs.cpSync(workspacePath, sessionPath);  // workspace缺失时直接抛出 ENOENT
```

**根因**：项目目录可能缺少workspace子目录（被意外删除或外部因素导致）。

**✅ 正确做法**：任何操作前先调用`ensureWorkspaceFiles`。

---

## 四、核心指标与安全边界

### 4.1 Session生命周期超时

| 字段 | 说明 |
|:-----|:-----|
| `expiresAt` | Session过期时间戳 |
| 过期处理 | `findActiveSession`跳过已过期的session |
| 清理 | 定时任务或按需清理过期session目录 |

### 4.2 快照与版本管理

| 概念 | 说明 |
|:-----|:-----|
| 快照 | `workspace → snapshots/v{n}`，保存时的完整副本 |
| 版本 | `project.json`中记录的版本历史 |
| 回滚 | 从快照恢复，覆盖当前workspace |

### 4.3 跨平台文件系统差异

| 平台 | 行为 |
|:-----|:-----|
| Unix | 文件删除立即生效，无文件锁 |
| Windows | 文件/目录可能因句柄未释放而删除失败 |

涉及文件删除的操作必须有try-catch保护，删除失败不应导致业务操作失败。

---

## 五、关键教训

### 5.1 操作原子性

多步操作中，前面的步骤成功后，后面的清理步骤失败不应让整次操作返回失败。状态应能自我恢复，而非永久锁定。

### 5.2 防御式编程

任何依赖文件系统目录的操作，都应先确保目录存在。代码不是运行在理想环境中，异常删除、并发冲突都可能出现。

### 5.3 数据兼容性

系统升级时，旧数据（如缺少新字段的元数据）需要兼容处理。不能因为严格校验而拒绝所有旧数据。

### 5.4 日志驱动调试

详细的日志是定位问题的关键。使用`[functionName]`作为日志前缀帮助快速定位到具体失败函数。

```
[mergeSession] workspacePath: ...
[mergeSession] 创建快照: ...
[mergeSession] 文件操作失败: ...
```
