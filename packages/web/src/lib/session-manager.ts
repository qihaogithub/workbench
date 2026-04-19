import path from "path";
import fs from "fs";
import {
  getProjectsDir,
  getSessionsDir,
  getProjectPath,
  getSessionPath,
  getSnapshotPath,
  projectExists,
  sessionExists,
  deleteSession,
  getLatestVersion,
  readProjectMeta,
  writeProjectMeta,
  generateVersionId,
  countFiles,
  cleanupOldVersions,
  ensureWorkspaceFiles,
} from "./fs-utils";
import type { Project, VersionInfo } from "@opencode-workbench/shared";
import { generateThumbnail } from "./screenshot";

const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

/**
 * 在 Session 中注入 .opencode 代理配置
 */
function injectOpencodeAgentConfig(sessionPath: string): void {
  const opencodeDir = path.join(sessionPath, ".opencode");
  const agentsDir = path.join(opencodeDir, "agents");

  // 创建目录结构
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  // 创建 opencode.json
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

  // 创建 demo-generator.md
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

export interface CreateSessionResult {
  sessionId: string;
  code: string;
  schema: string;
  tempWorkspace: string;
}

/**
 * 获取项目 Session 目录路径
 * 新结构: sessions/{userId}/{projectId}/
 */
function getProjectSessionDir(userId: string, projectId: string): string {
  return path.join(getSessionsDir(), userId, projectId);
}

export function findActiveSession(
  userId: string,
  projectId: string,
): string | null {
  const projectSessionDir = getProjectSessionDir(userId, projectId);
  if (!fs.existsSync(projectSessionDir)) {
    return null;
  }

  try {
    const entries = fs.readdirSync(projectSessionDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const metaPath = path.join(
        projectSessionDir,
        entry.name,
        ".session.json",
      );
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

        // 防御性检查：如果 session 元数据中的 userId 与路径不匹配，记录警告
        if (meta.userId && meta.userId !== userId) {
          console.warn(
            `[Session] Session ${entry.name} metadata userId (${meta.userId}) ` +
              `doesn't match path userId (${userId}). Possible data corruption.`,
          );
          continue;
        }

        // 发现过期 session，主动删除
        if (Date.now() > meta.expiresAt) {
          fs.rmSync(path.join(projectSessionDir, entry.name), {
            recursive: true,
            force: true,
          });
          console.log(`[Session] Cleaned up expired session: ${entry.name}`);
          continue;
        }

        // 跳过已保存或已放弃的 session
        const status = meta.status || 'editing';
        if (status !== 'editing') {
          continue;
        }

        if (meta.demoId === projectId) {
          // 返回目录名作为 sessionId，确保与文件系统一致
          // 同时更新 .session.json 中的 sessionId 字段以保持一致
          if (meta.sessionId !== entry.name) {
            meta.sessionId = entry.name;
            fs.writeFileSync(
              metaPath,
              JSON.stringify(meta, null, 2),
              "utf-8",
            );
            console.log(`[Session] Fixed sessionId mismatch in ${entry.name}`);
          }
          return entry.name;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function createEditSession(
  userId: string,
  projectId: string,
): Promise<CreateSessionResult> {
  if (!projectExists(projectId)) {
    throw new Error(`Project "${projectId}" 不存在`);
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");
  const sessionDir = getProjectSessionDir(userId, projectId);
  const sessionPath = path.join(sessionDir, sessionId);

  ensureWorkspaceFiles(workspacePath);

  fs.mkdirSync(sessionDir, { recursive: true });
  fs.cpSync(workspacePath, sessionPath, { recursive: true });

  const latestVersion = getLatestVersion(projectId);

  const sessionMeta = {
    sessionId,
    userId,
    demoId: projectId,
    status: 'editing' as const,
    basedOnVersion: latestVersion?.versionId || 'v0',
    opencodeSessionId: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  };
  fs.writeFileSync(
    path.join(sessionPath, ".session.json"),
    JSON.stringify(sessionMeta, null, 2),
    "utf-8",
  );

  injectOpencodeAgentConfig(sessionPath);

  const codePath = path.join(sessionPath, "index.tsx");
  const schemaPath = path.join(sessionPath, "config.schema.json");

  return {
    sessionId,
    code: fs.readFileSync(codePath, "utf-8"),
    schema: fs.readFileSync(schemaPath, "utf-8"),
    tempWorkspace: sessionPath,
  };
}

export function getEditSession(sessionId: string) {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return null;
  }

  const metaPath = path.join(sessionPath, ".session.json");
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  const codePath = path.join(sessionPath, "index.tsx");
  const schemaPath = path.join(sessionPath, "config.schema.json");

  return {
    sessionId: meta.sessionId,
    demoId: meta.demoId,
    userId: meta.userId,
    status: meta.status || 'editing',
    basedOnVersion: meta.basedOnVersion || 'v0',
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    code: fs.existsSync(codePath) ? fs.readFileSync(codePath, "utf-8") : "",
    schema: fs.existsSync(schemaPath)
      ? fs.readFileSync(schemaPath, "utf-8")
      : "",
  };
}

export interface SaveEditSessionResult {
  success: boolean;
  version?: string;
  savedAt?: number;
  error?: string;
}

export function saveEditSession(
  sessionId: string,
  userId?: string,
  note?: string,
): SaveEditSessionResult {
  const sessionMeta = getEditSession(sessionId);
  if (!sessionMeta) {
    return { success: false, error: 'Session not found' };
  }

  const sessionPath = getSessionPath(sessionId);
  const status = sessionMeta.status || 'editing';
  if (status !== 'editing') {
    // Session 状态不是 editing，但目录仍然存在，
    // 可能是之前保存时 deleteSession 失败（如 Windows 文件锁）导致的残留
    if (sessionPath && fs.existsSync(sessionPath)) {
      try {
        const metaPath = path.join(sessionPath, ".session.json");
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          meta.status = 'editing';
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
          console.log(`[saveEditSession] 修复 session ${sessionId} 状态为 editing`);
        }
      } catch (e) {
        console.error(`[saveEditSession] 修复 session 状态失败:`, e);
        return { success: false, error: 'Session not in editing status' };
      }
    } else {
      return { success: false, error: 'Session not in editing status' };
    }
  }

  const { demoId: projectId } = sessionMeta;
  const projectPath = getProjectPath(projectId);
  const workspacePath = path.join(projectPath, "workspace");

  // 读取项目元数据
  const project = readProjectMeta(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  // 生成新版本号
  const versionId = generateVersionId(project);
  const snapshotPath = getSnapshotPath(projectId, versionId);

  try {
    // 1. 创建快照：备份当前 workspace 到 snapshots
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    if (fs.existsSync(workspacePath)) {
      fs.cpSync(workspacePath, snapshotPath, { recursive: true });
    }

    // 2. 临时空间覆盖正式空间
    fs.rmSync(workspacePath, { recursive: true, force: true });
    fs.cpSync(sessionPath, workspacePath, { recursive: true });

    // 删除 workspace 中的 .session.json
    const metaInWorkspace = path.join(workspacePath, ".session.json");
    if (fs.existsSync(metaInWorkspace)) {
      fs.rmSync(metaInWorkspace, { force: true });
    }

    // 3. 记录版本信息
    const versionInfo: VersionInfo = {
      versionId,
      savedAt: Date.now(),
      savedBy: userId || sessionMeta.userId || 'anonymous',
      sessionId,
      snapshotPath,
      fileCount: countFiles(workspacePath),
      note,
    };

    project.versions.push(versionInfo);
    project.updatedAt = Date.now();

    // 4. 清理旧版本（保留最近 MAX_VERSIONS_KEEP 个）
    cleanupOldVersions(project);

    // 5. 保存项目元数据
    writeProjectMeta(projectId, project);

    // 6. 异步生成缩略图（不阻塞保存响应）
    generateThumbnail(projectId).catch((err) => {
      console.warn(`[saveEditSession] 缩略图生成失败:`, err);
    });

    // 7. 更新 session 状态为 saved
    const metaPath = path.join(sessionPath, ".session.json");
    if (fs.existsSync(metaPath)) {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      meta.status = 'saved';
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    }

    // 7. 清理 session（失败不影响保存结果）
    try {
      deleteSession(sessionId);
    } catch (e) {
      console.warn(`[saveEditSession] 清理 session 失败，但保存已成功:`, e);
    }

    return {
      success: true,
      version: versionId,
      savedAt: versionInfo.savedAt,
    };
  } catch (error) {
    console.error(`[saveEditSession] 保存失败:`, error);
    return { success: false, error: 'Save failed' };
  }
}

export function dropEditSession(sessionId: string): boolean {
  return deleteSession(sessionId);
}

export function discardEditSession(sessionId: string): boolean {
  const sessionPath = getSessionPath(sessionId);
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return false;
  }

  const metaPath = path.join(sessionPath, ".session.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      meta.status = 'discarded';
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    } catch {
      // 忽略写入错误
    }
  }

  // 延迟删除，保留 discarded 状态一段时间便于调试
  fs.rmSync(sessionPath, { recursive: true, force: true });
  return true;
}

/**
 * 清理指定用户的过期 Session
 */
export function cleanupExpiredSessions(userId: string): string[] {
  const userSessionsDir = path.join(getSessionsDir(), userId);
  if (!fs.existsSync(userSessionsDir)) {
    return [];
  }

  const cleaned: string[] = [];
  const projectDirs = fs.readdirSync(userSessionsDir, { withFileTypes: true });

  for (const projectDir of projectDirs) {
    if (!projectDir.isDirectory()) continue;

    const projectSessionDir = path.join(userSessionsDir, projectDir.name);
    const sessionDirs = fs.readdirSync(projectSessionDir, {
      withFileTypes: true,
    });

    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue;

      const metaPath = path.join(
        projectSessionDir,
        sessionDir.name,
        ".session.json",
      );
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (Date.now() > meta.expiresAt) {
          fs.rmSync(path.join(projectSessionDir, sessionDir.name), {
            recursive: true,
            force: true,
          });
          cleaned.push(sessionDir.name);
        }
      } catch {
        continue;
      }
    }
  }

  return cleaned;
}

/**
 * 全局清理：遍历所有用户的过期 Session（用于后台定时任务）
 */
export function cleanupAllExpiredSessions(): string[] {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const cleaned: string[] = [];
  const userDirs = fs.readdirSync(sessionsDir, { withFileTypes: true });

  for (const userDir of userDirs) {
    if (!userDir.isDirectory()) continue;

    const userId = userDir.name;
    const userSessionsDir = path.join(sessionsDir, userId);
    const projectDirs = fs.readdirSync(userSessionsDir, {
      withFileTypes: true,
    });

    for (const projectDir of projectDirs) {
      if (!projectDir.isDirectory()) continue;

      const projectSessionDir = path.join(userSessionsDir, projectDir.name);
      const sessionDirs = fs.readdirSync(projectSessionDir, {
        withFileTypes: true,
      });

      for (const sessionDir of sessionDirs) {
        if (!sessionDir.isDirectory()) continue;

        const metaPath = path.join(
          projectSessionDir,
          sessionDir.name,
          ".session.json",
        );
        if (!fs.existsSync(metaPath)) continue;

        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          if (Date.now() > meta.expiresAt) {
            fs.rmSync(path.join(projectSessionDir, sessionDir.name), {
              recursive: true,
              force: true,
            });
            cleaned.push(sessionDir.name);
          }
        } catch {
          continue;
        }
      }
    }
  }

  return cleaned;
}
