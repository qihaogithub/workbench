import path from "path";

export interface PermissionConfig {
  allowedPaths: string[];
  deniedPatterns: string[];
  allowedCommands: string[];
  deniedCommands: string[];
}

export const DEFAULT_WORKSPACE_PERMISSIONS: PermissionConfig = {
  allowedPaths: [
    "**",
    "demos/*/index.tsx",
    "demos/*/config.schema.json",
    "project.config.schema.json",
    "workspace-tree.json",
    "AGENTS.md",
    "index.tsx",
    "config.schema.json",
  ],
  deniedPatterns: [
    "**/*.env",
    "**/*.env.*",
    "**/.git",
    "**/.git/**",
    "**/node_modules",
    "**/node_modules/**",
    "**/packages",
    "**/packages/**",
    "**/.opencode",
    "**/.opencode/**",
    "**/.workspace.json",
    "**/.session.json",
    "**/.canvas-layout.json",
  ],
  allowedCommands: ["node", "ls", "cat", "head", "tail", "grep", "find", "wc", "echo"],
  deniedCommands: ["rm", "rmdir", "mv", "cp", "mkdir", "sudo", "chmod", "chown"],
};

export function isPathAllowed(
  targetPath: string,
  workingDir: string,
  config: PermissionConfig,
): boolean {
  if (!workingDir) return false;

  const fullPath = targetPath.startsWith("/")
    ? targetPath
    : path.join(workingDir, targetPath);
  const resolved = path.resolve(fullPath);
  const workDirResolved = path.resolve(workingDir);

  if (!resolved.startsWith(workDirResolved + path.sep) && resolved !== workDirResolved) {
    return false;
  }

  const relativePath = path.relative(workDirResolved, resolved).replace(/\\/g, "/");
  const normalizedResolved = resolved.replace(/\\/g, "/");

  for (const pattern of config.deniedPatterns) {
    if (matchGlob(relativePath, pattern) || matchGlob(normalizedResolved, pattern)) {
      return false;
    }
  }

  for (const pattern of config.allowedPaths) {
    if (matchGlob(relativePath, pattern) || matchGlob(normalizedResolved, pattern)) {
      return true;
    }
  }

  return false;
}

export function isCommandAllowed(
  command: string,
  config: PermissionConfig,
): boolean {
  const trimmed = command.trim();
  if (!trimmed) return false;
  const baseCmd = trimmed.split(/\s+/)[0];
  if (config.deniedCommands.includes(baseCmd)) {
    return false;
  }
  if (baseCmd === "npm" || baseCmd === "npx") {
    return false;
  }
  if (baseCmd === "node" && /\s(?:-e|--eval)(?:\s|=|$)/.test(` ${trimmed}`)) {
    return false;
  }
  if (!config.allowedCommands.includes(baseCmd)) {
    return false;
  }
  return true;
}

function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern.startsWith("**/") && matchGlob(filePath, pattern.slice(3))) {
    return true;
  }

  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "{{DOUBLE_STAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{DOUBLE_STAR}}/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${regex}$`).test(filePath);
}
