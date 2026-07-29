# 截图 CLI 手动重截工具 — 设计文档

## 背景

截图服务偶尔会出错（编译失败、空白截图、超时等），需要一个面向开发/运维的手动触发重新截图的入口。当前 `project-cli` 已有 `preview screenshot` 命令，但仅做健康检查，不触发实际截图生成。

目标：扩展 `preview screenshot` 命令组，支持状态查看、手动重截和缓存清理。

## 用户场景

- 开发者发现某个项目首页封面截图不对，在终端执行 CLI 命令重截
- 发布前批量检查/重截所有页面的截图缓存状态
- 截图缓存文件异常时清除后重新生成

## 命令设计

所有命令均在 `project-cli` 的 `preview screenshot` 子命令系列下，参数风格与 project-cli 现有命令一致。全部支持 `--json` 输出。

### `ow preview screenshot status <projectId> [pageId]`

- 不指定 `pageId`：列出项目所有页面的截图状态
- 指定 `pageId`：仅查看该页
- 输出字段：`pageId`、`hasFile`（截图文件是否存在）、`healthy`（文件 > 8KB）、`hash`（当前文件 hash）、`metaCurrentHash`（meta.json 记录的 hash）、`hashMatch`（文件 hash 与 meta 记录是否一致）
- `--json` 输出结构化数组

### `ow preview screenshot regenerate <projectId> [pageId] [--force]`

- 不指定 `pageId`：重截项目所有页面（批量异步）
- 指定 `pageId`：重截单个页面（同步）
- `--force`：跳过截图缓存，强制重新渲染
- 输出：逐页结果（成功/失败/错误码/耗时），批量时显示进度汇总
- 截图服务不可达时给出明确错误提示
- 内部流程：读取页面代码 → 构建截图输入 → 调用截图服务 HTTP API

### `ow preview screenshot cache clean <projectId> [pageId]`

- 不指定 `pageId`：清除项目所有截图缓存文件和 meta 文件
- 指定 `pageId`：仅清除该页
- 输出：已删除文件列表和数量
- 不清除非截图目录下的文件，误操作保护：仅删除 `data/screenshots/<projectId>/` 下的 .png 和 .meta.json 文件

## 架构与数据流

```
CLI (project-cli)
  └──register("preview screenshot status/regenerate/cache clean")
       └──ProjectAdminService
            ├── screenshotStatus(projectId, pageId?)
            │     └── 读 data/screenshots/<projectId>/*.png, *.meta.json
            │
            ├── screenshotRegenerate(projectId, pageId?, force)
            │     ├── 读 data/projects/<projectId>/workspace/demos/*/
            │     ├── 构建 PageSnapshotInput（复用 ensure 路由的构建逻辑）
            │     ├── 单页：POST localhost:4202/api/screenshots/generate
            │     └── 多页：POST localhost:4202/api/screenshots/generate-batch
            │
            └── screenshotCacheClean(projectId, pageId?)
                  └── 删 data/screenshots/<projectId>/*.png, *.meta.json
```

### 代码分布

| 层 | 文件 | 新增内容 |
|---|------|----------|
| 领域服务 | `packages/project-core/src/service.ts` | `screenshotStatus()`、`screenshotRegenerate()`、`screenshotCacheClean()` 方法 |
| 页面输入构建 | `packages/project-core/src/screenshot-input.ts`（新文件） | 从 workspace 读取页面代码/schema 并构建 `PageSnapshotInput` |
| CLI 注册 | `packages/project-cli/src/index.ts` | 三个新的 `register()` 调用 |
| 共享类型 | `packages/shared/src/index.ts` | 无新增（使用已有 `PageSnapshotInput`） |

### 不提取到 project-core 的部分

- `ensure/route.ts` 中的 `readProjectThumbnailPages` 保留在原地，CLI 的页面输入构建逻辑在 `project-core/src/screenshot-input.ts` 独立实现。两者逻辑相似但 `ensure` 路由有内联资源（base64 inline 图片）等 Web 特化逻辑，合并不当会增加耦合。后续如果发现分歧，再统一到 project-core。

## 错误处理

| 错误场景 | 表现 |
|----------|------|
| 项目不存在 | `error.code: "PROJECT_NOT_FOUND"`，退出码 1 |
| 页面不存在 | `error.code: "PAGE_NOT_FOUND"`，退出码 1 |
| 截图服务不可达 | `error.code: "SCREENSHOT_SERVICE_UNAVAILABLE"`，退出码 1，提示检查服务是否启动 |
| 截图服务返回错误 | 透传服务端 error.code 和 message |
| 未指定 projectId | 命令解析报错，显示 usage（project-cli 现有机制） |

## 向前兼容

- 现有 `preview screenshot`（无子命令）行为不变，继续输出健康检查结果
- 现有 `preview healthcheck` 不受影响
- 截图服务 API 无变化，CLI 仅作为新增消费者

## 验证

```bash
pnpm check:project-core
pnpm check:project-cli
```

集成验证：启动 screenshot-service 后执行 `ow preview screenshot regenerate <projectId>` 确认截图文件写入 `data/screenshots/`。
