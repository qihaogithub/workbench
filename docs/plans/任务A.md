
## 🤖 任务 A：基础设施与本地文件会话管理（后端服务）
**目标**：利用 Next.js API Routes 实现本地磁盘文件系统的读写、会话（Session）的隔离管理。
**前置说明**：无需等待前端 UI，可直接使用 Postman 或 API 单元测试进行验证。

### 1. 核心职责
*   **初始化环境**：配置 `pnpm workspace` 和基础的 Next.js API 目录结构。
*   **目录挂载点**：读取根目录或环境变量中的 `DEMOS_DIR`（默认 `./demos`）和 `SESSIONS_DIR`（默认 `./sessions`）。
*   **Session 机制实现（核心）**：
    *   实现 `fs.cpSync` 逻辑：从 `demos/[id]` 复制到 `sessions/[sessionId]`。
    *   实现 `fs.rmSync` 逻辑：销毁 session 或 demo。
    *   合并逻辑：将 `sessions/[sessionId]` 覆盖回 `demos/[id]` 并销毁 session。

### 2. 需要实现的 API 路由
*   `GET /api/demos`：读取 demos 目录下的所有文件夹，返回 `DemoMeta[]` 列表。
*   `POST /api/demos`：创建新的空 Demo 目录（包含初始化的 `index.tsx` 和 `config.schema.json`），返回 DemoMeta。
*   `DELETE /api/demos/[id]`：删除指定 Demo 目录。
*   `POST /api/sessions`：传入 `{ demoId }`，生成 UUID，复制 Demo 目录至 sessions，返回 `sessionId`。
*   `GET /api/sessions/[sessionId]/files`：读取 session 下的 `index.tsx` 和 `config.schema.json`，返回 `DemoFiles`。
*   `PUT /api/sessions/[sessionId]/files`：传入 `DemoFiles`，分别覆盖写入对应文件。
*   `POST /api/sessions/[sessionId]/merge`：将指定 session 目录覆盖回原始 demo 目录，并删除该 session 目录。
*   `DELETE /api/sessions/[sessionId]`：放弃编辑，直接删除 session 目录。

### 3. DoD (完成标准)
*   API 均能正确处理本地文件的 I/O。
*   并发或文件不存在时有健壮的异常处理（如返回 404, 500）。
*   会话复制和合并逻辑通过验证，确保不会污染其他目录。

---
