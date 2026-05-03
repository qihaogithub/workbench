import path from "path";
import fs from "fs";
import {
  getWorkspacesDir,
  getWorkspaceDir,
  getProjectPath,
  projectExists,
  ensureWorkspaceFiles,
  findWorkspacePath,
  getWorkspaceMeta as getWorkspaceMetaFromFs,
  writeWorkspaceMeta,
  type WorkspaceMeta,
} from "./fs-utils";

export interface CreateWorkspaceResult {
  workspaceId: string;
  code: string;
  schema: string;
  workspacePath: string;
}

function injectOpencodeAgentConfig(workspacePath: string): void {
  const opencodeDir = path.join(workspacePath, ".opencode");
  const agentsDir = path.join(opencodeDir, "agents");

  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const opencodeJson = {
    $schema: "https://opencode.ai/config.json",
    agent: {
      "demo-generator": {
        file: ".opencode/agents/demo-generator.md",
        description: "专门用于生成 OpenCode Demo 文件的 AI 代理",
        tools: {
          write: true,
          edit: true,
          bash: false,
          fetch: false,
        },
      },
    },
    default_agent: "demo-generator",
    instructions: [".opencode/agents/demo-generator.md"],
  };

  fs.writeFileSync(
    path.join(opencodeDir, "opencode.json"),
    JSON.stringify(opencodeJson, null, 2),
    "utf-8",
  );

  const agentMd = `# Demo Generator Agent

你是 OpenCode Workbench 的 Demo 生成专家。你的职责是根据用户需求，修改和生成符合 OpenCode 标准的 Demo 文件。

## 核心规则

### 工作文件要求
在 Session 工作区中，你只能操作以下两个文件：

1. **\`index.tsx\`** - React 组件实现
2. **\`config.schema.json\`** - Demo 配置定义

### 代码质量标准

**index.tsx 要求**：
- 使用 TypeScript，定义完整的 Props 接口（\`interface DemoProps\`）
- 使用 Tailwind CSS 进行样式设计（不使用内联 style）
- 可使用 shadcn/ui 组件库
- 导出默认组件
- 代码完整可运行，包含必要的 import

**config.schema.json 要求**：
- 符合 JSON Schema draft 2020-12 规范
- 包含 \`title\`、\`type\`、\`properties\`、\`required\`
- 每个属性都有合理的 \`default\` 值
- properties 与组件 Props 一一对应

### 依赖使用规范

你的 Demo 组件运行在独立的 iframe 沙箱中，可以任意使用 npm 包，系统会自动从 CDN 加载。

- 可以 \`import\` 任何 npm 包（如 \`date-fns\`、\`framer-motion\`、\`lucide-react\` 等）
- 可以使用 CSS 导入（如 \`import 'some-lib/dist/style.css'\`），系统会自动处理
- 推荐优先使用 shadcn/ui 组件库保持风格一致

### 单文件组件约束

所有代码必须写在单一 \`index.tsx\` 文件中：

- 禁止 \`import './xxx'\` 形式的相对路径模块导入
- 如有复用逻辑，以内联函数形式实现
- 图片等资源使用绝对 URL 或 base64

### 禁止行为
- ❌ 修改 .session.json 或其他系统文件
- ❌ 创建除 index.tsx 和 config.schema.json 外的新文件
- ❌ 使用 \`import './xxx'\` 形式的相对路径导入
- ❌ 使用 \`as any\`、\`@ts-ignore\`、\`@ts-expect-error\`
- ❌ 留下 TODO 或占位符

## 工作流程

1. 理解用户需求（修改或创建）
2. 如需新配置：先更新 config.schema.json
3. 根据 Schema 更新 index.tsx 的 Props 和实现
4. 验证样式隔离规范已遵守
5. 验证两个文件的一致性

## 输出格式

修改完成后，直接写入文件，无需额外说明。

**自检清单**：
- [ ] 只修改了 index.tsx 和 config.schema.json
- [ ] Props 接口与 Schema properties 一一对应
- [ ] 所有代码在单一文件中，没有相对路径导入
- [ ] 没有使用不安全的类型转换
- [ ] 代码完整可运行
`;

  fs.writeFileSync(path.join(agentsDir, "demo-generator.md"), agentMd, "utf-8");
}

export function createWorkspace(
  userId: string,
  projectId: string,
): CreateWorkspaceResult {
  if (!projectExists(projectId)) {
    throw new Error(`Project "${projectId}" 不存在`);
  }

  const workspaceId = `ws-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const projectPath = getProjectPath(projectId);
  const projectWorkspacePath = path.join(projectPath, "workspace");
  const workspaceDir = getWorkspaceDir(userId, projectId);
  const workspacePath = path.join(workspaceDir, workspaceId);

  ensureWorkspaceFiles(projectWorkspacePath);

  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.cpSync(projectWorkspacePath, workspacePath, { recursive: true });

  const meta: WorkspaceMeta = {
    workspaceId,
    demoId: projectId,
    userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  fs.writeFileSync(
    path.join(workspacePath, ".workspace.json"),
    JSON.stringify(meta, null, 2),
    "utf-8",
  );

  injectOpencodeAgentConfig(workspacePath);

  const codePath = path.join(workspacePath, "index.tsx");
  const schemaPath = path.join(workspacePath, "config.schema.json");

  return {
    workspaceId,
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
    workspacePath,
  };
}

export function getWorkspace(workspaceId: string) {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return null;

  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (!meta) return null;

  const codePath = path.join(wsPath, "index.tsx");
  const schemaPath = path.join(wsPath, "config.schema.json");

  return {
    ...meta,
    code: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
    schema: fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf-8") : "",
    workspacePath: wsPath,
  };
}

export function deleteWorkspace(workspaceId: string): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.rmSync(wsPath, { recursive: true, force: true });
  return true;
}

export function listWorkspaces(userId: string, projectId: string): WorkspaceMeta[] {
  const workspaceDir = getWorkspaceDir(userId, projectId);
  if (!fs.existsSync(workspaceDir)) return [];

  const workspaces: WorkspaceMeta[] = [];
  const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(workspaceDir, entry.name, ".workspace.json");
    if (!fs.existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as WorkspaceMeta;
      workspaces.push(meta);
    } catch {
      continue;
    }
  }

  return workspaces.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findActiveWorkspace(userId: string, projectId: string): string | null {
  const workspaces = listWorkspaces(userId, projectId);
  return workspaces.length > 0 ? workspaces[0].workspaceId : null;
}

export function updateWorkspaceTimestamp(workspaceId: string): void {
  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (!meta) return;

  meta.updatedAt = Date.now();
  writeWorkspaceMeta(workspaceId, meta);
}
