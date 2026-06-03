# Agent 集成阿里云 OSS 图片上传能力方案

## 1. 背景

### 1.1 现状

当前创作端的 AI Agent 具备以下工具能力：

- `readFile` / `writeFile` / `listFiles`：工作空间内文件读写
- `bash`：受限 Shell 命令（白名单 11 个）
- `schemaValidate`：配置文件格式校验

当 AI 需要在生成的页面中使用图片资源时，面临以下问题：

- **无外部资源上传能力**：Agent 只能读写本地工作空间文件，无法将图片上传至云存储
- **图片引用局限**：生成的 HTML/CSS 中只能使用本地相对路径或占位图服务（如 `https://placehold.co`）
- **项目发布后图片丢失**：本地工作空间的图片资源在快照浏览或项目发布后无法被外部访问

### 1.2 需求场景

- AI 生成包含产品展示图的电商页面
- AI 生成带背景图的 Landing Page
- AI 需要将用户上传的参考图片嵌入到生成的页面中
- 项目发布后，图片资源需持久可访问

## 2. 目标

### 2.1 核心目标

为 Agent 新增 `uploadToOSS` 工具，使其能够：

1. 将工作空间内的图片文件上传至阿里云 OSS
2. 返回可公开访问的图片 URL
3. AI 在生成代码时自动使用该 URL 插入 `<img>` 标签或 CSS `background-image`

### 2.2 非目标

- 不支持视频/音频等其他媒体类型上传（本期仅图片）
- 不提供 OSS 文件管理界面（删除/列举等由 OSS 控制台完成）
- 不修改现有工具权限模型

## 3. 方案设计

### 3.1 架构概览

```
┌─────────────────────┐      uploadToOSS      ┌─────────────────┐
│   Agent (Pi Core)   │ ───────────────────► │  agent-service   │
│                     │                       │  (Fastify)       │
└─────────────────────┘                       └────────┬─────────┘
                                                       │
                                            ┌──────────▼──────────┐
                                            │   阿里云 OSS SDK     │
                                            │   (ali-oss)         │
                                            └──────────┬──────────┘
                                                       │
                                            ┌──────────▼──────────┐
                                            │  OSS Bucket         │
                                            │  (图片资源存储)      │
                                            └─────────────────────┘
```

### 3.2 新增 OSS 工具

#### 3.2.1 工具定义

**文件位置**：`packages/agent-service/src/backends/pi-tools/oss-tool.ts`（新建）

```typescript
const UploadToOSSParams = Type.Object({
  localPath: Type.String({
    description: "工作空间内图片文件的相对路径，如 images/logo.png",
  }),
  ossKey: Type.Optional(
    Type.String({
      description: "OSS 对象键（可选，默认使用项目ID+时间戳自动生成）",
    }),
  ),
});
```

#### 3.2.2 工具行为

1. **参数校验**：
   - `localPath` 必须指向工作空间内存在的文件
   - 仅允许图片格式：`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`
   - 文件大小限制：最大 10MB

2. **路径安全**：
   - 复用现有 `isPathAllowed()` 权限校验
   - 禁止读取工作空间外文件

3. **上传流程**：

   ```
   读取本地文件 → 生成 OSS Key → 调用 OSS SDK.put() → 返回签名 URL
   ```

4. **返回值**（与现有工具保持一致的格式）：
   ```typescript
   {
     content: [
       { type: 'text', text: 'Successfully uploaded to OSS: https://bucket-name.oss-cn-hangzhou.aliyuncs.com/projects/proj_123/images/logo-1717401234.png' }
     ],
     details: {
       url: 'https://bucket-name.oss-cn-hangzhou.aliyuncs.com/projects/proj_123/images/logo-1717401234.png',
       ossKey: 'projects/proj_123/images/logo-1717401234.png',
       size: 245678,  // 文件大小（字节）
       localPath: 'images/logo.png'
     }
   }
   ```

### 3.3 OSS 配置管理

#### 3.3.1 环境变量

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

#### 3.3.2 配置加载

在 `packages/agent-service/src/utils/config.ts` 中扩展 `ServiceConfig` 类型：

```typescript
export interface OSSConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  pathPrefix?: string;
}

export interface ServiceConfig {
  // ... 现有字段
  oss: OSSConfig;
}
```

### 3.4 OSS Key 生成策略

为避免文件名冲突，采用以下策略：

```typescript
function generateOSSKey(
  workingDir: string,
  localPath: string,
  customKey?: string,
): string {
  if (customKey) return customKey;

  // 从 workingDir 中解析 projectId（如 "/data/workspaces/.../proj_123/ws-xxx" -> "proj_123"）
  const projectIdMatch = workingDir.match(/proj_\d+/);
  const projectId = projectIdMatch ? projectIdMatch[0] : "unknown";

  const timestamp = Date.now();
  const ext = path.extname(localPath);
  const baseName = path.basename(localPath, ext);
  const hash = crypto
    .createHash("md5")
    .update(`${localPath}${timestamp}`)
    .digest("hex")
    .slice(0, 8);

  return `projects/${projectId}/images/${baseName}-${hash}${ext}`;
}
```

**命名规则**：`projects/{projectId}/images/{原文件名}-{8位哈希}{扩展名}`

**projectId 来源**：从 `AgentConfig.workingDir` 路径中解析，工作空间路径格式为 `.../proj_{timestamp}/ws-xxx/`

### 3.5 工具注册

修改 `packages/agent-service/src/backends/pi-tools/index.ts`：

```typescript
import { createUploadToOSSTool } from "./oss-tool";

export function createWorkbenchTools(config: AgentConfig): AgentTool[] {
  return [
    createReadFileTool(config),
    createWriteFileTool(config),
    createListFilesTool(config),
    createBashTool(config),
    createSchemaValidateTool(config),
    createUploadToOSSTool(config), // 新增
  ];
}
```

**`beforeToolCall` 拦截**：在 `packages/agent-service/src/backends/pi-agent.ts` 中新增 `uploadToOSS` 的路径校验：

```typescript
beforeToolCall: async (context: any) => {
  const toolName = context.toolCall.name;
  if (toolName === 'readFile' || toolName === 'writeFile' || toolName === 'listFiles' || toolName === 'uploadToOSS') {
    const args = context.args as { path?: string; localPath?: string };
    const targetPath = args.path || args.localPath;
    if (targetPath && !isPathAllowed(targetPath, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
      return { block: true, reason: `Access denied: path "${targetPath}" is not allowed by workspace permissions` };
    }
  }
  return undefined;
},
```

### 3.6 System Prompt 更新

在 `packages/author-site/src/lib/agent/prompts/system-prompt.md` 中补充 OSS 工具使用说明：

````markdown
## 图片资源处理

当需要在页面中使用图片时：

1. 优先使用 `uploadToOSS` 工具将本地图片上传至云存储
2. 使用返回的 URL 插入 `<img src="...">` 或 CSS `background-image: url(...)`
3. 不要使用占位图服务（如 placehold.co），除非用户明确要求

示例：

```typescript
// 上传后的图片 URL
const imageUrl = 'https://bucket.oss-cn-hangzhou.aliyuncs.com/projects/proj_xxx/images/logo-abc12345.png';

// 在组件中使用
<img src={imageUrl} alt="Logo" />
```
````

````

## 4. 实现步骤

### Phase 1: 基础设施（预计 2 小时）

1. **安装依赖**
   ```bash
   pnpm add ali-oss --filter @opencode-workbench/agent-service
   ```

2. **配置扩展**
   - 修改 `src/utils/config.ts`，新增 `OSSConfig` 类型和加载逻辑
   - 在 `.env` 模板中添加 OSS 配置注释段

3. **创建 OSS 客户端单例**
   - 新建 `src/utils/oss-client.ts`
   - 实现惰性初始化（首次调用时才实例化）
   - 添加连接测试逻辑

### Phase 2: 工具实现（预计 3 小时）

4. **实现 `uploadToOSSTool`**
   - 新建 `src/backends/pi-tools/oss-tool.ts`
   - 实现参数校验、文件读取、OSS 上传、URL 返回
   - 添加错误处理（网络超时、权限不足、文件过大等）

5. **注册工具**
   - 修改 `src/backends/pi-tools/index.ts`
   - 在工具数组中注册 `createUploadToOSSTool`

### Phase 3: 提示词与测试（预计 2 小时）

6. **更新系统提示词**
   - 在 `packages/author-site/src/lib/agent/prompts/system-prompt.md` 中添加 OSS 工具使用指南
   - 提供代码示例和最佳实践

7. **编写单元测试**
   - 测试参数校验逻辑（非法路径、非图片格式、超大文件）
   - Mock OSS SDK 测试上传流程
   - 测试路径权限拦截

8. **编写集成测试**
   - 使用测试 Bucket 验证完整上传流程
   - 验证返回 URL 可访问性

### Phase 4: 文档与验证（预计 1 小时）

9. **更新 AGENTS.md**
   - 在 Pi Agent 工具集表格中新增 `uploadToOSS`
   - 补充环境变量配置说明

10. **端到端验证**
    - 启动 `pnpm dev`
    - 在创作端对话中要求 AI 上传图片并生成带图片的页面
    - 验证上传成功、URL 可用、页面正常渲染

## 5. 安全考虑

### 5.1 凭据安全

- OSS AccessKey **不得硬编码**，仅通过环境变量或管理后台配置
- `.env` 已在 `.gitignore` 中，确保不会提交到仓库
- 生产环境建议使用阿里云 RAM 子账号，仅授予 `PutObject` 权限

### 5.2 文件类型限制

严格限制上传文件类型，防止恶意文件上传：

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

if (fileSize > MAX_FILE_SIZE) {
  return {
    success: false,
    error: `文件大小超过限制（${MAX_FILE_SIZE / 1024 / 1024}MB）`,
  };
}
```

### 5.4 路径遍历防护

复用现有 `isPathAllowed()` 函数，确保：

- 无法读取工作空间外文件（如 `../../etc/passwd`）
- 无法覆盖系统关键文件

## 6. 错误处理

| 错误场景         | 错误码               | 用户提示                               |
| :--------------- | :------------------- | :------------------------------------- |
| OSS 未配置       | `OSS_NOT_CONFIGURED` | "OSS 配置缺失，请联系管理员"           |
| 文件不存在       | `FILE_NOT_FOUND`     | "文件不存在：{path}"                   |
| 文件类型不支持   | `INVALID_FILE_TYPE`  | "仅支持图片格式：png/jpg/gif/webp/svg" |
| 文件过大         | `FILE_TOO_LARGE`     | "文件大小超过 10MB 限制"               |
| 上传失败（网络） | `UPLOAD_FAILED`      | "上传失败，请重试"                     |
| 权限不足         | `PATH_NOT_ALLOWED`   | "无权访问该路径"                       |

## 7. 后续扩展方向

### 7.1 多存储后端支持

未来可抽象存储接口，支持其他云存储：

```typescript
interface IStorageProvider {
  upload(localPath: string, key?: string): Promise<UploadResult>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
```

### 7.2 图片优化

- 上传后自动压缩（使用 `sharp` 库）
- 生成 WebP 格式备用
- 返回多尺寸 URL（缩略图/中图/原图）

### 7.3 CDN 集成

- 在 OSS 前配置阿里云 CDN
- 返回 CDN 加速域名 URL
- 支持 CDN 缓存刷新

### 7.4 管理后台可视化

- 在管理后台增加「资源管理」页面
- 展示已上传的图片列表
- 支持删除/替换操作

## 8. 验收标准

- [ ] Agent 可成功调用 `uploadToOSS` 工具
- [ ] 上传后返回可公开访问的 HTTPS URL
- [ ] 在生成的页面中图片正常渲染
- [ ] 非图片格式上传被拒绝
- [ ] 超过 10MB 文件上传被拒绝
- [ ] 路径遍历攻击被拦截
- [ ] OSS 配置缺失时返回友好错误提示
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 集成测试通过（使用真实 OSS Bucket）

## 9. 风险评估

| 风险项               | 影响 | 概率 | 缓解措施                              |
| :------------------- | :--- | :--- | :------------------------------------ |
| OSS 服务不可用       | 高   | 低   | 添加重试机制（最多 3 次）             |
| AccessKey 泄露       | 高   | 低   | 使用 RAM 子账号，最小权限原则         |
| 恶意文件上传         | 中   | 中   | 严格文件类型校验 + 大小限制           |
| 上传失败导致 AI 中断 | 中   | 中   | 工具返回错误信息，AI 可降级使用占位图 |

## 10. 依赖项

- **阿里云 OSS SDK**：`ali-oss`（npm 包）
- **Node.js 版本**：≥ 18（项目已满足）
- **权限要求**：阿里云 RAM 子账号需授予 `oss:PutObject` 权限
- **环境变量**：需在 `.env` 或 Docker 配置中提供 OSS 凭据

## 11. 相关文件清单

### 新建文件

| 文件路径                                                      | 说明               |
| :------------------------------------------------------------ | :----------------- |
| `packages/agent-service/src/backends/pi-tools/oss-tool.ts`    | OSS 上传工具实现   |
| `packages/agent-service/src/utils/oss-client.ts`              | OSS 客户端单例管理 |
| `packages/agent-service/tests/unit/oss-tool.test.ts`          | 单元测试           |
| `packages/agent-service/tests/integration/oss-upload.test.ts` | 集成测试           |

### 修改文件

| 文件路径                                                       | 修改内容                        |
| :------------------------------------------------------------- | :------------------------------ |
| `packages/agent-service/src/backends/pi-tools/index.ts`        | 注册 `uploadToOSS` 工具         |
| `packages/agent-service/src/backends/pi-agent.ts`              | `beforeToolCall` 新增 `uploadToOSS` 路径拦截 |
| `packages/agent-service/src/utils/config.ts`                   | 新增 `OSSConfig` 类型和加载逻辑 |
| `packages/agent-service/AGENTS.md`                             | 工具集文档更新                  |
| `packages/author-site/src/lib/agent/prompts/system-prompt.md` | 补充 OSS 工具使用说明           |
| `.env`                                                         | 新增 OSS 配置段（注释模板）     |
| `.env.docker`                                                  | 新增 OSS 环境变量               |

---

**文档版本**：v1.1
**创建日期**：2026-06-03
**最后更新**：2026-06-03（方案审查修正）
**状态**：待评审
````
