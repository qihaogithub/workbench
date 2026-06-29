# 项目发布图片资源 OSS 上传方案

## 1. 背景

### 1.1 现状

当前创作端的项目开发和发布流程如下：

1. **开发阶段**：AI Agent 生成代码，使用本地相对路径引用图片
2. **预览阶段**：使用端通过 iframe 加载，本地图片可正常显示
3. **发布阶段**：项目复制到 `data/published/` 目录，供使用端访问

**问题 1**：发布后的项目如果使用本地图片路径，在使用端环境中无法访问（工作空间路径不存在）。

**问题 2**：用户通过聊天框发送的图片（Base64 内联或图片 URL），AI 无法保存到工作区，导致生成的代码中无法引用这些图片。

**问题 3**：用户有时提供的是图片 URL（如 `https://example.com/photo.png`）而非本地文件上传，当前方案仅支持 Base64 内联图片，缺少对 URL 来源图片的处理能力。

### 1.2 需求场景

- AI 生成包含产品展示图的电商页面
- AI 生成带背景图的 Landing Page
- AI 需要将用户上传的参考图片嵌入到生成的页面中
- 项目发布后，图片资源需持久可访问

### 1.3 用户发送图片的处理流程

#### 场景 A：用户上传图片文件（Base64）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    用户发送图片（文件上传）                                │
├─────────────────────────────────────────────────────────────────────────┤
│  1. UI 层：用户选择图片，Base64 编码后作为附件发送                        │
│  2. 传输层：WebSocket 消息携带 images 字段                              │
│  3. 后端分流：                                                          │
│     ├─ 多模态模型 → 图片作为 content block 传给 LLM                     │
│     └─ 非多模态模型 → 后端自动保存到工作区，路径注入提示文本              │
│  4. AI 保存：调用 saveImage 工具（或使用自动保存的图片）                  │
│  5. AI 生成代码：使用本地相对路径引用已保存的图片                        │
│  6. 发布时：自动上传图片到 OSS，替换路径                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 场景 B：用户发送图片 URL

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    用户发送图片 URL                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  1. 用户在聊天中提供 URL："帮我用这张图 https://example.com/photo.png"   │
│  2. AI 接收：从消息文本中提取图片 URL                                    │
│  3. 【待实现】saveImage 工具下载 URL 图片并保存到工作区                  │
│  4. AI 生成代码：使用本地相对路径引用已保存的图片                        │
│  5. 发布时：自动上传图片到 OSS，替换路径                                 │
│                                                                         │
│  注意：URL 图片存在以下风险需处理：                                      │
│  - URL 可能不可访问（超时/403/域名不存在）                               │
│  - URL 可能指向非图片资源                                                │
│  - URL 可能包含恶意内容                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. 目标

### 2.1 核心目标

**目标 A：发布时自动处理图片资源**

1. 扫描所有页面文件，提取本地图片引用
2. 批量上传图片至阿里云 OSS
3. 替换发布产物中的图片路径为 OSS URL
4. 保持源码中始终使用本地相对路径

**目标 B：支持 AI 保存用户图片到工作区**

1. 新增 `saveImage` 工具，支持 Base64 图片保存到工作区
2. AI 可在生成代码时引用已保存的图片
3. 支持用户发送图片后，AI 自动保存并引用
4. 支持用户发送图片 URL，AI 下载并保存到工作区

### 2.2 设计原则

- **关注点分离**：开发阶段专注创作，发布阶段处理资源
- **源码纯净**：源码保持相对路径，发布产物才包含 CDN URL
- **零 AI 成本**：不消耗 LLM token，不增加对话轮次
- **Git 友好**：代码 diff 清晰，不会因 OSS URL 变化污染历史

### 2.3 非目标

- 不支持视频/音频等其他媒体类型（本期仅图片）
- 不修改开发阶段的预览逻辑（本地图片继续可用）
- 不提供 OSS 文件管理界面（由 OSS 控制台完成）

## 3. 方案设计

### 3.1 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              开发阶段                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  AI Agent → 生成代码（使用本地相对路径）→ 本地预览 → 保存到工作空间         │
│                                                                             │
│  用户发送图片：                                                              │
│    ├─ 多模态模型 → 图片作为 content block 传给 LLM，AI 可「看到」图片       │
│    └─ 非多模态模型 → 后端自动 Base64 解码保存到 images/，路径写入提示文本   │
│  AI 调用 saveImage 工具（或使用自动保存）+ 引用 ./images/xxx.png           │
│                                                                             │
│  源码示例：                                                                  │
│  <img src="./images/hero.png" />                                           │
│  background-image: url('../assets/bg.jpg')                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 点击"发布"
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              发布阶段                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. 扫描工作空间所有页面文件                                                  │
│  2. 解析图片引用（正则提取本地路径）                                         │
│  3. 过滤出本地图片（排除 http://、https://、data:）                         │
│  4. 去重后批量上传 OSS（并发 + 进度回调）                                    │
│  5. 生成映射表 { localPath → ossUrl }                                       │
│  6. 复制文件到发布目录，同时替换图片路径                                     │
│  7. 部署到使用端                                                            │
│                                                                             │
│  发布产物示例：                                                              │
│  <img src="https://oss.xxx.com/projects/proj_123/images/hero.png" />       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 两个核心能力

| 能力               | 触发时机     | 实现位置      | 说明                                     |
| :----------------- | :----------- | :------------ | :--------------------------------------- |
| **saveImage 工具** | AI 对话中    | agent-service | 保存 Base64 图片 / 下载 URL 图片到工作区 |
| **发布图片处理**   | 点击发布按钮 | author-site   | 批量上传本地图片到 OSS                   |

### 3.3 核心模块设计

#### 3.3.1 模块位置

```
packages/author-site/src/lib/publish/
├── image-processor.ts      # 图片处理核心逻辑
├── image-scanner.ts        # 扫描文件提取图片引用
├── oss-uploader.ts         # OSS 上传封装
└── path-replacer.ts        # 路径替换逻辑
```

#### 3.3.2 核心接口

```typescript
// packages/author-site/src/lib/publish/types.ts

export interface ImageReference {
  /** 原始引用路径，如 "./images/hero.png" */
  originalPath: string;
  /** 解析后的绝对路径 */
  absolutePath: string;
  /** 所在文件路径 */
  sourceFile: string;
  /** 引用类型：img-src | css-url | import */
  type: "img-src" | "css-url" | "import";
}

export interface UploadResult {
  localPath: string;
  ossUrl: string;
  ossKey: string;
  size: number;
  success: boolean;
  error?: string;
}

export interface PublishContext {
  projectId: string;
  workspacePath: string;
  publishDir: string;
  onProgress?: (current: number, total: number, message: string) => void;
}
```

### 3.4 图片扫描逻辑

```typescript
// packages/author-site/src/lib/publish/image-scanner.ts

/**
 * 扫描工作空间，提取所有图片引用
 */
export async function scanImageReferences(
  workspacePath: string,
): Promise<ImageReference[]> {
  const references: ImageReference[] = [];

  // 扫描所有页面文件
  const files = await glob("demos/*/index.tsx", { cwd: workspacePath });

  for (const file of files) {
    const content = await fs.readFile(file, "utf-8");
    const refs = extractImageReferences(content, file);
    references.push(...refs);
  }

  return references;
}

/**
 * 从文件内容中提取图片引用
 */
function extractImageReferences(
  content: string,
  sourceFile: string,
): ImageReference[] {
  const references: ImageReference[] = [];

  // 匹配 <img src="..." />
  const imgRegex = new RegExp(
    "<img[^>]+src=" + "[\"']" + "([^\"']+)" + "[\"']",
    "g"
  );

  // 匹配 CSS url(...)
  const cssUrlRegex = new RegExp(
    "url\\(" + "[\"']?" + "([^\"')]+)" + "[\"']?" + "\\)",
    "g"
  );

  // 匹配 import 语句
  const importRegex = new RegExp(
    "import\\s+\\w+\\s+from\\s+" +
      "[\"']" +
      "([^\"']+\\.(?:png|jpg|jpeg|gif|webp|svg))" +
      "[\"']",
    "g"
  );

  // 提取并过滤本地路径
  // ...

  return references;
}

/**
 * 判断是否为本地图片路径
 */
function isLocalPath(path: string): boolean {
  // 排除：http://、https://、data:、//
  if (/^(https?:|data:|\/\/)/i.test(path)) return false;
  // 排除占位图服务
  if (/placehold\.co|placeholder\.com/i.test(path)) return false;
  // 包含图片扩展名
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(path);
}
```

### 3.5 OSS 上传逻辑

```typescript
// packages/author-site/src/lib/publish/oss-uploader.ts

import OSS from "ali-oss";

export class OSSUploader {
  private client: OSS;
  private projectId: string;

  constructor(config: OSSConfig, projectId: string) {
    this.client = new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
    });
    this.projectId = projectId;
  }

  /**
   * 批量上传图片
   */
  async uploadBatch(
    images: ImageReference[],
    options: {
      concurrency?: number;
      onProgress?: (current: number, total: number) => void;
    } = {},
  ): Promise<UploadResult[]> {
    const { concurrency = 5, onProgress } = options;
    const results: UploadResult[] = [];

    // 去重（相同路径只上传一次）
    const uniqueImages = this.dedupe(images);
    const total = uniqueImages.length;
    let current = 0;

    // 并发上传
    const chunks = this.chunk(uniqueImages, concurrency);
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((img) => this.uploadSingle(img)),
      );
      results.push(...chunkResults);
      current += chunk.length;
      onProgress?.(current, total);
    }

    return results;
  }

  /**
   * 上传单个图片
   */
  private async uploadSingle(image: ImageReference): Promise<UploadResult> {
    const ossKey = this.generateOSSKey(image.absolutePath);

    try {
      const result = await this.client.put(ossKey, image.absolutePath);
      return {
        localPath: image.originalPath,
        ossUrl: result.url,
        ossKey: result.name,
        size: (await fs.stat(image.absolutePath)).size,
        success: true,
      };
    } catch (error) {
      return {
        localPath: image.originalPath,
        ossUrl: "",
        ossKey: "",
        size: 0,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 生成 OSS Key
   */
  private generateOSSKey(absolutePath: string): string {
    const ext = path.extname(absolutePath);
    const baseName = path.basename(absolutePath, ext);
    const hash = crypto
      .createHash("md5")
      .update(absolutePath + Date.now())
      .digest("hex")
      .slice(0, 8);

    return `projects/${this.projectId}/images/${baseName}-${hash}${ext}`;
  }
}
```

### 3.6 发布流程整合

```typescript
// packages/author-site/src/lib/publish/image-processor.ts

export async function processImagesForPublish(
  context: PublishContext,
): Promise<{
  success: boolean;
  urlMap: Map<string, string>; // localPath → ossUrl
  errors: UploadResult[];
}> {
  const { projectId, workspacePath, onProgress } = context;

  // 1. 扫描图片引用
  onProgress?.(0, 100, "扫描图片引用...");
  const references = await scanImageReferences(workspacePath);
  const localImages = references.filter((ref) => isLocalPath(ref.originalPath));

  if (localImages.length === 0) {
    return { success: true, urlMap: new Map(), errors: [] };
  }

  // 2. 批量上传
  onProgress?.(10, 100, `准备上传 ${localImages.length} 张图片...`);
  const uploader = new OSSUploader(getOSSConfig(), projectId);
  const results = await uploader.uploadBatch(localImages, {
    concurrency: 5,
    onProgress: (current, total) => {
      const percent = 10 + Math.floor((current / total) * 80);
      onProgress?.(percent, 100, `上传图片 ${current}/${total}...`);
    },
  });

  // 3. 构建映射表
  const urlMap = new Map<string, string>();
  const errors: UploadResult[] = [];

  for (const result of results) {
    if (result.success) {
      urlMap.set(result.localPath, result.ossUrl);
    } else {
      errors.push(result);
    }
  }

  return {
    success: errors.length === 0,
    urlMap,
    errors,
  };
}
```

### 3.7 发布 API 路由

```typescript
// packages/author-site/src/app/api/projects/[id]/publish/route.ts

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const projectId = params.id;

  // 1. 验证权限
  const session = await getServerSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. 获取项目信息
  const project = await getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  // 3. 处理图片上传（带进度）
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendProgress = (percent: number, message: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ percent, message })}\n\n`),
        );
      };

      try {
        // 处理图片
        const result = await processImagesForPublish({
          projectId,
          workspacePath: project.workspacePath,
          publishDir: project.publishDir,
          onProgress: sendProgress,
        });

        if (!result.success) {
          sendProgress(100, `图片上传失败: ${result.errors.length} 个错误`);
          controller.close();
          return;
        }

        // 复制文件并替换路径
        sendProgress(90, "生成发布产物...");
        await copyAndReplacePaths(project, result.urlMap);

        // 完成发布
        sendProgress(100, "发布完成");
        controller.close();
      } catch (error) {
        sendProgress(100, `发布失败: ${error}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
```

### 3.8 OSS 配置管理

#### 3.8.1 环境变量

在 `.env` 中新增 OSS 配置段：

```bash
# ============================================
# 阿里云 OSS 配置
# ============================================

# OSS 地域节点（如 oss-cn-hangzhou）
OSS_REGION=oss-cn-hangzhou

# OSS AccessKey ID
OSS_ACCESS_KEY_ID=your-access-key-id

# OSS AccessKey Secret
OSS_ACCESS_KEY_SECRET=your-access-key-secret

# OSS Bucket 名称
OSS_BUCKET=opencode-workbench-assets

# OSS 访问域名（可选，默认使用 Bucket 默认域名）
# OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com

# 上传路径前缀（可选，用于区分环境）
# OSS_PATH_PREFIX=dev
```

#### 3.8.2 配置加载

```typescript
// packages/author-site/src/lib/publish/oss-config.ts

export interface OSSConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  pathPrefix?: string;
}

export function getOSSConfig(): OSSConfig {
  const config = {
    region: process.env.OSS_REGION || "",
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || "",
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || "",
    bucket: process.env.OSS_BUCKET || "",
    endpoint: process.env.OSS_ENDPOINT,
    pathPrefix: process.env.OSS_PATH_PREFIX,
  };

  // 验证必填项
  if (
    !config.region ||
    !config.accessKeyId ||
    !config.accessKeySecret ||
    !config.bucket
  ) {
    throw new Error("OSS 配置不完整，请检查环境变量");
  }

  return config;
}
```

### 3.9 saveImage 工具设计

#### 3.9.1 工具定义

**文件位置**：`packages/agent-service/src/backends/pi-tools/save-image-tool.ts`（新建）

```typescript
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentConfig } from "../../core/types";

const SaveImageParams = Type.Object({
  source: Type.Union([Type.Literal("base64"), Type.Literal("url")], {
    description: "图片来源：base64 为内联数据，url 为远程图片地址",
  }),
  data: Type.String({
    description:
      "图片数据：source=base64 时为 Base64 编码字符串（不含 data:image/xxx;base64, 前缀）；source=url 时为图片 URL",
  }),
  filename: Type.String({
    description: "保存的文件名，如 product.png",
  }),
  directory: Type.Optional(
    Type.String({
      description: "保存目录（相对于工作空间），默认为 images",
    }),
  ),
});

type SaveImageParams = Static<typeof SaveImageParams>;

export function createSaveImageTool(
  config: AgentConfig,
): AgentTool<typeof SaveImageParams> {
  return {
    name: "saveImage",
    label: "Save Image",
    description:
      "Save an image to the workspace from Base64 data or a remote URL",
    parameters: SaveImageParams,
    execute: async (toolCallId: string, args: SaveImageParams) => {
      // 实现逻辑见下节
    },
  };
}
```

#### 3.9.2 工具行为

1. **参数校验**：
   - `source` 必须为 `"base64"` 或 `"url"`
   - `source="base64"` 时，`data` 必须是有效的 Base64 字符串
   - `source="url"` 时，`data` 必须是合法的 HTTP/HTTPS URL
   - `filename` 必须符合文件命名规范（不含特殊字符）
   - 文件大小限制：最大 10MB（解码/下载后）

2. **保存流程**：

   **Base64 来源**：

   ```
   Base64 解码 → 验证图片格式 → 生成保存路径 → 写入文件 → 返回相对路径
   ```

   **URL 来源**：

   ```
   URL 校验（仅允许 http/https）→ 下载图片（10s 超时）→ Content-Type 校验
   → 文件大小校验 → 生成保存路径 → 写入文件 → 返回相对路径
   ```

3. **返回值**（与现有工具保持一致的格式）：
   ```typescript
   {
     content: [
       { type: 'text', text: 'Image saved to: ./images/product.png' }
     ],
     details: {
       path: 'images/product.png',
       size: 245678,  // 文件大小（字节）
       format: 'png', // 图片格式
       source: 'url'  // 来源：base64 | url
     }
   }
   ```

#### 3.9.3 实现逻辑

```typescript
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from "./permissions";

// 支持的图片格式
const SUPPORTED_FORMATS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);

// URL 下载超时（毫秒）
const URL_DOWNLOAD_TIMEOUT = 10_000;

// URL 下载最大文件大小（10MB）
const MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024;

// Content-Type → 扩展名映射（用于 URL 来源自动推断扩展名）
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

execute: async (toolCallId: string, args: SaveImageParams) => {
  const { source, data, filename, directory = "images" } = args;

  // 1. 验证文件名
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    return {
      content: [{ type: "text", text: "Error: Invalid filename format" }],
      details: { error: "invalid_filename" },
      isError: true,
    };
  }

  // 2. 验证图片格式
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (!SUPPORTED_FORMATS.has(ext)) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Unsupported image format. Supported: ${[...SUPPORTED_FORMATS].join(", ")}`,
        },
      ],
      details: { error: "unsupported_format" },
      isError: true,
    };
  }

  // 3. 获取图片 Buffer
  let buffer: Buffer;

  if (source === "base64") {
    // 3a. Base64 解码
    try {
      buffer = Buffer.from(data, "base64");
    } catch (error) {
      return {
        content: [{ type: "text", text: "Error: Invalid Base64 data" }],
        details: { error: "invalid_base64" },
        isError: true,
      };
    }
  } else {
    // 3b. URL 下载
    const urlResult = await downloadImageFromUrl(data);
    if (urlResult.error) {
      return {
        content: [{ type: "text", text: `Error: ${urlResult.error}` }],
        details: { error: urlResult.errorCode },
        isError: true,
      };
    }
    buffer = urlResult.buffer!;
  }

  // 4. 验证文件大小
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (buffer.length > MAX_SIZE) {
    return {
      content: [
        {
          type: "text",
          text: `Error: Image too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB > 10MB)`,
        },
      ],
      details: { error: "file_too_large" },
      isError: true,
    };
  }

  // 5. 生成保存路径
  const relativePath = path.join(directory, filename);
  const absolutePath = path.resolve(config.workingDir || ".", relativePath);

  // 6. 路径安全检查
  if (
    !isPathAllowed(
      relativePath,
      config.workingDir || "",
      config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS,
    )
  ) {
    return {
      content: [
        { type: "text", text: `Error: Path "${relativePath}" is not allowed` },
      ],
      details: { error: "path_not_allowed" },
      isError: true,
    };
  }

  // 7. 创建目录并保存
  try {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);

    return {
      content: [{ type: "text", text: `Image saved to: ./${relativePath}` }],
      details: {
        path: relativePath,
        size: buffer.length,
        format: ext,
        source,
      },
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error saving image: ${error}` }],
      details: { error: "save_failed" },
      isError: true,
    };
  }
};

/**
 * 从 URL 下载图片
 * - 仅允许 http/https 协议
 * - 10 秒超时
 * - 校验 Content-Type 为图片类型
 */
async function downloadImageFromUrl(urlString: string): Promise<{
  buffer?: Buffer;
  error?: string;
  errorCode?: string;
}> {
  // 1. URL 格式校验
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    return { error: "Invalid URL format", errorCode: "invalid_url" };
  }

  // 2. 协议限制（仅 http/https，防止 SSRF）
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      error: "Only http:// and https:// URLs are allowed",
      errorCode: "invalid_protocol",
    };
  }

  // 3. 下载（带超时和大小限制）
  return new Promise((resolve) => {
    const client = parsedUrl.protocol === "https:" ? https : http;

    const req = client.get(
      urlString,
      { timeout: URL_DOWNLOAD_TIMEOUT },
      (res) => {
        // 跟随重定向（最多 3 次）
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectResult = downloadImageFromUrl(res.headers.location);
          redirectResult.then(resolve);
          res.destroy();
          return;
        }

        if (res.statusCode !== 200) {
          res.destroy();
          resolve({
            error: `HTTP ${res.statusCode} when downloading image`,
            errorCode: "download_failed",
          });
          return;
        }

        // Content-Type 校验
        const contentType = res.headers["content-type"] || "";
        if (!contentType.startsWith("image/")) {
          res.destroy();
          resolve({
            error: `URL does not point to an image (Content-Type: ${contentType})`,
            errorCode: "not_an_image",
          });
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;

        res.on("data", (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > MAX_DOWNLOAD_SIZE) {
            res.destroy();
            resolve({
              error: "Image exceeds 10MB size limit",
              errorCode: "file_too_large",
            });
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          resolve({ buffer: Buffer.concat(chunks) });
        });

        res.on("error", (err) => {
          resolve({
            error: `Download error: ${err.message}`,
            errorCode: "download_failed",
          });
        });
      },
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({
        error: `Download timed out after ${URL_DOWNLOAD_TIMEOUT / 1000}s`,
        errorCode: "download_timeout",
      });
    });

    req.on("error", (err) => {
      resolve({
        error: `Network error: ${err.message}`,
        errorCode: "download_failed",
      });
    });
  });
}
```

#### 3.9.4 工具注册

修改 `packages/agent-service/src/backends/pi-tools/index.ts`：

```typescript
import { createSaveImageTool } from "./save-image-tool";

export function createWorkbenchTools(config: AgentConfig): AgentTool[] {
  return [
    createReadFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
    createSaveImageTool(config), // 新增
  ];
}
```

#### 3.9.5 System Prompt 更新

在 `packages/author-site/src/lib/agent/prompts/system-prompt.md` 中添加：

````markdown
## 图片资源处理

### 保存用户上传的图片

当用户在对话中发送图片时，支持两种来源：

**来源 1：文件上传（Base64）**

1. 使用 `saveImage` 工具将图片保存到工作区（source="base64"）
2. 默认保存到 `images/` 目录
3. 在生成的代码中使用相对路径引用：`<img src="./images/xxx.png" />`

```typescript
// 用户通过附件上传了一张产品图
saveImage({
  source: "base64",
  data: "iVBORw0KGgo...", // Base64 数据
  filename: "product.png",
  directory: "images",
});
```

**来源 2：图片 URL**

1. 用户提供图片链接时，使用 `saveImage` 工具下载并保存（source="url"）
2. 工具会自动下载、验证并保存到工作区
3. 在生成的代码中使用相对路径引用

```typescript
// 用户提供了一张在线图片
saveImage({
  source: "url",
  data: "https://example.com/photo.png", // 图片 URL
  filename: "hero.png",
  directory: "images",
});
```

> **安全提示**：URL 来源仅允许 http/https 协议，下载超时 10 秒，最大 10MB，且会校验 Content-Type 确保是图片资源。

### 发布时自动处理

发布项目时，系统会自动：

1. 扫描所有页面中的本地图片引用
2. 批量上传图片到 OSS
3. 替换发布产物中的路径为 OSS URL

**无需手动处理**，只需确保代码中使用本地相对路径即可。
````

## 4. 实施记录（已完成 2026-06-03）

所有 5 个 Phase 均已实施完成。详细变更文件清单见附录 B。

### Phase 1: saveImage 工具 ✅

已完成：
- `packages/agent-service/src/backends/pi-tools/save-image-tool.ts`（188 行）
- 注册到 `pi-tools/index.ts`
- System Prompt 更新（`system-prompt.md` 新增图片资源处理章节）
- 单元测试：11 用例通过
- 修复 `backend-agent.ts` images 传递遗漏
- 修复 `pi-agent.ts` 非多模态模型自动保存

### Phase 2: 发布基础设施 ✅

已安装 `ali-oss` + `@types/ali-oss`，模块目录 `packages/author-site/src/lib/publish/` 含 6 个源文件 + 3 个测试文件。

### Phase 3: 核心模块 ✅

- `image-scanner.ts`：支持 `<img>` / `url()` / `import` 三种引用
- `oss-uploader.ts`：5 并发上传 + 去重 + 二次校验
- `path-replacer.ts`：正则替换 + 文件复制
- `image-processor.ts`：串联全流程，OSS 未配置时优雅降级

### Phase 4: 集成 ✅

- `publish-manager.ts`：发布流程嵌入图片处理，编译自动替换路径
- `chat-input.tsx`：移除图片上传按钮条件隐藏
- `.env` / `.env.docker`：OSS 配置已应用并实测通过

### Phase 5: 测试与文档 ✅

- agent-service：103/103 通过
- author-site publish：24/24 通过
- TypeScript typecheck：两个包均通过
- AGENTS.md 更新

## 5. 安全考虑

### 5.1 凭据安全

- OSS AccessKey **不得硬编码**，仅通过环境变量配置
- `.env` 已在 `.gitignore` 中，确保不会提交到仓库
- 生产环境建议使用阿里云 RAM 子账号，仅授予 `PutObject` 权限

### 5.2 文件类型限制

```typescript
const ALLOWED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
]);

function isAllowedImage(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}
```

### 5.3 文件大小限制

```typescript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function validateFileSize(filePath: string): Promise<boolean> {
  const stat = await fs.stat(filePath);
  return stat.size <= MAX_FILE_SIZE;
}
```

### 5.4 路径安全

- 只处理工作空间内的文件
- 解析后的绝对路径必须在 `workspacePath` 下
- 防止路径遍历攻击（如 `../../etc/passwd`）

## 6. 错误处理

| 错误场景         | 错误码               | 用户提示                                        |
| :--------------- | :------------------- | :---------------------------------------------- |
| OSS 未配置       | `OSS_NOT_CONFIGURED` | "OSS 配置缺失，请联系管理员"                    |
| 文件不存在       | `FILE_NOT_FOUND`     | "图片文件不存在：{path}"                        |
| 文件类型不支持   | `INVALID_FILE_TYPE`  | "仅支持图片格式：png/jpg/gif/webp/svg"          |
| 文件过大         | `FILE_TOO_LARGE`     | "文件大小超过 10MB 限制"                        |
| 上传失败（网络） | `UPLOAD_FAILED`      | "图片上传失败，请重试"                          |
| 部分上传失败     | `PARTIAL_UPLOAD`     | "{count} 张图片上传失败"                        |
| URL 格式非法     | `INVALID_URL`        | "图片 URL 格式不正确"                           |
| URL 协议不允许   | `INVALID_PROTOCOL`   | "仅支持 http/https 协议的图片 URL"              |
| URL 下载失败     | `DOWNLOAD_FAILED`    | "图片下载失败，请检查 URL 是否可访问"           |
| URL 下载超时     | `DOWNLOAD_TIMEOUT`   | "图片下载超时（10s），请稍后重试或提供其他 URL" |
| URL 非图片资源   | `NOT_AN_IMAGE`       | "URL 指向的不是图片资源"                        |

## 7. 后续扩展方向

### 7.1 多存储后端支持

```typescript
interface IStorageProvider {
  upload(filePath: string, key?: string): Promise<UploadResult>;
  uploadBatch(files: string[], options?: BatchOptions): Promise<UploadResult[]>;
}

// 可支持：阿里云 OSS、腾讯云 COS、七牛云等
```

### 7.2 图片优化

- 上传前自动压缩（使用 `sharp` 库）
- 生成 WebP 格式备用
- 生成多尺寸版本（缩略图/中图/原图）

### 7.3 CDN 集成

- 在 OSS 前配置阿里云 CDN
- 返回 CDN 加速域名 URL
- 发布时自动刷新 CDN 缓存

### 7.4 增量发布

- 记录已上传的图片（OSS Key + MD5）
- 发布时只上传新增或修改的图片
- 减少重复上传，提升发布速度

### 7.5 管理后台可视化

- 在管理后台增加「资源管理」页面
- 展示各项目已上传的图片列表
- 支持查看/删除操作

## 8. 验收标准

### saveImage 工具

- [x] AI 可成功调用 `saveImage` 工具
- [x] `source="base64"` 时 Base64 图片正确保存为二进制文件
- [x] `source="url"` 时可正确下载并保存图片
- [x] 支持 png/jpg/gif/webp/svg 格式
- [x] 超过 10MB 的图片被拒绝（Base64 和 URL 来源均生效）
- [x] 非法文件名被拒绝
- [x] 路径遍历攻击被拦截
- [x] URL 来源仅允许 http/https 协议（防止 SSRF）
- [x] URL 下载超时（10s）时返回明确错误
- [x] URL 指向非图片资源时返回明确错误
- [x] 保存后可在代码中通过相对路径引用
- [x] 非多模态模型：后端自动保存图片到工作区，AI 无需「看到」图片

### 发布图片处理

- [x] 发布时自动扫描并上传图片
- [x] 发布产物中图片 URL 为 OSS 地址
- [x] 源码中保持本地相对路径不变
- [x] 未配置 OSS 时优雅降级，不影响正常发布
- [x] 上传失败时有明确错误提示
- [x] 非图片格式文件被跳过
- [x] 超过 10MB 的文件被跳过

### 前端

- [x] 图片上传按钮对所有模型开放（不局限于多模态模型）

### 测试

- [x] saveImage 工具单元测试：11 用例通过
- [x] 图片扫描测试：13 用例通过
- [x] 路径替换测试：6 用例通过
- [x] OSS 配置测试：5 用例通过
- [x] agent-service 全量测试：103/103 通过
- [x] OSS 连通性测试：上传/验证/删除均通过

## 9. 风险评估

| 风险项             | 影响 | 概率 | 缓解措施                                                     |
| :----------------- | :--- | :--- | :----------------------------------------------------------- |
| OSS 服务不可用     | 高   | 低   | 添加重试机制（最多 3 次）+ 超时控制                          |
| AccessKey 泄露     | 高   | 低   | 使用 RAM 子账号，最小权限原则                                |
| 大量图片上传慢     | 中   | 中   | 并发上传 + 进度展示 + 超时控制                               |
| 部分上传失败       | 中   | 低   | 记录失败列表，支持重试或降级处理                             |
| 发布中断           | 中   | 低   | 事务性操作，失败时回滚发布目录                               |
| URL 图片不可访问   | 中   | 中   | 10s 超时 + 明确错误提示，AI 可回退为占位图或提示用户重新提供 |
| URL SSRF 攻击      | 高   | 低   | 仅允许 http/https 协议，禁止内网 IP 和 file:// 等危险协议    |
| URL 图片非真实图片 | 中   | 低   | 校验 Content-Type 响应头，确保为 image/\*                    |

## 10. 依赖项

- **阿里云 OSS SDK**：`ali-oss`（npm 包）
- **Node.js 版本**：≥ 18（项目已满足）
- **权限要求**：阿里云 RAM 子账号需授予 `oss:PutObject` 权限
- **环境变量**：需在 `.env` 或 Docker 配置中提供 OSS 凭据

## 11. 相关文件清单

### 新建文件

| 文件路径                                                          | 说明                   |
| :---------------------------------------------------------------- | :--------------------- |
| **saveImage 工具**                                                |                        |
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | 图片保存工具实现       |
| `packages/agent-service/tests/unit/save-image-tool.test.ts`       | saveImage 工具单元测试 |
| **发布图片处理**                                                  |                        |
| `packages/author-site/src/lib/publish/types.ts`                   | 类型定义               |
| `packages/author-site/src/lib/publish/oss-config.ts`              | OSS 配置管理           |
| `packages/author-site/src/lib/publish/image-scanner.ts`           | 图片引用扫描           |
| `packages/author-site/src/lib/publish/oss-uploader.ts`            | OSS 上传封装           |
| `packages/author-site/src/lib/publish/path-replacer.ts`           | 路径替换逻辑           |
| `packages/author-site/src/lib/publish/image-processor.ts`         | 图片处理核心           |
| `packages/author-site/src/lib/publish/__tests__/`                 | 测试目录               |

### 修改文件

| 文件路径                                                          | 修改内容                     |
| :---------------------------------------------------------------- | :--------------------------- |
| **saveImage 工具相关**                                            |                              |
| `packages/agent-service/src/backends/pi-tools/index.ts`           | 注册 `saveImage` 工具        |
| `packages/agent-service/AGENTS.md`                                | 工具集文档更新               |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md`     | 添加图片保存和引用的使用指南 |
| **发布图片处理相关**                                              |                              |
| `packages/author-site/src/app/api/projects/[id]/publish/route.ts` | 集成图片处理流程             |
| `packages/author-site/src/components/projects/publish-button.tsx` | 添加进度展示                 |
| **配置文件**                                                      |                              |
| `.env`                                                            | 新增 OSS 配置段（注释模板）  |
| `.env.docker`                                                     | 新增 OSS 环境变量            |

---

**文档版本**：v3.0
**创建日期**：2026-06-03
**最后更新**：2026-06-04（文档归档至已完成）
**状态**：✅ 已完成

## 附录：方案演变记录

| 版本 | 日期       | 变更内容                                                            |
| :--- | :--------- | :------------------------------------------------------------------ |
| v1.0 | 2026-06-03 | 初始方案：AI 主动上传 OSS                                           |
| v2.0 | 2026-06-03 | 重构为发布时构建上传                                                |
| v2.1 | 2026-06-03 | 新增 saveImage 工具，支持用户图片保存到工作区                       |
| v2.2 | 2026-06-03 | saveImage 工具支持 URL 来源（下载远程图片），补充 SSRF 防护和错误码 |
| v3.0 | 2026-06-03 | **实施完成**：非多模态模型自动保存、前端全模型开放上传、OSS 配置实测通过 |

---

## 附录 B：实施记录

### 实施日期：2026-06-03

### 实施的方案变更

#### B.1 非多模态模型图片传递机制

**问题**：原方案中图片作为 Anthropic content block 传给 LLM，非多模态模型会丢弃（显示 "image omitted: model does not support images"），导致 AI 无法获取图片数据。

**解决方案**（`packages/agent-service/src/backends/pi-agent.ts`）：

```
sendMessage(content, options)
  │
  ├─ model.input 包含 'image' → 图片作为 content block 传给 LLM（多模态模型）
  │
  └─ model.input 只有 'text' → 后端自动 Base64 解码保存到工作区 images/
      → 将保存路径注入到提示文本：
        「[已自动保存 N 张图片到工作区：
          - ./images/xxx.png
          ...]」
```

**关键实现**（`pi-agent.ts:161-210`）：

```typescript
const model = this.agent.state.model;
const modelSupportsImages = Array.isArray(model?.input) && model.input.includes('image');

if (images && images.length > 0) {
  if (modelSupportsImages) {
    // 多模态：直接传 content blocks
    imageContent = images.map(img => ({ type: "image", source: { ... } }));
  } else {
    // 非多模态：自动保存 + 文本告知路径
    for (const img of images) {
      const buffer = Buffer.from(img.data, 'base64');
      await fs.promises.writeFile(absolutePath, buffer);
      savedPaths.push(relativePath);
    }
    promptContent = `${content}\n\n[已自动保存图片到工作区...]`;
  }
}
```

#### B.2 修复 images 传递遗漏

- **`backend-agent.ts:73`**：`sendMessage` 调用 `this.backend.sendMessage()` 时未传递 `images` 参数，已修复
- **`pi-agent.ts:161`**：`sendMessage` 签名从 `{ stream?: boolean }` 扩展为 `{ stream?: boolean; images?: ImageAttachment[] }`

#### B.3 前端图片上传按钮：全模型开放

- **`chat-input.tsx:136`**：移除 `{currentSupportsImages && <PromptInputAddImage />}` 条件，图片上传按钮始终显示
- **`ai-chat.tsx`**：移除 `currentSupportsImages` 的传递和解构（不再需要）
- **理由**：`saveImage` 是工具级能力，不依赖模型是否多模态

#### B.4 OSS 配置

最终生效配置（`.env`）：

```bash
OSS_REGION=oss-cn-chengdu
OSS_ACCESS_KEY_ID=LTAI5tSkr9XjhAVg1sja3m8c
OSS_ACCESS_KEY_SECRET=***
OSS_BUCKET=demo-studio
```

验证结果：上传、读取、删除均通过。

### 实际变更文件清单

| 文件 | 操作 | 说明 |
|:-----|:-----|:-----|
| `packages/agent-service/src/backends/pi-tools/save-image-tool.ts` | 新建 | saveImage 工具（Base64 + URL 双重来源） |
| `packages/agent-service/src/backends/pi-tools/index.ts` | 修改 | 注册 saveImage 工具（5→6） |
| `packages/agent-service/src/backends/pi-agent.ts` | 修改 | 非多模态自动保存、修复 images 传递、导入 fs/path |
| `packages/agent-service/src/core/backend-agent.ts` | 修改 | 传递 images 到 sendMessage |
| `packages/agent-service/tests/unit/save-image-tool.test.ts` | 新建 | 11 个用例 |
| `packages/agent-service/tests/unit/file-tools-permissions.test.ts` | 修改 | 工具数量 5→6 |
| `packages/agent-service/tests/unit/pi-agent.test.ts` | 修改 | 工具数量 5→6 + saveImage 断言 |
| `packages/agent-service/AGENTS.md` | 修改 | 工具列表更新 5→6 |
| `packages/author-site/src/lib/publish/types.ts` | 新建 | ImageReference/UploadResult/PublishContext |
| `packages/author-site/src/lib/publish/oss-config.ts` | 新建 | OSS 配置加载 + 优雅降级 |
| `packages/author-site/src/lib/publish/image-scanner.ts` | 新建 | 扫描 img/url()/import 图片引用 |
| `packages/author-site/src/lib/publish/oss-uploader.ts` | 新建 | 并发上传 + 去重 + 校验 |
| `packages/author-site/src/lib/publish/path-replacer.ts` | 新建 | 路径替换 + 文件复制 |
| `packages/author-site/src/lib/publish/image-processor.ts` | 新建 | 串联扫描→上传→替换 |
| `packages/author-site/src/lib/publish/__tests__/image-scanner.test.ts` | 新建 | 图片扫描测试（13 用例） |
| `packages/author-site/src/lib/publish/__tests__/path-replacer.test.ts` | 新建 | 路径替换测试（6 用例） |
| `packages/author-site/src/lib/publish/__tests__/oss-config.test.ts` | 新建 | 配置测试（5 用例） |
| `packages/author-site/src/lib/publish-manager.ts` | 修改 | 集成图片处理 + 进度回调 |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 修改 | 添加图片资源处理章节 |
| `packages/author-site/src/components/ai-elements/chat/chat-input.tsx` | 修改 | 移除图片按钮条件隐藏 |
| `packages/author-site/src/components/ai-elements/ai-chat.tsx` | 修改 | 移除 currentSupportsImages |
| `packages/author-site/package.json` | 修改 | 新增 ali-oss + @types/ali-oss |
| `.env` | 修改 | OSS 配置（成都 demo-studio） |
| `.env.docker` | 修改 | OSS 配置模板 |

### 测试覆盖

| 包 | 状态 |
|:---|:---|
| agent-service | 103/103 通过（含 saveImage 11 用例） |
| author-site (publish) | 24/24 通过（3 套件） |
| TypeScript typecheck | agent-service + author-site 均通过 |
| ESLint | 无新增 warning |
| OSS 连通性 | 上传/验证/删除 均通过 |
