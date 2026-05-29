import path from "path";
import fs from "fs";
import {
  getWorkspacesDir,
  getWorkspaceDir,
  getProjectPath,
  getSessionsDir,
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

function injectReferences(workspacePath: string): void {
  const refsDir = path.join(workspacePath, "references");
  if (!fs.existsSync(refsDir)) {
    fs.mkdirSync(refsDir, { recursive: true });
  }

  const sourceDir = path.join(
    process.cwd(),
    "src",
    "lib",
    "agent-prompts",
    "references",
  );

  if (!fs.existsSync(sourceDir)) return;

  for (const file of fs.readdirSync(sourceDir)) {
    if (!file.endsWith(".md")) continue;
    fs.copyFileSync(path.join(sourceDir, file), path.join(refsDir, file));
  }
}

function injectOpencodeAgentConfig(
  workspacePath: string,
  projectId: string,
): void {
  const opencodeDir = path.join(workspacePath, ".opencode");
  const agentsDir = path.join(opencodeDir, "agents");

  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  // 注入参考文件（references/）
  injectReferences(workspacePath);

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
    code: hasLegacyFiles
      ? fs.readFileSync(codePath, "utf-8")
      : (Object.values(demos)[0]?.code ?? ""),
    schema: hasLegacyFiles
      ? fs.readFileSync(schemaPath, "utf-8")
      : (Object.values(demos)[0]?.schema ?? ""),
  };
}

export function deleteWorkspace(workspaceId: string): boolean {
  const wsPath = findWorkspacePath(workspaceId);
  if (!wsPath) return false;

  fs.rmSync(wsPath, { recursive: true, force: true });
  return true;
}

export function listWorkspaces(
  userId: string,
  projectId: string,
): WorkspaceMeta[] {
  const workspaceDir = getWorkspaceDir(userId, projectId);
  if (!fs.existsSync(workspaceDir)) return [];

  const workspaces: WorkspaceMeta[] = [];
  const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(workspaceDir, entry.name, ".workspace.json");
    if (!fs.existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(
        fs.readFileSync(metaPath, "utf-8"),
      ) as WorkspaceMeta;
      workspaces.push(meta);
    } catch {
      continue;
    }
  }

  return workspaces.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findActiveWorkspace(
  userId: string,
  projectId: string,
): string | null {
  const workspaces = listWorkspaces(userId, projectId);
  return workspaces.length > 0 ? workspaces[0].workspaceId : null;
}

export function updateWorkspaceTimestamp(workspaceId: string): void {
  const meta = getWorkspaceMetaFromFs(workspaceId);
  if (!meta) return;

  meta.updatedAt = Date.now();
  writeWorkspaceMeta(workspaceId, meta);
}

/**
 * 收集所有活跃（未过期）session 引用的 workspaceId
 */
function collectActiveWorkspaceIds(): Set<string> {
  const ids = new Set<string>();
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) return ids;

  const userDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const projectDirs = fs.readdirSync(path.join(sessionsDir, userDir.name), {
      withFileTypes: true,
    });
    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const sessionDirs = fs.readdirSync(
        path.join(sessionsDir, userDir.name, projectDir.name),
        { withFileTypes: true },
      );
      for (const sessionDir of sessionDirs) {
        if (!sessionDir.isDirectory()) continue;
        const metaPath = path.join(
          sessionsDir,
          userDir.name,
          projectDir.name,
          sessionDir.name,
          ".session.json",
        );
        if (fs.existsSync(metaPath)) {
          try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (meta.workspaceId && Date.now() <= meta.expiresAt) {
              ids.add(meta.workspaceId);
            }
          } catch {
            /* 忽略损坏的 session 元数据 */
          }
        }
      }
    }
  }

  return ids;
}

/**
 * 清理孤儿 workspace：没有任何活跃 session 引用的过期 workspace
 * @param ttlMs TTL 时间，默认 24 小时
 */
export function cleanupOrphanWorkspaces(
  ttlMs: number = 24 * 60 * 60 * 1000,
): string[] {
  const cleaned: string[] = [];
  const workspacesDir = getWorkspacesDir();
  if (!fs.existsSync(workspacesDir)) return cleaned;

  const activeWorkspaceIds = collectActiveWorkspaceIds();

  const userDirs = fs.readdirSync(workspacesDir, { withFileTypes: true });
  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;
    const userWsDir = path.join(workspacesDir, userDir.name);
    const projectDirs = fs.readdirSync(userWsDir, { withFileTypes: true });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;
      const projectWsDir = path.join(userWsDir, projectDir.name);
      const wsEntries = fs.readdirSync(projectWsDir, { withFileTypes: true });

      for (const entry of wsEntries) {
        if (!entry.isDirectory()) continue;

        const wsId = entry.name;
        if (activeWorkspaceIds.has(wsId)) continue;

        const wsPath = path.join(projectWsDir, wsId);
        const metaPath = path.join(wsPath, ".workspace.json");

        let shouldDelete = false;
        if (fs.existsSync(metaPath)) {
          try {
            const wsMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            shouldDelete = Date.now() - wsMeta.updatedAt > ttlMs;
          } catch {
            const stat = fs.statSync(wsPath);
            shouldDelete = Date.now() - stat.mtimeMs > ttlMs;
          }
        } else {
          const stat = fs.statSync(wsPath);
          shouldDelete = Date.now() - stat.mtimeMs > ttlMs;
        }

        if (shouldDelete) {
          fs.rmSync(wsPath, { recursive: true, force: true });
          cleaned.push(wsId);
        }
      }
    }
  }

  return cleaned;
}
