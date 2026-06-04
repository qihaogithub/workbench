import path from "path";
import fs from "fs";
import {
  DemoMeta,
  DemoFiles,
  SessionMeta,
  ErrorCodeType,
  ERROR_MESSAGES,
} from "@opencode-workbench/shared";
import type {
  Project,
  VersionInfo,
  DemoPageMeta,
  DemoFolderMeta,
  MultiDemoFiles,
  WorkspaceTree,
} from "@opencode-workbench/shared";
import { MAX_VERSIONS_KEEP } from "@opencode-workbench/shared";

export function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

const DATA_DIR =
  process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), "data");
const PROJECTS_DIR =
  process.env.PROJECTS_DIR || path.join(DATA_DIR, "projects");
const SESSIONS_DIR =
  process.env.SESSIONS_DIR || path.join(DATA_DIR, "sessions");
const WORKSPACES_DIR =
  process.env.WORKSPACES_DIR || path.join(DATA_DIR, "workspaces");
const SNAPSHOTS_DIR =
  process.env.SNAPSHOTS_DIR || path.join(DATA_DIR, "snapshots");
const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export function getDataDir(): string {
  return DATA_DIR;
}

export function getProjectsDir(): string {
  return PROJECTS_DIR;
}

export function getSnapshotsDir(): string {
  return SNAPSHOTS_DIR;
}

export function getSessionsDir(): string {
  return SESSIONS_DIR;
}

export function getWorkspacesDir(): string {
  return WORKSPACES_DIR;
}

export function ensureDirsExist(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  }
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

export function getProjectPath(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

export function getSnapshotPath(projectId: string, versionId: string): string {
  return path.join(SNAPSHOTS_DIR, projectId, versionId);
}

export function getSessionPath(sessionId: string, projectId?: string): string {
  if (projectId) {
    // 先尝试旧结构路径（兼容）
    const directPath = path.join(SESSIONS_DIR, projectId, sessionId);
    if (fs.existsSync(directPath)) {
      return directPath;
    }
    // 否则使用 findSessionPath 搜索（支持新结构 sessions/{userId}/{projectId}/{sessionId}/）
    const foundPath = findSessionPath(sessionId);
    if (foundPath) return foundPath;
    // fallback
    return directPath;
  }
  const foundPath = findSessionPath(sessionId);
  return foundPath || path.join(SESSIONS_DIR, sessionId);
}

export function findSessionPath(sessionId: string): string | null {
  console.log(`[findSessionPath] 查找 session: ${sessionId}`);

  if (!fs.existsSync(SESSIONS_DIR)) {
    console.error(`[findSessionPath] SESSIONS_DIR 不存在: ${SESSIONS_DIR}`);
    return null;
  }

  console.log(`[findSessionPath] SESSIONS_DIR: ${SESSIONS_DIR}`);

  // 先尝试新结构: {userId}/{projectId}/{sessionId}/
  const level1Entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  console.log(`[findSessionPath] level1 目录数: ${level1Entries.length}`);

  for (const level1 of level1Entries) {
    if (!level1.isDirectory()) continue;

    const level1Path = path.join(SESSIONS_DIR, level1.name);

    // 直接检查是否为目标 session（兼容旧结构）
    const directPath = path.join(level1Path, sessionId);
    if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
      console.log(`[findSessionPath] 找到 session (旧结构): ${directPath}`);
      return directPath;
    }

    // 检查第二层（新结构: {userId}/{projectId}/{sessionId}/）
    const level2Entries = fs.readdirSync(level1Path, { withFileTypes: true });
    for (const level2 of level2Entries) {
      if (!level2.isDirectory()) continue;

      const level2Path = path.join(level1Path, level2.name);

      // 先检查目录名是否匹配
      const sessionPathByName = path.join(level2Path, sessionId);
      if (
        fs.existsSync(sessionPathByName) &&
        fs.statSync(sessionPathByName).isDirectory()
      ) {
        console.log(
          `[findSessionPath] 找到 session (新结构-目录名): ${sessionPathByName}`,
        );
        return sessionPathByName;
      }

      // 遍历第三层，检查 .session.json 中的 sessionId 字段
      const level3Entries = fs.readdirSync(level2Path, { withFileTypes: true });
      for (const level3 of level3Entries) {
        if (!level3.isDirectory()) continue;

        const level3Path = path.join(level2Path, level3.name);
        const metaPath = path.join(level3Path, ".session.json");

        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (meta.sessionId === sessionId) {
              console.log(
                `[findSessionPath] 找到 session (新结构-meta): ${level3Path}`,
              );
              return level3Path;
            }
          } catch {
            // 忽略解析错误的文件
          }
        }
      }
    }
  }

  console.error(`[findSessionPath] 未找到 session: ${sessionId}`);
  return null;
}

export function projectExists(projectId: string): boolean {
  const projectPath = getProjectPath(projectId);
  return fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory();
}

export function sessionExists(sessionId: string, projectId?: string): boolean {
  if (projectId) {
    const sessionPath = getSessionPath(sessionId, projectId);
    return fs.existsSync(sessionPath) && fs.statSync(sessionPath).isDirectory();
  }
  return findSessionPath(sessionId) !== null;
}

export function listProjects(): DemoMeta[] {
  ensureDirsExist();

  const projects: DemoMeta[] = [];
  const entries = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectPath = path.join(PROJECTS_DIR, entry.name);
    const stats = fs.statSync(projectPath);

    const project = readProjectMeta(entry.name);

    projects.push({
      id: entry.name,
      name: project?.name || entry.name,
      createdAt: stats.birthtimeMs,
      updatedAt: stats.mtimeMs,
      thumbnail: project?.thumbnail,
      demoCount: project?.demoPages?.length ?? 1,
    });
  }

  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
}

const DEFAULT_DEMO_CODE = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
}

export default function Demo({ title, description }: DemoProps) {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}
`;

const DEFAULT_DEMO_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Demo 配置",
    type: "object",
    properties: {
      title: {
        type: "string",
        title: "标题",
        default: "Hello World",
      },
      description: {
        type: "string",
        title: "描述",
        default: "This is a demo",
      },
    },
    required: ["title"],
  },
  null,
  2,
);

/** 系统预设知识文档：配置系统参考（原 references/config-system.md） */
const CONFIG_SYSTEM_REFERENCE_CONTENT = `# 配置系统参考手册

> 生成或修改 \`config.schema.json\` 时，必须参考本文件。

## 基本结构

\`\`\`json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$demo": {
    "previewSize": { "width": 375, "height": 812 }
  },
  "properties": {
    "字段名": { "type": "string", "title": "显示名", "default": "默认值" }
  },
  "required": ["必填字段名"]
}
\`\`\`

## 控件映射规则（三层优先级）

生成 schema 字段时，按以下优先级选择控件：

1. **\`ui:widget\` 显式覆盖**（最高优先级）— 强制指定控件类型
2. **\`format\` 语义映射** — 根据值的语义自动匹配控件
3. **\`type\` 数据类型回退**（最低优先级）— 根据基本类型推断

**原则**：优先使用 \`format\`（标准语义声明），只在 \`format\` 无法满足时才用 \`ui:widget\` 覆盖。

## 可用控件速查表

### 基础类型（Layer 3: type 回退）

| type                 | 控件       | 说明                            |
| -------------------- | ---------- | ------------------------------- |
| \`string\`             | 文本输入框 | 最基础的文本输入                |
| \`number\` / \`integer\` | 数字滑块   | 支持 \`minimum\`、\`maximum\` 约束  |
| \`boolean\`            | 开关       | 真/假切换                       |
| \`string\` + \`enum\`    | 下拉选择器 | 配合 \`enumNames\` 提供中文选项名 |
| \`array\`              | 多图列表   | 默认渲染为图片列表编辑器        |

### 语义映射（Layer 2: format）

| format    | 控件       | 用法                              |
| --------- | ---------- | --------------------------------- |
| \`"color"\` | 颜色选择器 | 可视化选色 + 手动输入 HEX 值      |
| \`"image"\` | 图片上传   | 单图上传，支持 URL 输入和文件上传 |

### 显式覆盖（Layer 1: ui:widget）

| ui:widget     | 控件         | 何时使用                                           |
| ------------- | ------------ | -------------------------------------------------- |
| \`"file"\`      | 文件上传     | 等同于 \`format: "image"\`，旧写法                   |
| \`"image"\`     | 图片上传     | 等同于 \`format: "image"\`                           |
| \`"imageList"\` | 多图列表     | \`type: "array"\` 时使用，支持 \`ui:options.maxItems\` |
| \`"richtext"\`  | 富文本编辑器 | 需要格式化文本（HTML 输出）时                      |

### ui:options 配置项

| 选项          | 适用控件      | 说明                                      |
| ------------- | ------------- | ----------------------------------------- |
| \`accept\`      | 文件/图片上传 | 限制文件类型，如 \`"image/*"\`              |
| \`maxSize\`     | 文件/图片上传 | 最大文件大小（字节），如 \`5242880\`（5MB） |
| \`placeholder\` | 文本/文件上传 | 占位提示文案                              |
| \`maxItems\`    | 多图列表      | 最大图片数量，默认 20                     |

### 图片尺寸校验（ui:options）

当图片配置项需要特定尺寸时，可在 \`ui:options\` 中声明尺寸约束。系统会在上传时自动校验，尺寸不符会弹出警告对话框，用户可选择「取消上传」或「继续上传」。

| 选项        | 类型     | 说明           | 示例   |
| :---------- | :------- | :------------- | :----- |
| \`minWidth\`  | \`number\` | 最小宽度（px） | \`100\`  |
| \`minHeight\` | \`number\` | 最小高度（px） | \`100\`  |
| \`maxWidth\`  | \`number\` | 最大宽度（px） | \`2048\` |
| \`maxHeight\` | \`number\` | 最大高度（px） | \`2048\` |

**使用原则**：

- 仅在**业务确实需要特定尺寸**时才添加尺寸校验，不要滥用
- 常见的需要尺寸校验场景：Banner 图、头像、商品主图、背景图等
- 建议同时设置 \`minWidth\` + \`minHeight\`（保证最小清晰度）或 \`maxWidth\` + \`maxHeight\`（控制文件大小）
- 尺寸校验是**警告模式**，不强制阻止上传

**单图示例**（Banner 图，要求宽度至少 750px）：

\`\`\`json
{
  "bannerImage": {
    "type": "string",
    "format": "image",
    "title": "Banner 图",
    "ui:options": {
      "accept": "image/*",
      "maxSize": 5242880,
      "minWidth": 750,
      "maxWidth": 2048,
      "maxHeight": 1024
    }
  }
}
\`\`\`

**多图示例**（商品图片，要求正方形且至少 200x200px）：

\`\`\`json
{
  "productImages": {
    "type": "array",
    "title": "商品图片",
    "ui:widget": "imageList",
    "ui:options": {
      "maxItems": 10,
      "minWidth": 200,
      "minHeight": 200
    }
  }
}
\`\`\`

## 扩展字段（$demo）

### $demo.previewSize — 预览尺寸

控制预览区的渲染尺寸（放在 schema 根级别）：

\`\`\`json
{
  "$demo": {
    "previewSize": { "width": 375, "height": 812 }
  }
}
\`\`\`

常用尺寸：手机竖屏 \`375×812\`、平板横屏 \`1024×768\`、桌面 \`1440×900\`。

### $demo.orderable — 组件排序

声明哪些子组件支持用户拖拽排序（放在 schema 根级别）：

\`\`\`json
{
  "$demo": {
    "orderable": ["header", "banner", "content", "footer"]
  },
  "properties": {
    "header": { "type": "object", "title": "头部区域", "properties": {...} },
    "banner": { "type": "object", "title": "横幅区域", "properties": {...} },
    "content": { "type": "object", "title": "内容区域", "properties": {...} },
    "footer": { "type": "object", "title": "底部区域", "properties": {...} }
  }
}
\`\`\`

规则：

- 至少 2 项才会显示排序控件
- 排序结果以 \`__order\` 属性注入组件 props
- 组件代码读取 \`props.__order\` 决定渲染顺序
- 未在 \`orderable\` 中的属性不参与排序

### $demo.note — 属性级备注

为配置项添加富文本备注（放在各属性下）：

\`\`\`json
{
  "properties": {
    "brandColor": {
      "type": "string",
      "format": "color",
      "title": "品牌色",
      "default": "#FF6B35",
      "$demo": {
        "note": "建议使用品牌规范中的主色值，<b>需与设计师确认</b>"
      }
    }
  }
}
\`\`\`

## 完整示例

\`\`\`json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "$demo": {
    "previewSize": { "width": 375, "height": 812 },
    "orderable": ["heroSection", "featureList", "testimonialSection"]
  },
  "properties": {
    "pageTitle": {
      "type": "string",
      "title": "页面标题",
      "default": "我的 Demo",
      "description": "页面顶部的主标题"
    },
    "brandColor": {
      "type": "string",
      "format": "color",
      "title": "品牌色",
      "default": "#FF6B35"
    },
    "heroImage": {
      "type": "string",
      "format": "image",
      "title": "主视觉图",
      "default": "https://picsum.photos/750/400",
      "ui:options": {
        "accept": "image/*",
        "maxSize": 5242880,
        "minWidth": 750,
        "maxWidth": 2048,
        "maxHeight": 1024
      }
    },
    "layout": {
      "type": "string",
      "title": "布局方式",
      "enum": ["grid", "list", "carousel"],
      "enumNames": ["网格布局", "列表布局", "轮播布局"],
      "default": "grid"
    },
    "showBadge": {
      "type": "boolean",
      "title": "显示角标",
      "default": true
    },
    "itemCount": {
      "type": "number",
      "title": "展示数量",
      "default": 6,
      "minimum": 1,
      "maximum": 20
    },
    "galleryImages": {
      "type": "array",
      "title": "图片画廊",
      "ui:widget": "imageList",
      "ui:options": { "maxItems": 10 },
      "default": []
    },
    "heroSection": {
      "type": "object",
      "title": "首屏区域",
      "properties": {
        "title": { "type": "string", "title": "标题", "default": "欢迎" },
        "subtitle": {
          "type": "string",
          "title": "副标题",
          "default": "描述文字"
        }
      }
    },
    "featureList": {
      "type": "object",
      "title": "功能列表",
      "properties": {
        "items": {
          "type": "array",
          "title": "功能项",
          "items": {
            "type": "object",
            "properties": {
              "icon": { "type": "string", "title": "图标名" },
              "text": { "type": "string", "title": "说明文字" }
            }
          },
          "default": [
            { "icon": "star", "text": "功能一" },
            { "icon": "heart", "text": "功能二" }
          ]
        }
      }
    },
    "testimonialSection": {
      "type": "object",
      "title": "用户评价",
      "properties": {
        "enabled": { "type": "boolean", "title": "显示评价", "default": true },
        "content": {
          "type": "string",
          "title": "评价内容",
          "ui:widget": "richtext",
          "default": "<p>用户好评</p>"
        }
      }
    }
  },
  "required": ["pageTitle", "brandColor"]
}
\`\`\`
`;

// ============================================================
// Demo 页面 ID 与目录工具函数（多页面架构）
// ============================================================

/**
 * 将页面名称转为文件系统安全的 slug。
 * - ASCII 字母数字保留，空格/特殊字符 → `-`，全小写
 * - 非 ASCII 字符（中文等）直接丢弃
 * - 合并连续 `-`，去除首尾 `-`
 * - 截断到 20 字符
 * - 空结果回退 `page`
 *
 * @example
 *   generatePageSlug("Landing Page")    // → "landing-page"
 *   generatePageSlug("Product Detail")  // → "product-detail"
 *   generatePageSlug("首页")            // → "page"（中文被丢弃，回退默认）
 *   generatePageSlug("首页 Home")       // → "home"
 *   generatePageSlug("")                // → "page"
 */
export function generatePageSlug(name: string): string {
  const slug = name
    .toLowerCase()
    // 保留 ASCII 字母数字和空格/连字符，丢弃其他字符（含中文）
    .replace(/[^a-z0-9\s-]/g, "")
    // 空格替换为 `-`
    .replace(/\s+/g, "-")
    // 合并连续 `-`
    .replace(/-{2,}/g, "-")
    // 去除首尾 `-`
    .replace(/^-|-$/g, "")
    // 截断到 20 字符
    .slice(0, 20)
    // 截断后可能产生尾部 `-`
    .replace(/-$/, "");

  return slug || "page";
}

/**
 * 生成 Demo 页面 ID。
 * 格式 `{slug}_{4位随机}`，如 `product-detail_a3f2`。
 * slug 由 `generatePageSlug(name)` 生成，保证目录名有语义。
 */
export function generateDemoPageId(name?: string): string {
  const slug = generatePageSlug(name || "Default Page");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${slug}_${rand}`;
}

/**
 * 获取页面目录的绝对路径
 */
export function getDemoDirPath(workspacePath: string, demoId: string): string {
  return path.join(workspacePath, "demos", demoId);
}

// ============================================================
// Workspace 统一清单（workspace-tree.json）— 取代 .demo.json + .folders.json
// ============================================================

const WORKSPACE_TREE_FILENAME = "workspace-tree.json";

function getWorkspaceTreePath(workspacePath: string): string {
  return path.join(workspacePath, WORKSPACE_TREE_FILENAME);
}

/**
 * 从旧格式（.folders.json + demos/{id}/.demo.json）迁移到 workspace-tree.json。
 * 仅在 workspace-tree.json 不存在时自动执行，写入后即持久化为新格式。
 */
function migrateLegacyToTree(workspacePath: string): WorkspaceTree {
  let folders: DemoFolderMeta[] = [];
  const legacyFoldersPath = path.join(workspacePath, ".folders.json");
  if (fs.existsSync(legacyFoldersPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyFoldersPath, "utf-8"));
      if (Array.isArray(parsed?.folders)) {
        folders = parsed.folders.map((f: Record<string, unknown>) => ({
          id: f.id as string,
          name: f.name as string,
          order: f.order as number,
          parentId: (f.parentId ?? null) as string | null,
        }));
      }
    } catch {
      /* ignore */
    }
  }

  const pages: DemoPageMeta[] = [];
  const demosDir = path.join(workspacePath, "demos");
  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const legacyMetaPath = path.join(demosDir, entry.name, ".demo.json");
      if (fs.existsSync(legacyMetaPath)) {
        try {
          const m = JSON.parse(fs.readFileSync(legacyMetaPath, "utf-8"));
          pages.push({
            id: (m.id as string) || entry.name,
            name: (m.name as string) || entry.name,
            order: typeof m.order === "number" ? m.order : pages.length,
            parentId: (m.parentId ?? null) as string | null,
          });
        } catch {
          /* ignore */
        }
      } else {
        // 目录存在但无 .demo.json：用目录名兜底
        const dir = path.join(demosDir, entry.name);
        if (
          fs.existsSync(path.join(dir, "index.tsx")) &&
          fs.existsSync(path.join(dir, "config.schema.json"))
        ) {
          pages.push({
            id: entry.name,
            name: entry.name.split("_")[0].replace(/-/g, " "),
            order: pages.length,
            parentId: null,
          });
        }
      }
    }
  }

  const tree: WorkspaceTree = { folders, pages };
  writeWorkspaceTree(workspacePath, tree);
  return tree;
}

/**
 * 读取 Workspace 统一清单（workspace-tree.json）。
 * 文件不存在时自动从旧格式迁移。
 */
function readWorkspaceTree(workspacePath: string): WorkspaceTree {
  const treePath = getWorkspaceTreePath(workspacePath);
  if (fs.existsSync(treePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(treePath, "utf-8"));
      return {
        folders: Array.isArray(parsed?.folders) ? parsed.folders : [],
        pages: Array.isArray(parsed?.pages) ? parsed.pages : [],
      };
    } catch {
      /* fall through to migration */
    }
  }
  return migrateLegacyToTree(workspacePath);
}

/**
 * 将统一清单写回 workspace-tree.json。
 * workspacePath 目录不存在时自动创建。
 */
function writeWorkspaceTree(workspacePath: string, tree: WorkspaceTree): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(
    getWorkspaceTreePath(workspacePath),
    JSON.stringify(tree, null, 2),
    "utf-8",
  );
}

/**
 * 读取页面元数据（从 workspace-tree.json 的 pages 数组）。
 * 页面不存在于清单中时返回 null。
 */
export function readDemoPageMeta(
  workspacePath: string,
  demoId: string,
): DemoPageMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  return tree.pages.find((p) => p.id === demoId) ?? null;
}

/**
 * 写入或合并页面元数据到 workspace-tree.json 的 pages 数组。
 * 不再维护 createdAt / updatedAt 字段。
 */
export function writeDemoPageMeta(
  workspacePath: string,
  demoId: string,
  patch: Partial<DemoPageMeta>,
): DemoPageMeta {
  const tree = readWorkspaceTree(workspacePath);
  const existingIdx = tree.pages.findIndex((p) => p.id === demoId);
  const existing = existingIdx !== -1 ? tree.pages[existingIdx] : null;
  const merged: DemoPageMeta = {
    id: existing?.id ?? demoId,
    name: patch.name ?? existing?.name ?? demoId,
    order: patch.order ?? existing?.order ?? 0,
    parentId:
      patch.parentId !== undefined
        ? patch.parentId
        : (existing?.parentId ?? null),
  };
  if (existingIdx !== -1) {
    tree.pages[existingIdx] = merged;
  } else {
    tree.pages.push(merged);
  }
  writeWorkspaceTree(workspacePath, tree);
  return merged;
}

/**
 * 列出 workspace 内所有有效的 Demo 页面（按 order/id 升序）。
 * 真值来源是文件系统 `demos/` 目录；元数据由 workspace-tree.json 提供。
 */
export function listDemoPages(workspacePath: string): DemoPageMeta[] {
  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) return [];

  const tree = readWorkspaceTree(workspacePath);
  const result: DemoPageMeta[] = [];

  for (const page of tree.pages) {
    const dir = path.join(demosDir, page.id);
    if (
      fs.existsSync(path.join(dir, "index.tsx")) &&
      fs.existsSync(path.join(dir, "config.schema.json"))
    ) {
      result.push(page);
    }
  }

  // 同时发现磁盘上有但 tree 中缺失的页面（如 AI Agent 创建后未更新 tree）
  for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (result.some((p) => p.id === entry.name)) continue;
    const dir = path.join(demosDir, entry.name);
    if (
      fs.existsSync(path.join(dir, "index.tsx")) &&
      fs.existsSync(path.join(dir, "config.schema.json"))
    ) {
      result.push({
        id: entry.name,
        name: entry.name.split("_")[0].replace(/-/g, " "),
        order: result.length,
        parentId: null,
      });
    }
  }

  return result.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

export function ensureWorkspaceFiles(workspacePath: string): {
  demoIds: string[];
  defaultDemoMeta?: DemoPageMeta;
} {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const demosDir = path.join(workspacePath, "demos");
  if (!fs.existsSync(demosDir)) {
    fs.mkdirSync(demosDir, { recursive: true });
  }

  // 确保知识库目录存在（含系统预设条目）
  ensureKnowledgeDir(workspacePath);

  const existing: string[] = [];
  for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(demosDir, entry.name);
    if (
      fs.existsSync(path.join(dir, "index.tsx")) &&
      fs.existsSync(path.join(dir, "config.schema.json"))
    ) {
      existing.push(entry.name);
    }
  }

  if (existing.length > 0) {
    return { demoIds: existing };
  }

  // 仓库为空：创建默认页面
  const demoId = generateDemoPageId("Default Page");
  const demoDir = path.join(demosDir, demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(path.join(demoDir, "index.tsx"), DEFAULT_DEMO_CODE, "utf-8");
  fs.writeFileSync(
    path.join(demoDir, "config.schema.json"),
    DEFAULT_DEMO_SCHEMA,
    "utf-8",
  );

  const meta: DemoPageMeta = {
    id: demoId,
    name: "默认页面",
    order: 0,
    parentId: null,
  };

  writeWorkspaceTree(workspacePath, { folders: [], pages: [meta] });

  return { demoIds: [demoId], defaultDemoMeta: meta };
}

/**
 * 确保知识库目录存在，含系统预设条目和 manifest.json
 * 仅在 knowledge/ 目录不存在时创建
 */
function ensureKnowledgeDir(workspacePath: string): void {
  const knowledgeDir = path.join(workspacePath, "knowledge");
  if (fs.existsSync(knowledgeDir)) return;

  fs.mkdirSync(knowledgeDir, { recursive: true });

  const systemDoc = {
    id: "kb_sys_001",
    title: "配置系统参考",
    source: "system",
    description: "配置系统支持的控件类型、扩展字段和完整示例",
    fileName: "配置系统参考.md",
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 写入系统预设知识文档
  fs.writeFileSync(
    path.join(knowledgeDir, systemDoc.fileName),
    CONFIG_SYSTEM_REFERENCE_CONTENT,
    "utf-8"
  );

  // 写入 manifest.json
  fs.writeFileSync(
    path.join(knowledgeDir, "manifest.json"),
    JSON.stringify({ version: 1, items: [systemDoc] }, null, 2),
    "utf-8"
  );
}

export function createProject(name: string): DemoMeta {
  ensureDirsExist();

  const projectId = `proj_${Date.now()}`;
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  const { demoIds, defaultDemoMeta } = ensureWorkspaceFiles(workspacePath);

  // 多页面架构：项目元数据需记录所有 demo 页面的 meta
  const now = Date.now();
  const demoPages: DemoPageMeta[] = demoIds.map((demoId, index) => {
    if (defaultDemoMeta && demoId === defaultDemoMeta.id) {
      return defaultDemoMeta;
    }
    const meta = readDemoPageMeta(workspacePath, demoId);
    return (
      meta ?? {
        id: demoId,
        name: demoId,
        order: index,
        parentId: null,
      }
    );
  });

  const project: Project = {
    id: projectId,
    name: name || projectId,
    workspacePath,
    demoPages,
    demoFolders: [],
    versions: [],
    createdAt: now,
    updatedAt: now,
  };

  fs.writeFileSync(
    path.join(projectPath, "project.json"),
    JSON.stringify(project, null, 2),
    "utf-8",
  );

  const stats = fs.statSync(projectPath);

  return {
    id: projectId,
    name: name || projectId,
    createdAt: stats.birthtimeMs,
    updatedAt: stats.mtimeMs,
  };
}

export function deleteProject(projectId: string): boolean {
  if (!projectExists(projectId)) {
    return false;
  }

  const projectPath = getProjectPath(projectId);
  fs.rmSync(projectPath, { recursive: true, force: true });

  return true;
}

export function createSession(projectId: string): SessionMeta {
  ensureDirsExist();

  if (!projectExists(projectId)) {
    throw new Error(ERROR_MESSAGES.DEMO_NOT_FOUND);
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const sessionDir = path.join(SESSIONS_DIR, projectId);
  const sessionPath = path.join(sessionDir, sessionId);
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  ensureWorkspaceFiles(workspacePath);

  fs.mkdirSync(sessionDir, { recursive: true });
  fs.cpSync(workspacePath, sessionPath, { recursive: true });

  const now = Date.now();
  const sessionMeta: SessionMeta = {
    sessionId,
    demoId: projectId,
    createdAt: now,
    expiresAt: now + SESSION_EXPIRY_MS,
  };

  fs.writeFileSync(
    path.join(sessionPath, ".session.json"),
    JSON.stringify(sessionMeta, null, 2),
    "utf-8",
  );

  return sessionMeta;
}

export function getSessionMeta(sessionId: string): SessionMeta | null {
  console.log(`[getSessionMeta] 获取 session 元数据: ${sessionId}`);

  if (!sessionExists(sessionId)) {
    console.error(`[getSessionMeta] session 不存在: ${sessionId}`);
    return null;
  }

  const sessionPath = getSessionPath(sessionId);
  console.log(`[getSessionMeta] sessionPath: ${sessionPath}`);

  const metaPath = path.join(sessionPath, ".session.json");
  console.log(`[getSessionMeta] metaPath: ${metaPath}`);

  if (!fs.existsSync(metaPath)) {
    console.error(`[getSessionMeta] .session.json 文件不存在: ${metaPath}`);
    return null;
  }

  const content = fs.readFileSync(metaPath, "utf-8");
  console.log(`[getSessionMeta] .session.json 内容: ${content}`);

  const meta = JSON.parse(content) as SessionMeta;
  console.log(`[getSessionMeta] 解析后的元数据:`, meta);

  return meta;
}

export function deleteSession(sessionId: string): boolean {
  if (!sessionExists(sessionId)) {
    return false;
  }

  const sessionPath = getSessionPath(sessionId);

  try {
    const metaPath = path.join(sessionPath, ".session.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (meta.workspaceId) {
        const wsPath = findWorkspacePath(meta.workspaceId);
        if (wsPath && fs.existsSync(wsPath)) {
          fs.rmSync(wsPath, { recursive: true, force: true });
        }
      }
    }
  } catch {
    // 元数据读取失败不影响 session 删除
  }

  fs.rmSync(sessionPath, { recursive: true, force: true });

  return true;
}

export function isSessionExpired(sessionMeta: SessionMeta): boolean {
  return Date.now() > sessionMeta.expiresAt;
}

export function createApiError(
  code: ErrorCodeType,
  message?: string,
  details?: unknown,
) {
  return {
    success: false as const,
    error: {
      code,
      message: message || ERROR_MESSAGES[code],
      details,
    },
  };
}

export function createApiSuccess<T>(data: T) {
  return {
    success: true as const,
    data,
  };
}

// ========================================
// 项目元数据操作
// ========================================

export function readProjectMeta(projectId: string): Project | null {
  const projectPath = getProjectPath(projectId);
  const projectJsonPath = path.join(projectPath, "project.json");

  if (!fs.existsSync(projectJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(projectJsonPath, "utf-8");
    const parsed = JSON.parse(content) as Partial<Project>;
    // 防御性兜底：旧版 project.json 可能缺少 demoPages / versions / demoFolders
    const demoPages = Array.isArray(parsed.demoPages)
      ? parsed.demoPages.map((p) => ({ ...p, parentId: p.parentId ?? null }))
      : [];
    return {
      ...parsed,
      id: parsed.id ?? projectId,
      name: parsed.name ?? projectId,
      workspacePath:
        parsed.workspacePath ?? path.join(projectPath, "workspace"),
      demoPages,
      demoFolders: Array.isArray(parsed.demoFolders) ? parsed.demoFolders : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      createdAt: parsed.createdAt ?? Date.now(),
      updatedAt: parsed.updatedAt ?? Date.now(),
    } as Project;
  } catch {
    return null;
  }
}

export function writeProjectMeta(projectId: string, project: Project): void {
  const projectPath = getProjectPath(projectId);
  const projectJsonPath = path.join(projectPath, "project.json");
  fs.writeFileSync(projectJsonPath, JSON.stringify(project, null, 2), "utf-8");
}

// ========================================
// 版本管理工具函数
// ========================================

export function countFiles(dir: string): number {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }

  return count;
}

export function generateVersionId(project: Project): string {
  return `v${project.versions.length + 1}`;
}

export function cleanupOldVersions(project: Project): void {
  if (project.versions.length <= MAX_VERSIONS_KEEP) return;

  const toDelete = project.versions.slice(
    0,
    project.versions.length - MAX_VERSIONS_KEEP,
  );

  for (const version of toDelete) {
    if (fs.existsSync(version.snapshotPath)) {
      fs.rmSync(version.snapshotPath, { recursive: true, force: true });
    }
  }

  project.versions = project.versions.slice(-MAX_VERSIONS_KEEP);
}

// ========================================
// 版本历史查询
// ========================================

export function getVersionHistory(projectId: string): VersionInfo[] {
  const project = readProjectMeta(projectId);
  if (!project) return [];
  return [...project.versions].reverse();
}

export function getLatestVersion(projectId: string): VersionInfo | null {
  const project = readProjectMeta(projectId);
  if (!project || project.versions.length === 0) return null;
  return project.versions[project.versions.length - 1];
}

// ========================================
// 版本恢复
// ========================================

export function restoreVersion(
  projectId: string,
  versionId: string,
  userId?: string,
): { success: boolean; newVersionId?: string; error?: string } {
  const project = readProjectMeta(projectId);
  if (!project) {
    return { success: false, error: "项目不存在" };
  }

  const targetVersion = project.versions.find((v) => v.versionId === versionId);
  if (!targetVersion) {
    return { success: false, error: `版本 ${versionId} 不存在` };
  }

  if (!fs.existsSync(targetVersion.snapshotPath)) {
    return { success: false, error: `版本快照已丢失: ${versionId}` };
  }

  const workspacePath = path.join(getProjectPath(projectId), "workspace");

  // 1. 备份当前 workspace
  const backupVersionId = generateVersionId(project);
  const backupSnapshotPath = getSnapshotPath(projectId, backupVersionId);
  fs.mkdirSync(path.dirname(backupSnapshotPath), { recursive: true });
  fs.cpSync(workspacePath, backupSnapshotPath, { recursive: true });

  const backupVersion: VersionInfo = {
    versionId: backupVersionId,
    savedAt: Date.now(),
    savedBy: userId || "system",
    sessionId: `restore-from-${versionId}`,
    snapshotPath: backupSnapshotPath,
    fileCount: countFiles(workspacePath),
    note: `恢复版本前的自动备份 (基于 ${versionId})`,
  };
  project.versions.push(backupVersion);

  // 2. 用目标版本快照覆盖 workspace
  fs.rmSync(workspacePath, { recursive: true, force: true });
  fs.cpSync(targetVersion.snapshotPath, workspacePath, { recursive: true });

  // 3. 记录恢复操作作为新版本
  const restoreVersionId = generateVersionId(project);
  const restoreSnapshotPath = getSnapshotPath(projectId, restoreVersionId);
  fs.cpSync(workspacePath, restoreSnapshotPath, { recursive: true });

  const restoreVersionInfo: VersionInfo = {
    versionId: restoreVersionId,
    savedAt: Date.now(),
    savedBy: userId || "system",
    sessionId: `restore-${versionId}`,
    snapshotPath: restoreSnapshotPath,
    fileCount: countFiles(workspacePath),
    note: `恢复到版本 ${versionId}`,
  };
  project.versions.push(restoreVersionInfo);
  project.updatedAt = Date.now();

  // 4. 清理旧版本
  cleanupOldVersions(project);

  // 5. 保存项目元数据
  writeProjectMeta(projectId, project);

  return { success: true, newVersionId: restoreVersionId };
}

// ========================================
// Session Assets 工具函数
// ========================================

export function getSessionAssetsPath(sessionId: string): string | null {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath) return null;
  return path.join(sessionPath, "assets", "images");
}

export function ensureSessionAssetsDir(sessionId: string): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;
  if (!fs.existsSync(assetsPath)) {
    fs.mkdirSync(assetsPath, { recursive: true });
  }
  return assetsPath;
}

export function generateAssetFilename(originalName: string): string {
  const ext = path.extname(originalName) || ".bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `img_${timestamp}_${random}${ext}`;
}

export function saveSessionAsset(
  sessionId: string,
  filename: string,
  data: Buffer,
): { success: boolean; url?: string; error?: string } {
  try {
    const assetsPath = ensureSessionAssetsDir(sessionId);
    if (!assetsPath) {
      return { success: false, error: "Session 不存在" };
    }

    const filePath = path.join(assetsPath, filename);
    fs.writeFileSync(filePath, data);

    const url = `/api/sessions/${sessionId}/assets/${filename}`;
    return { success: true, url };
  } catch (error) {
    return { success: false, error: `保存文件失败: ${error}` };
  }
}

export function getSessionAssetPath(
  sessionId: string,
  filename: string,
): string | null {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath) return null;

  const filePath = path.join(assetsPath, filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

export function deleteSessionAsset(
  sessionId: string,
  filename: string,
): boolean {
  const filePath = getSessionAssetPath(sessionId, filename);
  if (!filePath) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function listSessionAssets(sessionId: string): string[] {
  const assetsPath = getSessionAssetsPath(sessionId);
  if (!assetsPath || !fs.existsSync(assetsPath)) return [];

  try {
    return fs.readdirSync(assetsPath).filter((name) => {
      const stat = fs.statSync(path.join(assetsPath, name));
      return stat.isFile();
    });
  } catch {
    return [];
  }
}

// ========================================
// 工作空间路径工具函数
// ========================================

export function getWorkspacePath(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, workspaceId);
}

export function findWorkspacePath(workspaceId: string): string | null {
  const directPath = path.join(WORKSPACES_DIR, workspaceId);
  if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
    return directPath;
  }

  if (!fs.existsSync(WORKSPACES_DIR)) return null;

  const userDirs = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const projectDirs = fs.readdirSync(
      path.join(WORKSPACES_DIR, userDir.name),
      { withFileTypes: true },
    );
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const wsPath = path.join(
        WORKSPACES_DIR,
        userDir.name,
        projectDir.name,
        workspaceId,
      );
      if (fs.existsSync(wsPath) && fs.statSync(wsPath).isDirectory()) {
        return wsPath;
      }
    }
  }

  return null;
}

export function getWorkspaceDir(userId: string, projectId: string): string {
  return path.join(WORKSPACES_DIR, userId, projectId);
}

export function workspaceExists(workspaceId: string): boolean {
  return findWorkspacePath(workspaceId) !== null;
}

export interface WorkspaceMeta {
  workspaceId: string;
  demoId: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
}

export function getWorkspaceMeta(workspaceId: string): WorkspaceMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const metaPath = path.join(wsPath, ".workspace.json");
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8")) as WorkspaceMeta;
  } catch {
    return null;
  }
}

export function writeWorkspaceMeta(
  workspaceId: string,
  meta: WorkspaceMeta,
): void {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return;

  fs.writeFileSync(
    path.join(wsPath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );
}

export function getWorkspaceFiles(workspaceId: string): DemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const codePath = path.join(wsPath, "index.tsx");
  const schemaPath = path.join(wsPath, "config.schema.json");

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) return null;

  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
  };
}

export function updateWorkspaceFiles(
  workspaceId: string,
  files: DemoFiles,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.writeFileSync(path.join(wsPath, "index.tsx"), files.code, "utf-8");
  fs.writeFileSync(
    path.join(wsPath, "config.schema.json"),
    files.schema,
    "utf-8",
  );
  return true;
}

export function getSessionWorkspacePath(sessionId: string): string | null {
  const meta = getSessionMeta(sessionId);
  if (!meta || !meta.workspaceId) return null;
  return findWorkspacePath(meta.workspaceId);
}

// ========================================
// Demo 相关函数（兼容性别名）
// ========================================

export function getDemosDir(): string {
  return PROJECTS_DIR;
}

export function getDemoPath(demoId: string): string {
  return getProjectPath(demoId);
}

export function demoExists(demoId: string): boolean {
  return projectExists(demoId);
}

export function listDemos(): DemoMeta[] {
  return listProjects();
}

export function createDemo(name: string): DemoMeta {
  return createProject(name);
}

export function deleteDemo(demoId: string): boolean {
  return deleteProject(demoId);
}

// ============================================================
// 多页面 Workspace CRUD（基于 workspaceId）
// ============================================================

/**
 * 读取 Workspace 内所有 Demo 页面的代码 + Schema，并附带项目级配置 Schema。
 * 取代旧的 `getWorkspaceFiles()` 单页面读取。
 */
export function getWorkspaceMultiDemoFiles(
  workspaceId: string,
): MultiDemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return null;

  const demosDir = path.join(wsPath, "demos");
  const demos: Record<string, DemoFiles> = {};

  if (fs.existsSync(demosDir)) {
    for (const entry of fs.readdirSync(demosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(demosDir, entry.name);
      const codePath = path.join(dir, "index.tsx");
      const schemaPath = path.join(dir, "config.schema.json");
      if (fs.existsSync(codePath) && fs.existsSync(schemaPath)) {
        demos[entry.name] = {
          code: fs.readFileSync(codePath, "utf-8"),
          schema: fs.readFileSync(schemaPath, "utf-8"),
        };
      }
    }
  }

  const projectConfigSchema = getProjectConfigSchema(wsPath);
  return { demos, projectConfigSchema };
}

/**
 * 读取 Workspace 内单个 Demo 页面的文件，便于代码编辑 Tab 切换。
 */
export function getWorkspaceDemoPageFiles(
  workspaceId: string,
  demoId: string,
): DemoFiles | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const demoDir = getDemoDirPath(wsPath, demoId);
  const codePath = path.join(demoDir, "index.tsx");
  const schemaPath = path.join(demoDir, "config.schema.json");

  if (!fs.existsSync(codePath) || !fs.existsSync(schemaPath)) return null;
  return {
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
  };
}

/**
 * 写入 Workspace 内某 Demo 页面的代码 / Schema，可选地合并 `.demo.json` 元数据。
 */
export function updateWorkspaceDemoFiles(
  workspaceId: string,
  demoId: string,
  files: Partial<DemoFiles>,
  meta?: Partial<DemoPageMeta>,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  const demoDir = getDemoDirPath(wsPath, demoId);
  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  if (typeof files.code === "string") {
    fs.writeFileSync(path.join(demoDir, "index.tsx"), files.code, "utf-8");
  }
  if (typeof files.schema === "string") {
    fs.writeFileSync(
      path.join(demoDir, "config.schema.json"),
      files.schema,
      "utf-8",
    );
  }
  if (meta) {
    writeDemoPageMeta(wsPath, demoId, meta);
  }

  return true;
}

/**
 * 创建一个新的 Demo 页面，写入默认 `index.tsx`、`config.schema.json` 并注册到 workspace-tree.json。
 * `order` 取当前最大 order + 1。
 */
export function createWorkspaceDemoPage(
  workspaceId: string,
  name: string,
  parentId?: string | null,
): DemoPageMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const existing = listDemoPages(wsPath);
  const sameParent = existing.filter(
    (d) => (d.parentId ?? null) === (parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((d) => d.order)) + 1 : 0;

  const demoId = generateDemoPageId(name);
  const demoDir = getDemoDirPath(wsPath, demoId);
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(path.join(demoDir, "index.tsx"), DEFAULT_DEMO_CODE, "utf-8");
  fs.writeFileSync(
    path.join(demoDir, "config.schema.json"),
    DEFAULT_DEMO_SCHEMA,
    "utf-8",
  );

  const meta: DemoPageMeta = {
    id: demoId,
    name: name?.trim() || "新建页面",
    order: nextOrder,
    parentId: parentId ?? null,
  };

  writeDemoPageMeta(wsPath, demoId, meta);
  return meta;
}

/**
 * 复制 Workspace 内某 Demo 页面（含目录及所有文件），返回新页面元数据。
 */
export function copyWorkspaceDemoPage(
  workspaceId: string,
  sourceDemoId: string,
  name: string,
): DemoPageMeta | null {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return null;

  const sourceDir = getDemoDirPath(wsPath, sourceDemoId);
  if (!fs.existsSync(sourceDir)) return null;

  const sourceMeta = readDemoPageMeta(wsPath, sourceDemoId);
  const existing = listDemoPages(wsPath);
  const sameParent = existing.filter(
    (d) => (d.parentId ?? null) === (sourceMeta?.parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((d) => d.order)) + 1 : 0;

  const demoId = generateDemoPageId(name);
  const demoDir = getDemoDirPath(wsPath, demoId);
  fs.cpSync(sourceDir, demoDir, { recursive: true });

  const meta: DemoPageMeta = {
    id: demoId,
    name: name?.trim() || "复制的页面",
    order: nextOrder,
    parentId: sourceMeta?.parentId ?? null,
  };

  writeDemoPageMeta(wsPath, demoId, meta);
  return meta;
}

/**
 * 删除 Workspace 内某 Demo 页面（含目录及所有文件）。
 */
export function deleteWorkspaceDemoPage(
  workspaceId: string,
  demoId: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  const demoDir = getDemoDirPath(wsPath, demoId);
  if (!fs.existsSync(demoDir)) return false;
  fs.rmSync(demoDir, { recursive: true, force: true });
  return true;
}

/**
 * 列出 Workspace 中所有 Demo 页面的元数据（按 order 升序）
 */
export function listWorkspaceDemoPages(workspaceId: string): DemoPageMeta[] {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return [];
  return listDemoPages(wsPath);
}

// ============================================================
// 项目级共享配置（workspace/project.config.schema.json）
// 是否存在由文件存在性实时判定，不在 project.json 中持久化任何标记字段。
// ============================================================

const PROJECT_CONFIG_FILENAME = "project.config.schema.json";

export function getProjectConfigPath(workspacePath: string): string {
  return path.join(workspacePath, PROJECT_CONFIG_FILENAME);
}

/**
 * 读取项目级配置 Schema 内容（不存在时返回 undefined）
 */
export function getProjectConfigSchema(
  workspacePath: string,
): string | undefined {
  const filePath = getProjectConfigPath(workspacePath);
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, "utf-8");
}

/**
 * 写入项目级配置 Schema（创建或覆盖）
 */
export function saveProjectConfigSchema(
  workspacePath: string,
  schema: string,
): void {
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }
  fs.writeFileSync(getProjectConfigPath(workspacePath), schema, "utf-8");
}

/**
 * 删除项目级配置 Schema 文件（无项目级配置）
 */
export function deleteProjectConfigSchema(workspacePath: string): boolean {
  const filePath = getProjectConfigPath(workspacePath);
  if (!fs.existsSync(filePath)) return false;
  fs.rmSync(filePath, { force: true });
  return true;
}

/**
 * 通过 workspaceId 读取项目级配置 Schema
 */
export function getWorkspaceProjectConfigSchema(
  workspaceId: string,
): string | undefined {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return undefined;
  return getProjectConfigSchema(wsPath);
}

/**
 * 通过 workspaceId 写入项目级配置 Schema
 */
export function saveWorkspaceProjectConfigSchema(
  workspaceId: string,
  schema: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  saveProjectConfigSchema(wsPath, schema);
  return true;
}

/**
 * 通过 workspaceId 删除项目级配置 Schema
 */
export function deleteWorkspaceProjectConfigSchema(
  workspaceId: string,
): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;
  return deleteProjectConfigSchema(wsPath);
}

/**
 * 保存流程使用：通过 workspace 当前 demos 目录回写 project.json 的 demoPages 数组。
 * 真值来源是 workspace 文件系统；调用方需要传入持久化路径所属的 workspacePath。
 */
export function syncProjectDemoPagesFromWorkspace(
  projectId: string,
  workspacePath: string,
): DemoPageMeta[] {
  const project = readProjectMeta(projectId);
  if (!project) return [];
  const fresh = listDemoPages(workspacePath);
  project.demoPages = fresh;
  project.demoFolders = readWorkspaceTree(workspacePath).folders;
  project.updatedAt = Date.now();
  writeProjectMeta(projectId, project);
  return fresh;
}

// ============================================================
// 虚拟文件夹管理（workspace-tree.json 的 folders 数组）
// ============================================================

/**
 * 读取虚拟文件夹元数据（从 workspace-tree.json 的 folders 数组）。
 * 保留此函数兼容外部调用，内部委托给 readWorkspaceTree。
 */
export function readFoldersMeta(workspacePath: string): DemoFolderMeta[] {
  return readWorkspaceTree(workspacePath).folders;
}

export function generateFolderId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getFolderDepth(
  folderId: string,
  folders: DemoFolderMeta[],
): number {
  let depth = 0;
  let current = folders.find((f) => f.id === folderId);
  while (current?.parentId) {
    depth++;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return depth;
}

export function isDescendant(
  folderId: string,
  targetParentId: string,
  folders: DemoFolderMeta[],
): boolean {
  let current = folders.find((f) => f.id === targetParentId);
  while (current) {
    if (current.id === folderId) return true;
    current = folders.find((f) => f.id === current!.parentId);
  }
  return false;
}

export function createDemoFolder(
  workspacePath: string,
  name: string,
  parentId?: string | null,
): DemoFolderMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  const folders = tree.folders;

  if (parentId) {
    const parent = folders.find((f) => f.id === parentId);
    if (!parent) return null;
    if (getFolderDepth(parentId, folders) >= 3) return null;
  }

  const sameParent = folders.filter(
    (f) => (f.parentId ?? null) === (parentId ?? null),
  );
  const nextOrder =
    sameParent.length > 0 ? Math.max(...sameParent.map((f) => f.order)) + 1 : 0;

  const folder: DemoFolderMeta = {
    id: generateFolderId(),
    name: name.trim() || "新建文件夹",
    parentId: parentId ?? null,
    order: nextOrder,
  };

  tree.folders.push(folder);
  writeWorkspaceTree(workspacePath, tree);
  return folder;
}

export function updateDemoFolder(
  workspacePath: string,
  folderId: string,
  patch: { name?: string; parentId?: string | null; order?: number },
): DemoFolderMeta | null {
  const tree = readWorkspaceTree(workspacePath);
  const index = tree.folders.findIndex((f) => f.id === folderId);
  if (index === -1) return null;

  if (patch.parentId !== undefined && patch.parentId !== null) {
    const targetParent = tree.folders.find((f) => f.id === patch.parentId);
    if (!targetParent) return null;
    if (isDescendant(folderId, patch.parentId, tree.folders)) return null;
    if (getFolderDepth(folderId, tree.folders) + 1 > 3) return null;
  }

  const existing = tree.folders[index];
  tree.folders[index] = {
    ...existing,
    ...(patch.name !== undefined && { name: patch.name.trim() }),
    ...(patch.parentId !== undefined && { parentId: patch.parentId }),
    ...(patch.order !== undefined && { order: patch.order }),
  };

  writeWorkspaceTree(workspacePath, tree);
  return tree.folders[index];
}

export function deleteDemoFolder(
  workspacePath: string,
  folderId: string,
  deleteContents: boolean = false,
): { success: boolean; deletedPageIds?: string[] } {
  const tree = readWorkspaceTree(workspacePath);
  const index = tree.folders.findIndex((f) => f.id === folderId);
  if (index === -1) return { success: false };

  const deletedPageIds: string[] = [];

  if (deleteContents) {
    const descendantFolderIds = new Set<string>();
    const collectDescendants = (parentId: string) => {
      for (const f of tree.folders) {
        if (f.parentId === parentId) {
          descendantFolderIds.add(f.id);
          collectDescendants(f.id);
        }
      }
    };
    collectDescendants(folderId);
    descendantFolderIds.add(folderId);

    const pages = tree.pages;
    for (const page of pages) {
      if (page.parentId && descendantFolderIds.has(page.parentId)) {
        const wsId = path.basename(workspacePath);
        deleteWorkspaceDemoPage(wsId, page.id);
        deletedPageIds.push(page.id);
      }
    }

    tree.folders = tree.folders.filter((f) => !descendantFolderIds.has(f.id));
    tree.pages = tree.pages.filter((p) => !deletedPageIds.includes(p.id));
    writeWorkspaceTree(workspacePath, tree);
  } else {
    tree.folders = tree.folders.filter((f) => f.id !== folderId);
    for (const f of tree.folders) {
      if (f.parentId === folderId) {
        f.parentId =
          tree.folders.find((fo) => fo.id === folderId)?.parentId ?? null;
      }
    }

    let changed = false;
    for (const p of tree.pages) {
      if (p.parentId === folderId) {
        p.parentId =
          tree.folders.find((fo) => fo.id === folderId)?.parentId ?? null;
        changed = true;
      }
    }

    writeWorkspaceTree(workspacePath, tree);
  }

  return { success: true, deletedPageIds };
}

export function reorderDemoPages(
  workspacePath: string,
  pageUpdates: Array<{ id: string; order: number; parentId: string | null }>,
  folderUpdates?: Array<{ id: string; order: number; parentId: string | null }>,
): boolean {
  const tree = readWorkspaceTree(workspacePath);

  for (const u of pageUpdates) {
    const idx = tree.pages.findIndex((p) => p.id === u.id);
    if (idx !== -1) {
      tree.pages[idx] = {
        ...tree.pages[idx],
        order: u.order,
        parentId: u.parentId,
      };
    }
  }

  if (folderUpdates && folderUpdates.length > 0) {
    for (const u of folderUpdates) {
      const idx = tree.folders.findIndex((f) => f.id === u.id);
      if (idx !== -1) {
        tree.folders[idx] = {
          ...tree.folders[idx],
          order: u.order,
          parentId: u.parentId,
        };
      }
    }
  }

  writeWorkspaceTree(workspacePath, tree);
  return true;
}
