# page-export — 页面导出工具

让 agent 把开发项目（Next.js / Vite / React 等 SPA）的所有页面批量导出为创作端可导入的静态原型页，接通创作端画布评审工作流。

## 定位

外部开发项目（代码在 git 仓库，由 agent 编码）与创作端是割裂环境。本工具做「导出端」：把渲染后的页面快照转成创作端 `prototype-html-css` 可导入的 manifest + HTML/CSS，复用 `ow project import-prototype` 导入。评审意见按 `routeKey` 回流开发项目。

## 前置条件

- 系统已安装 **Chrome**（`/Applications/Google Chrome.app/...`，可用 `CHROME_BIN` 覆盖）。
- 目标 dev server 已启动（本工具只负责渲染与转换，不启动 dev server）。
- 已安装 `single-file-cli`（本目录 `package.json` 依赖，仓库根已安装到 `node_modules/`）。
- 导入端：仓库内 `ow` CLI（`packages/project-cli`）。

## 目录结构

| 文件 | 职责 |
| --- | --- |
| `bin/export.mjs` | 编排：路由发现 → 登录 → single-file 渲染 → normalize → import |
| `bin/normalize.mjs` | 转换：样式分离 / 红线净化 / CSS 局部化 / 锚点 / 图片 / manifest |
| `bin/discover-routes.mjs` | 路由自动发现（Next.js app/pages、Vite 待扩展） |
| `package.json` | 声明 `single-file-cli` 依赖与脚本入口 |

## 快速开始

```bash
# 已登录、公开页面场景
node tools/page-export/bin/export.mjs \
  --root packages/author-site \
  --base-url http://localhost:4200 \
  --app-dir packages/author-site/src/app \
  --output out-export \
  --import-name "创作端页面导出" \
  --dry-run

# 受保护页面（登录 cookie）
node tools/page-export/bin/export.mjs \
  --root packages/author-site \
  --base-url http://localhost:4200 \
  --app-dir packages/author-site/src/app \
  --username admin --password xxx \
  --output out-export \
  --import-name "创作端页面导出" \
  --dry-run
```

## 参数

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `--base-url` | dev server 根地址 | `http://localhost:4200` |
| `--app-dir` | Next.js `app/` 或 `pages/` 目录（自动发现） | 取 `--root` |
| `--routes` | 显式路由 `routeKey:file[,...]`（跳过自动发现） | 自动发现 |
| `--dynamic-sample` | 动态段样例 `[id]:xxx`（如 `id:sample`） | - |
| `--username` / `--password` | 登录 author-site | - |
| `--no-login` | 跳过登录（公开页面） | - |
| `--output` | 输出目录 | `out` |
| `--import-name` | 导入项目名 | `页面导出` |
| `--dry-run` | 只 dry-run 校验不导入不提交 | - |
| `--no-commit` | 导入但不提交（保留 edit 事务） | - |
| `--manifest-only` | 只做 normalize 生成 manifest，不调 import | - |
| `--no-config` | 原型页不生成 schema | - |

## normalize 职责

1. **样式分离**：渲染 HTML 中 `<style>` 提取为 `prototypeCss`，HTML 移除（保留内联 `style` 属性）。
2. **红线净化**：删除 `<script>`、内联事件属性、`javascript:` URL、`iframe/embed/object`、带 `action` 的 `form`。
3. **CSS 局部化**：`html/body/:root` 选择器改写为 `.prototype-root` 容器内局部选择器（对齐 `prototypeGate` 的 `PROTOTYPE_GLOBAL_SELECTOR_RE`）。
4. **锚点注入**：根元素加 `data-route="<routeKey>"`，作为评审意见回流主键。
5. **图片落地**：base64 图片写 `out/images/`，HTML/CSS 改写相对路径，走 `--assets images:assets/images` 资产化。

## 产物

```
out/
  raw/            single-file 渲染原始 HTML
  normalized/     normalize 后 HTML/CSS + images/ + manifest.json + normalize-report.json
```

## 验证

- normalize 可用：`node tools/page-export/bin/normalize.mjs --html-dir <dir> --output <out> --routes <k:file[,...]>`
- 导入前校验：`ow project import-prototype --source <normalized> --manifest @./manifest.json --assets images:assets/images --dry-run --json`，检查 `prototypeGate.decision === "accept_prototype"`。
- 导入后：创作端原型页预览 + `ow project visual-check <projectId> --json` 截图确认。

## 评审闭环（P1，未实现）

创作端「批注→AI 修改」评审闭环对原型页仍有半成品缺口（批注交互、AI prompt 分流、回流意见消费），见设计文档 `docs/plans/远期规划/创作端开发项目模式方案/页面导出工具方案.md`。本工具 P0 只打通导出通道，`routeKey` 锚点已为回流契约预留。

## 许可注意

`single-file-cli` 依赖 **AGPL-3.0** 许可。本工具仅用于内部开发/评审流程，不重新分发渲染引擎；若需对外分发需评估许可影响。