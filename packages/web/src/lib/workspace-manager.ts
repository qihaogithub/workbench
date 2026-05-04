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
  getWorkspaceMultiDemoFiles,
  readProjectMeta,
  listDemoPages,
  type WorkspaceMeta,
} from "./fs-utils";
import type { MultiDemoFiles } from "@opencode-workbench/shared";

export interface CreateWorkspaceResult {
  workspaceId: string;
  workspacePath: string;
  /** 多页面文件集合（取代旧 code/schema 单文件返回） */
  demos: MultiDemoFiles;
}

function injectOpencodeAgentConfig(workspacePath: string, projectId: string): void {
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

  // 读取模板文件
  const templatePath = path.join(
    process.cwd(),
    "src",
    "lib",
    "agent-prompts",
    "demo-generator.template.md",
  );
  let template = "# Demo Generator Agent\n\n";
  if (fs.existsSync(templatePath)) {
    template = fs.readFileSync(templatePath, "utf-8");
  }

  // 构建运行时上下文
  const project = readProjectMeta(projectId);
  const projectName = project?.name ?? projectId;
  const demoPages = listDemoPages(workspacePath);

  const hasProjectConfig = fs.existsSync(
    path.join(workspacePath, "project.config.schema.json"),
  );
  const projectConfigLine = hasProjectConfig
    ? "项目级共享配置：✅ 已设置（project.config.schema.json）"
    : "项目级共享配置：未设置";

  const pageCount = demoPages.length;
  const pageList = demoPages
    .map(
      (p) =>
        `  📄 "${p.name}" → demos/${p.id}/ (index.tsx + config.schema.json)`,
    )
    .join("\n");

  // 替换占位符
  const agentMd = template
    .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
    .replace(/\{\{PROJECT_CONFIG_LINE\}\}/g, projectConfigLine)
    .replace(/\{\{PAGE_COUNT\}\}/g, String(pageCount))
    .replace(/\{\{PAGE_LIST\}\}/g, pageList || "  （暂无页面）");

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

  injectOpencodeAgentConfig(workspacePath, projectId);

  const demos = getWorkspaceMultiDemoFiles(workspaceId) ?? {
    demos: {},
    projectConfigSchema: undefined,
  };

  return {
    workspaceId,
    workspacePath,
    demos,
  };
}

export function getWorkspace(workspaceId: string) {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath || !fs.existsSync(wsPath)) return null;

  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (!meta) return null;

  // 多页面模式：读取所有页面
  const multi = getWorkspaceMultiDemoFiles(workspaceId);
  const demos = multi?.demos ?? {};
  const projectConfigSchema = multi?.projectConfigSchema;

  // 兼容：如果 workspace 根目录有旧格式文件，也读取
  const codePath = path.join(wsPath, "index.tsx");
  const schemaPath = path.join(wsPath, "config.schema.json");
  const hasLegacyFiles = fs.existsSync(codePath) && fs.existsSync(schemaPath);

  return {
    ...meta,
    demos,
    projectConfigSchema,
    workspacePath: wsPath,
    // 兼容旧格式前端
    code: hasLegacyFiles ? fs.readFileSync(codePath, "utf-8") : (Object.values(demos)[0]?.code ?? ""),
    schema: hasLegacyFiles ? fs.readFileSync(schemaPath, "utf-8") : (Object.values(demos)[0]?.schema ?? ""),
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
