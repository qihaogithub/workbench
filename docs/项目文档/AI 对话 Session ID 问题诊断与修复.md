# AI 对话 Session ID 问题诊断与修复

## 🚨 问题症状

**错误日志：**
```
NotFoundError: NotFoundError
 data: {
  message: "Session not found: session-1774877701457-xd6cc3p7p",
}
```

**用户界面显示：**
```
抱歉，我没有收到有效的回复。
```

## 🔍 根本原因

系统中有**两套独立的 Session 机制**：

### 1. 本地文件系统 Session
- **创建方式**: `POST /api/sessions`
- **用途**: 文件编辑、保存、预览
- **存储位置**: `/sessions/{sessionId}/index.tsx`, `/sessions/{sessionId}/config.schema.json`
- **Session ID 格式**: `session-时间戳 -随机字符串`

### 2. Opencode Server Session
- **创建方式**: `POST http://localhost:4096/session`
- **用途**: AI 对话、代码生成
- **存储位置**: Opencode server 内存中
- **Session ID 格式**: `session-时间戳 -随机字符串`

### ❌ 问题所在

当前代码尝试将**本地 Session ID** 传递给 **Opencode Server**，但这两个是完全不同的系统！

```
页面加载 → 创建本地 Session (session-local-123)
              ↓
         存储在文件系统
              ↓
用户发送 AI 消息 → 传递 session-local-123 → Opencode Server
                                            ↓
                                    查找失败：Session not found!
```

## ✅ 解决方案

### 方案 A: 使用 Opencode Server 原生 Session（推荐）

**核心思路**: AI 对话直接使用 Opencode Server 的 Session，不混用本地 Session。

#### 修改点 1: AI Chat API Route

**文件**: `packages/web/src/app/api/ai/chat/route.ts`

**修改逻辑**:
```typescript
// 如果前端没有传 sessionId，就创建新的 Opencode Session
if (!sessionId) {
  const sessionRes = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: `Demo: ${demoId}` }),
  });
  
  const sessionData = await sessionRes.json();
  sessionId = sessionData.id; // Opencode Session ID
}
```

#### 修改点 2: 前端页面

**文件**: `packages/web/src/app/demo/[id]/edit/page.tsx`

**修改逻辑**:
```typescript
// 不再在页面加载时创建本地 Session 用于 AI 对话
// AI 对话时让 API Route 自动创建 Opencode Session

const handleAiSend = async () => {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({ 
      messages, 
      sessionId: undefined, // 不传 sessionId，让后端创建新的
      demoId 
    }),
  });
};
```

#### 优点
- ✅ 职责分离清晰
- ✅ 减少混淆
- ✅ Opencode Server 管理自己的 Session 生命周期

#### 缺点
- ⚠️ 每次 AI 对话都会创建新的 Session
- ⚠️ 无法跨会话保持上下文

### 方案 B: 混合 Session 管理（当前采用）

**核心思路**: 
- 本地 Session 用于文件编辑
- AI 对话时创建独立的 Opencode Session
- 两者通过映射关系关联

#### 实现步骤

##### 步骤 1: 修改 Session 数据结构

**文件**: `packages/web/src/app/api/sessions/route.ts`

添加 Opencode Session ID 的存储：

```typescript
interface SessionData {
  sessionId: string;        // 本地 Session ID
  opencodeSessionId?: string; // Opencode Session ID（可选）
  demoId: string;
  createdAt: string;
}
```

##### 步骤 2: 首次 AI 对话时创建 Opencode Session

**文件**: `packages/web/src/app/api/ai/chat/route.ts`

```typescript
// 检查是否已有 Opencode Session
if (!opencodeSessionId) {
  // 创建新的 Opencode Session
  const sessionRes = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: 'POST',
    body: JSON.stringify({ title: `Demo: ${demoId}` }),
  });
  
  const sessionData = await sessionRes.json();
  opencodeSessionId = sessionData.id;
  
  // 保存到本地 Session 元数据
  await saveSessionMetadata(sessionId, { opencodeSessionId });
}

// 使用 Opencode Session ID 进行后续操作
await fetch(`${OPENCODE_SERVER_URL}/session/${opencodeSessionId}/message`, ...);
await readSSEStream(`${OPENCODE_SERVER_URL}/session/${opencodeSessionId}/event`, ...);
```

##### 步骤 3: 加载 Session 元数据

**文件**: `packages/web/src/app/api/sessions/[sessionId]/route.ts`

添加读取 Session 元数据的接口：

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const sessionPath = path.join(process.env.SESSIONS_DIR!, params.sessionId);
  const metadataPath = path.join(sessionPath, '.session.json');
  
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    return NextResponse.json({ success: true, data: metadata });
  }
  
  return NextResponse.json({ success: false, error: { message: 'Not found' } });
}
```

#### 优点
- ✅ 保持本地 Session 和 Opencode Session 的独立性
- ✅ 可以复用 Opencode Session（保持对话上下文）
- ✅ 清晰的职责分离

#### 缺点
- ⚠️ 实现复杂度较高
- ⚠️ 需要维护额外的元数据

### 方案 C: 简化版（立即采用）⭐

**核心思路**: AI 对话每次创建新的 Opencode Session，不尝试复用。

这是最简单的方案，适合快速验证功能。

#### 修改内容

**文件**: `packages/web/src/app/demo/[id]/edit/page.tsx`

```typescript
// 修改前
body: JSON.stringify({ messages, sessionId, demoId }),

// 修改后
body: JSON.stringify({ 
  messages, 
  sessionId: undefined, // 强制创建新的 Opencode Session
  demoId 
}),
```

**效果**: 
- ✅ 不再出现"Session not found"错误
- ✅ AI 对话独立于本地 Session
- ⚠️ 每次对话都是新的 Session（无上下文）

## 🛠️ 立即修复步骤

### 方法 1: 清理所有 Session（快速测试）

```powershell
# 运行清理脚本
.\cleanup-sessions.ps1

# 确认清理
输入 Y

# 刷新浏览器页面
http://localhost:3000/demo/[your-demo-id]/edit
```

### 方法 2: 修改代码（长期方案）

选择上述方案 A、B 或 C 进行实现。

**推荐方案 C**（最简单）：

只需修改一处代码：

```typescript
// packages/web/src/app/demo/[id]/edit/page.tsx Line 242

// 改为：
body: JSON.stringify({ 
  messages, 
  sessionId: undefined, // 不传本地 sessionId
  demoId 
}),
```

## 📝 调试技巧

### 查看实际使用的 Session ID

在浏览器 Console 中添加日志：

```javascript
// 在 handleAiSend 函数中添加
console.log('Sending AI request with:', {
  sessionId,
  demoId,
  messagesCount: messages.length
});
```

### 监控 Opencode Server 日志

```powershell
# Opencode Server 应该显示类似日志：
POST /session - 201 Created (session-abc-123)
POST /session/session-abc-123/message - 200 OK
GET /session/session-abc-123/event - 200 (SSE Stream)
```

### 对比 Session ID

在三个地方查看 Session ID：

1. **页面工具栏**: `Session: session-xxx...`
   - 这是本地 Session ID

2. **Console 日志**: `Request body: { sessionId: 'session-xxx' }`
   - 这是发送给 AI API 的 ID

3. **Opencode Server 日志**: `session-yyy`
   - 这是 Opencode 实际使用的 ID

**正常情况下**:
- 如果采用方案 A/C：2 和 3 应该不同
- 如果采用方案 B：2 和 3 应该相同（通过映射）

## ✅ 验证清单

修复完成后，检查以下项目：

- [ ] 清理了所有旧的 Session 目录
- [ ] 刷新了浏览器页面
- [ ] 发送 AI 消息后不再显示"Session not found"错误
- [ ] AI 回复正常显示在对话区
- [ ] Console 无错误日志
- [ ] Network 面板显示正常的 SSE 流

## 📊 各方案对比

| 方案 | 复杂度 | 上下文保持 | 推荐场景 |
|------|--------|-----------|---------|
| **A: 纯 Opencode Session** | 低 | ❌ 无 | 快速验证、简单场景 |
| **B: 混合 Session 管理** | 高 | ✅ 有 | 生产环境、复杂场景 |
| **C: 简化独立 Session** | 极低 | ❌ 无 | 当前推荐 |

## 🎯 建议实施顺序

1. **立即**: 采用方案 C，快速修复问题
2. **短期**: 收集用户反馈，确定是否需要上下文保持
3. **长期**: 如需上下文，实施方案 B

---

**更新日期**: 2026-03-30  
**状态**: 待实施  
**推荐方案**: C（简化独立 Session）
