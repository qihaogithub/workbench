# 创作端 CLI 优化方案（校正版）

> 基于 2026-07-21 正式环境项目数据推送实战经验，识别出 7 个关键缺口，制定 CLI 整体优化方案。
> 2026-07-21 由工程 agent 按代码现状校验并校正：原方案的目标与分层保留，鉴权设计、干跑位置、workspace 修复边界、传输策略、文件规划按仓库实际情况重写。校正要点见文末「与原方案的差异」。
> 实施状态：2026-07-21 已完成 Phase 1–5，包括远程鉴权、整项目同步、发布 dry-run/图片控制、Workspace/内容图维护和 doctor 远程诊断；验证结果见本次工程任务交付。

## 背景

将本机项目 `proj_1779608460378`（广场页面）推送到正式环境 `10.131.75.39` 时暴露出以下问题：

1. **无远程登录命令** — 必须手动 curl 获取 JWT 再设环境变量
2. **无远程数据同步命令** — `ow submit` 只支持 scaffold 项目包工作流，无法直接推送 `data/projects/` 原始数据，只能手动 rsync
3. **发布前置校验不完整** — 本地 `ow publish check` 无法预演 author-site 端发布管线（lockedDependencies 编译、图片本地化），问题到真实发布时才暴露
4. **Workspace 引用脆弱** — 删除 live workspace 后 `activeWorkspaceId` 悬空，publish route 的同步前置检查永远返回 400，发布死循环（服务端 bug，见第四节）
5. **错误信息不透明** — publish route 的 catch 只映射 4 种已知错误，编译错误等一律落到无详情的 `PUBLISH_FAILED`；图片本地化失败详情只打 console.warn
6. **缺内容图谱/workspace 管理命令** — flush&sync 文件拼接污染只能手动 `rm -rf`
7. **图片本地化不可控** — 外部图片下载串行且无显式超时（undici 默认超时极长），40+ 张慢图让发布看似卡死

## 范围与约束

- CLI 整体优化，`ow`（project-cli）和 `ops-cli`（OPS/CLI）保持独立不合并
- 新增能力均为 `project-core` 或 author-site API 的薄封装，不复制业务逻辑；领域逻辑先补 `project-core`
- 不考虑向后兼容（项目未上线阶段）
- 涉及包：`packages/project-cli/`、`packages/project-core/`、`packages/author-site/`
- `project-cli` 现状是单文件 `src/index.ts`（约 3100 行，手写 `register()` 注册 + esbuild 打包）。本次新增模块放独立源文件、在 index.ts 注册，不重构存量命令

## 现状事实（校正依据）

| 事实 | 位置 |
|------|------|
| 登录 API 存在，JWT 只写 httpOnly cookie（`auth_token`，7 天），body 不返回 token | `author-site/src/app/api/auth/login/route.ts`、`lib/auth/jwt.ts` |
| 服务端各 route 用 `getAuthCookie()` 读 cookie 鉴权，不支持 `Authorization: Bearer`；无 API Key、无 refresh token、用户无角色字段、项目无 owner 字段 | `middleware.ts`、各 route |
| CLI 已有以 `Cookie: auth_token=<token>` 调 author-site publish API 的先例（`AUTHOR_SITE_URL` / `AUTHOR_SITE_AUTH_TOKEN` 环境变量） | `project-cli/src/index.ts` `publishViaAuthorSite()` |
| 发布读取 `data/projects/<id>/workspace/`（canonical workspace）；编译错误直接 throw，无逐页收集 | `author-site/src/lib/publish-manager.ts` |
| 外部图片下载失败＝警告并保留原 URL（不阻断）；本地文件缺失才阻断。下载串行、无显式超时 | `lib/publish/image-processor.ts` |
| publish route 无 workspaceId 时的同步前置检查：`activeWorkspaceId` 指向已删除 workspace 时条件恒真 → 永远 400 | `api/projects/[projectId]/publish/route.ts:113-131` |
| `restoreProjectVersion` 已有「清空 activeWorkspaceId / canonicalSynced* 字段」的先例 | `project-core/src/service.ts:3096-3112` |
| `ow project pull`（scaffold 拉取）、`ow project materialize`（按 commit 物化）已存在 | `project-cli/src/index.ts` |
| `exportProjectPackage` 是 scaffold 包格式（JSON+base64、要求 workspace proof、排除 content/），不适合原始数据同步 | `project-core/src/service.ts:421` |
| 项目目录 = `project.json` + `workspace/` + `content/`；本地实测最大 32MB。`versions` 引用的快照在 `data/snapshots/<id>/`，不在项目目录内 | `data/projects/` |
| 仓库无 tar/zip 依赖 | 各 package.json |
| shared 的 `ApiErrorResponse.error.details?: unknown` 已存在 | `packages/shared/src/index.ts` |

---

## P0 — 核心能力组

### 一、鉴权层

**目标**：让 CLI 具备「登录到远程 author-site」的一等公民能力，无需手动 curl 拿 JWT。

#### 新增命令

| 命令 | 功能 |
|------|------|
| `ow login [--remote <name>] [--username <u>] [--password <p>]` | 交互式（或参数）输入用户名密码 → POST `/api/auth/login`（`includeToken: true`）→ 缓存 JWT 到本机配置 |
| `ow logout [--remote <name>]` | 清除对应 remote 的缓存凭证 |
| `ow whoami [--remote <name>]` | 显示当前登录身份、目标远程、token 剩余有效期 |
| `ow remote add <name> <url>` | 注册远程 author-site |
| `ow remote remove <name>` | 删除远程 |
| `ow remote use <name>` | 切换默认远程 |
| `ow remote list` | 列出已配置远程（含当前激活、登录状态） |

#### 凭证存储（单文件）

```
~/.workbench/cli-config.json   （权限 0600）
{
  "defaultRemote": "prod",
  "remotes": {
    "prod": { "url": "http://10.131.75.39:3200", "username": "admin",
              "token": "<jwt>", "tokenExpiresAt": 1753000000000 }
  }
}
```

不拆 credentials.json / remotes.json 两个文件——url 会存两份、易状态不一致；当前规模单文件足够。

#### 认证优先级

```
--auth-token CLI 参数
  → AUTHOR_SITE_AUTH_TOKEN 环境变量（沿用现有约定，CI 友好）
    → ~/.workbench/cli-config.json 中对应 remote 的缓存 token
```

#### 关键行为

- 服务端改造（唯一一处）：login route 支持 body `includeToken: true`，此时响应 data 增加 `{ token, expiresAt }`。浏览器登录不受影响
- CLI 所有远程调用统一带 `Cookie: auth_token=<token>` 头（与现有 `publishViaAuthorSite` 一致，服务端零改造）。**不引入 Bearer 支持**——所有 route 都从 cookie 读 token，改造面大、收益低
- token 过期或剩余 < 24h 时 `whoami`/远程命令输出警告；401 时提示 `ow login`。**不做静默刷新**——无 refresh token 机制，静默刷新意味着存明文密码，不做
- **不做 API Key**——author-site 无此体系，新建属于账号体系工程，超出本次范围
- **不在配置中存 SSH 信息**——见第二节，SSH 降级已砍

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/project-cli/src/remote-config.ts` | **新增** — cli-config.json 读写（0600）、remote 解析 |
| `packages/project-cli/src/remote-api.ts` | **新增** — 统一远程调用层（注入 Cookie 头、统一错误映射为 `error.code`/`nextActions`） |
| `packages/project-cli/src/index.ts` | **修改** — 注册 login/logout/whoami/remote 命令组；`publishViaAuthorSite` 改走 remote-api 层 |
| `packages/author-site/src/app/api/auth/login/route.ts` | **修改** — 支持 `includeToken` |

---

### 二、远程项目数据同步

**目标**：让 CLI 能直接推送/拉取 `data/projects/<id>/` 原始项目数据到远程服务器，不依赖 scaffold 项目包工作流。

#### 新增命令（独立 `sync` 命令组）

| 命令 | 功能 |
|------|------|
| `ow sync push <projectId> [--remote <name>]` | 打包本地 `data/projects/<id>/` → POST 到远程 import API |
| `ow sync pull <projectId> [--remote <name>]` | 从远程 export API 拉取 → 解包覆盖本地（覆盖前备份） |
| `ow sync diff <projectId> [--remote <name>]` | 对比本地与远程文件清单（路径 + sha256 + size），输出 added/removed/changed |

不复用 `ow project push/pull` 命名：`project pull` 已被 scaffold 工作流占用，push/pull-remote 混用两种语义会造成歧义。`sync` 组语义即「原始数据目录同步」。

#### 传输策略：仅 API（砍掉 SSH 降级）

原方案的「API 不可达 → SSH rsync 降级」不做。理由：import/export API 本身就是为替代手动 rsync 而建，再维护一条 SSH 通道（host/user/key/port 配置、密码管理、rsync 参数拼装）引入大量与产品无关的代码和安全面；紧急兜底继续用 `scripts/deploy.sh` 已有的 SSH 通道，职责不混。

#### 新增 author-site API 路由

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/projects/[projectId]/export?manifest=1` | GET | 仅返回文件清单 JSON（path/sha256/size），供 diff |
| `/api/projects/[projectId]/export` | GET | 将 `data/projects/<id>/` 打为 tar.gz 流式下载 |
| `/api/projects/[projectId]/import` | POST | 接收 tar.gz（`application/gzip`），解包写入 `data/projects/<id>/` |

鉴权：登录即可（与 publish route 同标准——项目无 owner 字段，不存在 admin/creator 角色体系）。

#### import 行为（关键设计）

1. 校验大小上限（默认 100MB，`SYNC_IMPORT_MAX_BYTES` 可配），tar 解包做路径安全校验（拒绝绝对路径、`..` 逃逸、symlink）
2. 覆盖前备份远程现有目录到 `data/snapshots/<projectId>/pre-import-<timestamp>/`
3. 解包后**规范化 project.json**（复用 `restoreProjectVersion` 的字段清理先例）：
   - 清空 `activeWorkspaceId`、`activeWorkspaceUpdatedAt`、`canonicalSyncedWorkspaceId`、`canonicalSyncedRevision`、`canonicalSyncedRootHash`（避免推送后指向远端不存在的 workspace——这正是实战踩过的悬空坑）
   - 清空 `versions`（快照在 `data/snapshots/`，不随包传输，保留引用必然悬空）
   - 清空 `publishedVersion`、`publishedAt`（远端需显式重新发布）
4. 打包范围 = 项目目录全量（含 `content/`）。不排除内容图谱：排除后远端 state.json/commits 与 workspace 不一致，重建路径反而更复杂；体积实测可控

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/project-core/src/project-transfer.ts` | **新增** — 打包/解包/清单/规范化领域逻辑（CLI 与 author-site 复用） |
| `packages/project-core/package.json` | **修改** — 新增 `tar` 依赖 |
| `packages/author-site/src/app/api/projects/[projectId]/export/route.ts` | **新增** |
| `packages/author-site/src/app/api/projects/[projectId]/import/route.ts` | **新增** |
| `packages/project-cli/src/sync-commands.ts` | **新增** — sync push/pull/diff 实现 |
| `packages/project-cli/src/index.ts` | **修改** — 注册 sync 命令组 |

---

### 三、发布干跑模式

**目标**：在实际发布前预演**author-site 端**的完整发布管线（图片本地化、lockedDependencies 编译、产物生成），提前暴露问题。

#### 校正后的形态

```bash
ow publish project <id> --dry-run [--remote <name>] [--json]
```

- 干跑放在 author-site 端而非本地：本地 `ow publish check`（结构 + 运行时校验，已含编译类契约检查）保持现状；但真实发布走 author-site 的 `compileCode`（lockedDependencies + CDN 依赖策略）和图片本地化，只有同一条管线的干跑才有预演价值。**不给 `publish check` 加 `--dry-run` 标志**——check 本来就不写入，标志语义重复
- 实现：`publishProject(projectId, { dryRun: true })` 走完全部管线（图片下载到临时目录、逐页编译、产物生成），但**不** rename 到正式目录、不创建版本快照、不创建 publish commit、不更新项目 meta、不重建索引，结束后清理临时目录
- 干跑天然完成「图片可达性检查」（真实下载比 HEAD 预检更准——HEAD 常被图床禁用或与 GET 行为不一致），不再单做 HEAD 探测
- 逐页编译错误、图片失败明细通过第五节的结构化错误/结果透传返回

#### 输出（`--json`）

```json
{
  "dryRun": true,
  "summary": { "totalPages": 2, "compiledPages": 2, "totalImages": 28, "localizedImages": 26, "failedImages": 2 },
  "pages": [{ "pageId": "demo_xxx", "name": "广场页面-手机", "compile": { "passed": true } }],
  "images": [{ "url": "https://.../h_a9956e79.png", "success": false, "reason": "HTTP_403" }]
}
```

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/author-site/src/lib/publish-manager.ts` | **修改** — `publishProject` 支持 `dryRun`，返回干跑报告 |
| `packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` | **修改** — body 接受 `dryRun` |
| `packages/project-cli/src/index.ts` | **修改** — `publish project` 增加 `--dry-run` 透传 |

---

### 四、Workspace 与内容图谱管理

**目标**：治本修复悬空 workspace 引用导致的发布死循环；提供清理、检视 workspace 与内容图谱的 CLI 命令，避免手动 `rm -rf`。

#### 治本修复（原方案遗漏，本次新增）

publish route 的同步前置检查（`route.ts:113-131`）在 `activeWorkspaceId` 指向已删除 workspace 时条件恒真、永远 400。修复：前置检查发现 `getWorkspaceMeta(activeWorkspaceId)` 不存在时，视为无活跃 workspace 放行，并顺手清理 project.json 中的悬空字段。CLI 的 `workspace fix` 只是兜底手段，服务端不该带着这个 bug。

#### 新增命令

| 命令 | 功能 |
|------|------|
| `ow workspace list <projectId>` | 列出项目相关 workspace（canonical + `data/workspaces/` 下的 live/branch），显示 scope、baseVersion、更新时间、与 project.json 引用关系 |
| `ow workspace clean <projectId> [--force]` | 清理孤儿/过期 workspace，默认 dry-run 列出计划 |
| `ow workspace fix <projectId> [--force]` | 修复安全类问题，默认 dry-run |
| `ow content-graph status <projectId>` | 显示内容图谱状态（headCommitId、物化状态、commit 数、待物化差距） |
| `ow content-graph reset <projectId> [--force]` | 备份并重建内容图谱：备份 `content/` → 清空 → 以当前 workspace 创建新初始 commit，默认 dry-run |

#### `workspace clean` 清理策略

| 条件 | 标记 | 默认处理 |
|------|------|---------|
| workspace 目录存在但不被任何 project.json 的 `activeWorkspaceId` 引用，且无对应活跃 session | `orphaned` | `--force` 删除 |
| `updatedAt` 超过 7 天且非 active | `expired` | 仅 `--all --force` 删除 |

#### `workspace fix` 修复项（只做安全项）

| 问题 | 修复方式 |
|------|---------|
| `activeWorkspaceId` 指向不存在的 workspace | 清空 `activeWorkspaceId` + `activeWorkspaceUpdatedAt` |
| 内容图谱物化状态 `pending`/`failed` 且 head commit 存在 | 提示运行 `ow project materialize`（不自动执行） |
| `baseVersion` 与项目最新版本不一致 | **仅报告，不修改**——直接改 baseVersion 会伪造工作区基线，掩盖真实过期状态 |
| `canonicalSyncedWorkspaceId` 与 `activeWorkspaceId` 不一致 | **仅报告，不修改**——canonicalSynced* 是含 revision/rootHash 的一组同步证明，单改 ID 会制造假证明；真正的对齐必须走 flush&sync |

（原方案后两项列为自动修复，校正为只报告。）

#### `content-graph reset` 说明

与已有 `ow project materialize` 方向相反：materialize 是「commit → workspace 文件」，reset 是「以 workspace 现状重建 content/」，服务于实战中「内容图谱被 flush&sync 拼接污染」的场景。实现复用现有 content commit 创建逻辑，备份到 `data/snapshots/<id>/content-backup-<ts>/`。

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` | **修改** — 悬空 activeWorkspaceId 治本修复 |
| `packages/project-core/src/workspace-admin.ts` | **新增** — workspace list/clean/fix 领域逻辑 |
| `packages/project-core/src/content-graph-admin.ts` | **新增** — content-graph status/reset 领域逻辑 |
| `packages/project-core/src/service.ts` | **修改** — 挂接上述方法（保持 CLI 只调 service 的边界） |
| `packages/project-cli/src/index.ts` | **修改** — 注册 workspace / content-graph 命令组 |

> 说明：这组命令操作的是本机 `DATA_DIR`。修远程环境时在远程主机（或容器内）执行 CLI；不为此新增远程管理 API。

---

## P1 — 辅助改善项

### 五、错误信息透传

**目标**：API 返回的错误信息包含结构化诊断详情，CLI 端完整呈现。

#### 实现

- `publish-manager.ts` 新增 `PublishError extends Error { code; details }`；发布主循环逐页 try-catch 收集编译错误（不再第一个错误就中断整体，收集完统一抛出）；图片阻断失败的 `errors` 数组放入 details
- publish route 的 catch 识别 `PublishError`，用 `createApiError(code, message, details)` 三参透传（`ApiErrorResponse.error.details` 类型已支持，无需改 shared）
- CLI 端：`--json` 完整透传 details；人机可读模式按分组格式化（编译错误按页、图片错误按 URL）

改进后错误响应示例：

```json
{
  "success": false,
  "error": {
    "code": "PUBLISH_COMPILE_FAILED",
    "message": "发布失败：1 个页面编译错误",
    "details": {
      "pages": [{ "pageId": "demo_xxx", "name": "广场页面-平板",
                  "errors": [{ "message": "顶层声明 PadSquare 重复" }] }],
      "images": []
    }
  }
}
```

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/author-site/src/lib/publish-manager.ts` | **修改** — PublishError + 逐页错误收集 |
| `packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` | **修改** — 透传 details |
| `packages/project-cli/src/error-format.ts` | **新增** — 错误详情格式化 |

---

### 六、图片本地化控制选项

**目标**：发布时可跳过外部图片下载、控制超时与并发。

```bash
ow publish project <id> --skip-image-localization   # 外部 URL 保持原样，不发任何请求
ow publish project <id> --image-timeout <ms>        # 单张下载超时，默认 10000
ow publish project <id> --image-concurrency <n>     # 并发下载数，默认 4
```

- 现状校正:外部图片失败**本就不阻断**（保留原 URL），实战痛点是串行 + 无超时导致的极慢。核心修复是给 `fetchExternalImage` 加 `AbortSignal.timeout` + 并发池；`--skip` 是快速通道
- 参数链路：CLI → publish route body `imageOptions: { skip?, timeoutMs?, concurrency? }` → `publishProject` options → `processImagesForPublish`
- 与 `--dry-run` 正交可组合

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/author-site/src/lib/publish/image-processor.ts` | **修改** — 超时、并发池、skip |
| `packages/author-site/src/lib/publish-manager.ts` | **修改** — options 传递 |
| `packages/author-site/src/app/api/projects/[projectId]/publish/route.ts` | **修改** — body 接受 imageOptions |
| `packages/project-cli/src/index.ts` | **修改** — 3 个新参数 |

---

### 七、Doctor 增强

**目标**：`ow doctor` 增加远程连通性和凭证有效性检查。

| 检查项 | 方式 |
|--------|------|
| 远程 author-site 可达性 | GET `{remoteUrl}/api/auth/me` 或 HEAD `/`（5s 超时） |
| 凭证有效性 | 带 Cookie 的 GET `{remoteUrl}/api/sessions`（middleware 保护，200=有效 401=失效） |
| token 剩余有效期 | 解码本地缓存 token 的 exp，< 24h 警告 |

SSH 可达性检查随 SSH 通道一并砍掉。「远程 publishedVersion 一致性」并入 `ow sync diff`，doctor 不重复实现。

#### 涉及变更

| 文件 | 变更 |
|------|------|
| `packages/project-cli/src/index.ts` | **修改** — doctor 增加远程检查（配置了 remote 才执行） |

---

## 实施顺序

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **Phase 1** | 鉴权层（login/logout/whoami/remote + login route includeToken）+ 错误信息透传 | 无 |
| **Phase 2** | 远程同步（project-transfer + import/export API + sync push/pull/diff） | Phase 1 |
| **Phase 3** | 发布干跑（--dry-run）+ 图片本地化控制 | Phase 1 |
| **Phase 4** | Workspace 治本修复 + workspace/content-graph 命令组 | 无 |
| **Phase 5** | Doctor 增强 | Phase 1 |

Phase 2、3、4 可并行开发。

---

## 不纳入本次的范围

- `ow` 与 `ops-cli` 合并不做
- 不新增 API Key / OAuth2 / SSO / refresh token 等鉴权机制（无既有体系，属账号工程）
- 不引入 `Authorization: Bearer` 支持（服务端全部 route 从 cookie 取 token，改造面大收益低；CLI 用 Cookie 头与现有先例一致）
- 不做 SSH rsync 降级通道（兜底继续走 `scripts/deploy.sh`）
- 不改变现有 `ow submit`（scaffold 工作流）行为
- 不涉及知识文档 CRUD 命令、CLI 定时任务

---

## 验证方式

| 能力组 | 验证命令 |
|--------|---------|
| 鉴权 | `ow remote add prod <url>` + `ow login --remote prod` + `ow whoami` + `ow logout` |
| 远程同步 | `ow sync push proj_xxx --remote prod` + `ow sync diff proj_xxx --remote prod` + `ow sync pull proj_xxx` |
| 发布干跑 | `ow publish project proj_xxx --dry-run --remote prod --json` |
| Workspace 管理 | `ow workspace list proj_xxx` + `ow workspace fix proj_xxx`（dry-run）+ `--force` |
| 内容图谱 | `ow content-graph status proj_xxx` + `ow content-graph reset proj_xxx` |
| 图片控制 | `ow publish project proj_xxx --skip-image-localization` |
| Doctor | `ow doctor`（配置 remote 后） |

包级验证：

```bash
pnpm check:project-cli
pnpm check:project-core
pnpm check:author
```

---

## 风险与待确认

1. **import 上限**：默认 100MB（本地实测最大项目 32MB），`SYNC_IMPORT_MAX_BYTES` 可配；Next.js App Router 无内建 body 限制，route 内自行校验 content-length 并流式落盘
2. **tar 解包安全**：显式过滤绝对路径、`..`、symlink entry
3. **干跑成本**：干跑会真实下载图片与编译（分钟级），属预期行为；配合 `--image-timeout`/`--image-concurrency` 控制上限
4. **workspace clean/fix 破坏性**：默认 dry-run + `--force` 双闸；fix 只做安全项，基线/同步证明类不一致仅报告
5. **content-graph reset 丢历史**：commit 历史会重置，属预期（污染场景本就要重建）；执行前强制备份

---

## 与原方案的差异（校正记录）

| # | 原方案 | 校正 | 原因 |
|---|--------|------|------|
| 1 | 新增 `src/commands/*.ts`、`src/lib/*.ts` | 按 CLI 实际单文件架构规划：新模块独立文件 + index.ts 注册 | 方案假设的目录结构不存在 |
| 2 | JWT 过期「自动静默刷新」 | 过期提示重新 login | 无 refresh token 机制，静默刷新＝存明文密码 |
| 3 | `--api-key` / `WORKBENCH_API_KEY` | 砍掉；环境变量沿用 `AUTHOR_SITE_AUTH_TOKEN` | author-site 无 API Key 体系；避免双环境变量并存 |
| 4 | credentials.json + remotes.json 双文件 | 单文件 `cli-config.json`（0600） | url 双份存储易不一致 |
| 5 | import/export 需要 admin/creator 角色 | 登录即可 | 用户无角色字段、项目无 owner，与 publish 同标准 |
| 6 | API 优先 + SSH rsync 降级 | 仅 API | SSH 通道引入配置/密码管理与安全面，deploy.sh 已可兜底 |
| 7 | `ow project push/pull-remote/diff-remote` | `ow sync push/pull/diff` | `project pull` 已被 scaffold 占用；同组命名对称 |
| 8 | export 排除 `content/` | 全量打包 | 排除后远端图谱状态与 workspace 不一致 |
| 9 | （未提及） | import 后规范化 project.json（清 workspace 引用/versions/发布状态） | versions 快照不随包传输；避免悬空引用复现实战 bug |
| 10 | `publish check --dry-run` + 图片 HEAD 预检 | `publish project --dry-run`（author-site 端全管线干跑） | check 本就不写入，标志语义重复；本地检查与 author-site 发布管线不同轨；HEAD 结果不可靠 |
| 11 | fix 自动改 `baseVersion`、对齐 `canonicalSyncedWorkspaceId` | 仅报告不修改 | 会伪造基线与同步证明，制造更隐蔽的不一致 |
| 12 | （未提及） | publish route 悬空 activeWorkspaceId 治本修复 | 死循环是服务端 bug，CLI fix 只是兜底 |
| 13 | `content-graph reset` = 「从 workspace 重建」 | 保留但明确与 `project materialize` 的方向区别、强制备份 | 已有反向命令，需避免语义混淆 |
| 14 | 图片失败「40+ 张依次超时」按失败处理 | 核心修复为超时 + 并发池；外部失败本就不阻断 | 代码实况：失败仅警告保留原 URL，痛点是慢不是断 |
| 15 | doctor 检查 SSH + publishedVersion 一致性 | 砍 SSH；一致性并入 `sync diff` | 通道已砍；避免重复实现 |
