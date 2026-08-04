# 创作端 author-site CPU 高占用问题排查

## 最近修复（2026-07-31 复查）

1. **docker-compose.yml `KNOWLEDGE_RECONCILE_INTERVAL_MS` 实际仍为 5000（5s）** — 上次只改了 server.ts 源码默认值，docker-compose 环境变量覆盖未同步。改为 60000。
2. **`registerPreviewModule` 每次请求都写磁盘** — 增加 `fs.existsSync` 检查，磁盘文件已存在时跳过 writeFileSync + renameSync + pruneFileCache。
3. **编译请求增加 250ms 防抖** — `PreviewPanel` compile useEffect 中 `compile()` 改为 `setTimeout(compile, 250)`，清理时 clearTimeout。

## 已修复的问题

### 1. Docker 构建缓存爆炸（根源性）

**现象：** OrbStack VM 磁盘被 207GB 构建缓存填满，VM 8GB 内存不够用，触发内部 swap，导致所有容器健康检查超时、Docker 命令 timeout。

**根因：** 多次 `docker compose build --no-cache` 积累了大量构建缓存层，未定期清理。

**修复：** `docker system prune -af` 清理后缓存降至 168MB，总镜像从 12 个降至 5 个。

**影响：** 修复前 CPU 满是因为 VM 在 swap 和 I/O 等待中死循环。修复后 CPU 才真正反映程序本身的负载。

### 2. `findSessionPath` 全目录扫描（程序性）

**现象：** 每次 session API 请求都触发 `findSessionPath`，它做 O(n³) 的全目录递归扫描（读取 54 个 session 目录的 2-3 层结构）。

**根因：** `findSessionPath` 不知道 `userId` 和 `projectId`，只能通过遍历 `data/sessions/` 下所有目录来匹配 `sessionId`。每次调用扫描 54+ 目录、读取 `.session.json`、JSON.parse。

**修复：** 新增 `sessionPathIndex` 内存索引（`packages/author-site/src/lib/paths.ts`），启动时一次性扫描建立索引，后续查表 O(1)：
- 会话创建时 `registerSessionPath()` 注册
- 会话删除时 `unregisterSessionPath()` 清理
- 缓存 TTL 从 60s 提升到 5min

### 3. `getSessionMeta` 双重扫描（程序性）

**现象：** `getSessionMeta` 先调 `sessionExists()` 扫描一次，再调 `getSessionPath()` 扫描一次，实际只需要一次。

**修复：** 改为直接调用 `findSessionPath()`，返回值即为路径，无需额外检查。

### 4. knowledge-service reconcile 间隔过短（程序性）

**现象：** `KNOWLEDGE_RECONCILE_INTERVAL_MS` 默认 5s，每 5 秒扫描整个 `dataDir` 项目目录树。

**修复：** 源代码默认值改为 60s（`packages/knowledge-service/src/server.ts:30`）。

### ⚠️ 4b. docker-compose.yml 仍覆盖为 5s（修复不完整）

**现象：** 上述修复只改了 server.ts 的源代码默认值，但 `docker-compose.yml` 第 13 行仍通过环境变量覆盖为 `5000`：
```yaml
KNOWLEDGE_RECONCILE_INTERVAL_MS=${KNOWLEDGE_RECONCILE_INTERVAL_MS:-5000}
```

**根因：** docker-compose.yml 的环境变量覆盖优先级高于 server.ts 的代码默认值，容器中实际仍为 5s。

**修复：** 将 docker-compose.yml 默认值从 `5000` 改为 `60000`，与 server.ts 保持一致。

**影响：** 每次 reconcile 都执行 `readdirSync(data/projects/)`、读取每个项目的 `project.json`、对每个模板项目做 SQL 查询（即使哈希匹配跳过重索引）。在有很多项目的容器中，5s 一次的全量扫描会增加不必要的 I/O 负载。

## 当前仍存在的 CPU 问题

### 0. knowledge-service reconcile 间隔实际仍为 5s（修复遗漏）

见上文 4b。`docker-compose.yml` 环境变量覆盖未同步更新，容器中实际间隔仍为 5s。**本次修复。**

### 1. Next.js 运行时编译（sucrase）— 主要 CPU 消耗点

**现象：** author-site 的 `next-server` 进程 CPU 在 5%-100% 之间波动，峰值出现在预览编译时。

**根因：** author-site 的 `/api/compile` 端点在每次编辑保存时触发 sucrase 编译（`compile-api` 日志显示 `elapsedMs: 2-59ms`）。sucrase 本身是 CPU 密集型操作（同步 `transform()` 阻塞事件循环），在单核容器（cpus=1）中会占满一个核。

**日志证据：**
```
[PreviewRuntime][compile-api] {
  requestKind: 'inline-code',
  elapsedMs: 59
}
```

**当前状态：** 未修复。CPU 波动是正常行为，单核容器下 sucrase 编译必然占满一个核。

### 1a. 编译请求无防抖 — 每次代码变更立即触达

**现象：** `PreviewPanel` 的 `useEffect` 直接依赖 `code` 变量，每次代码变更（每个字符输入、每次 AI 流式写入）都会触发新的 `POST /api/compile`。虽然会 abort 前一个请求，但频繁 abort + 新建会导致不必要的服务器负载。

**根因:** `packages/demo-ui/src/PreviewPanel.tsx` 第 898 行，`useEffect` 依赖数组包含 `code`，无防抖。

**前端缓存** (`compile-cache.ts`) 可以命中同一份代码的缓存，但在代码持续变化（编辑中）时不会命中，因为缓存 key 是 `sessionId:demoId:codeFingerprint`。

**当前状态：** 未修复。编辑中的连续编译请求是正常的，但缺少防抖会在快速输入或 AI 流式输出时产生不必要的负载。

### 2. `registerPreviewModule` 每次请求都写磁盘

**现象：** 即使服务端编译缓存命中（`compileCache`），`/api/compile` 路由（`route.ts:88`）仍每次调用 `registerPreviewModule()`，包含：
- `writeFileSync(tempFile)` + `renameSync(tempFile, targetPath)` 原子写入
- `pruneFileCache()`：`readdirSync` 扫描所有 preview-modules 文件 + `statSync` 每个文件时间戳 + 可能 `rmSync` 过期文件

**根因：** `registerPreviewModule` 写在路由层（`route.ts:88`），而非 `compileCode` 内部，导致缓存命中时也执行磁盘 I/O。

**当前状态：** 未修复。低开销但每请求的磁盘 I/O 累积会增加容器负载。

### 3. 浏览器端预览轮询

**客户端代码** 中有多个 polling 循环：
- **Workspace authority 轮询：** `useWorkspaceAuthorityState.ts` 每 2s 调用 `GET /api/workspace/.../events`（仅当标签页可见时）
- **截图状态轮询：** `useScreenshotGeneration.ts` 每 1.5s–5s 调用 `GET /api/screenshots/status/...`（截图生成期间，最长 60s）

每个请求都会触发 Next.js 服务端处理，在单核容器中累积。

### 4. 截图重新生成也触发编译

**现象：** 代码变化后约 3s（防抖），`regeneratePageSnapshot` 触发 `POST /api/screenshots/generate`，截图服务内部也会调用 compile，导致每次代码变更最终产生**两次编译**（一次预览面板直达，一次截图间接 3s 后）。

**当前状态：** 未修复但影响有限，3s 防抖避免重叠。

### 5. agent-service WebSocket 心跳（30s）和 session 清理（5min）未 unref

**现象：** `setInterval` 定时器未 `.unref()`，在 agent-service 正常运行时没有影响，但会让事件循环持续运行。

**当前状态：** 低影响。只有 agent-service 自身运行时才会有 CPU 开销，不影响 author-site。

## 后续排查方向

### 方向一：编译防抖 ✅ 已实施

在 `PreviewPanel` 的 compile `useEffect` 中增加 250ms 防抖（`COMPILE_DEBOUNCE_MS = 250`），减少快速连续输入或 AI 流式输出时的编译请求频率。

**修改文件：** `packages/demo-ui/src/PreviewPanel.tsx` — 将 `compile()` 改为 `setTimeout(compile, 250)`，cleanup 中 `clearTimeout(debounceTimer)`。

### 方向二：`registerPreviewModule` 磁盘写入优化 ✅ 待实施

在 `route.ts:88` 调用前检查 `moduleHash` 对应的磁盘文件是否已存在，已存在则跳过写盘。

### 方向三：减少非必要容器

当前容器运行情况：

| 容器 | 必要性 | 建议 |
|------|--------|------|
| author-site | 必需 | 核心服务 |
| viewer-site | 必需 | 浏览端 |
| agent-service | 可选 | AI 功能不需要时停掉 |
| screenshot-service | 可选 | 不需要截图时停掉 |
| knowledge-service | 可选 | 不需要知识库时停掉 |

### 方向四：增加 CPU 配额

当前 `docker-compose.yml` 中 author-site 的 `cpus: "1.0"`。如果宿主机有富余，可以提升到 `cpus: "2.0"`。

## 验证命令

```bash
# 实时监控 CPU
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# 查看编译日志
docker logs --tail 50 workbench-author-site-1 2>&1 | grep "compile-api"

# 查看 session 查找日志
docker logs --tail 50 workbench-author-site-1 2>&1 | grep "findSessionPath"

# 查看健康检查状态
docker compose --env-file .env.docker ps
```

## 相关文件

- `packages/author-site/src/lib/paths.ts` — session 路径查找、索引
- `packages/author-site/src/lib/fs-utils.ts` — session 元数据、删除
- `packages/author-site/src/lib/session-manager.ts` — session 创建
- `packages/knowledge-service/src/server.ts` — reconcile 间隔
- `docker-compose.yml` — 容器资源限制