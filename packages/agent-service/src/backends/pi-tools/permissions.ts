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
    "**/.workbench",
    "**/.workbench/**",
    "**/.workspace.json",
    "**/.session.json",
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

export interface CommandPermissionResult {
  allowed: boolean;
  reason?: 'denied_command' | 'node_eval_blocked' | 'npm_npx_blocked' | 'not_in_allowed';
  baseCommand?: string;
}

export function getCommandPermissionResult(
  command: string,
  config: PermissionConfig,
): CommandPermissionResult {
  const trimmed = command.trim();
  if (!trimmed) return { allowed: false, reason: 'not_in_allowed' };
  const baseCmd = trimmed.split(/\s+/)[0];
  if (config.deniedCommands.includes(baseCmd)) {
    return { allowed: false, reason: 'denied_command', baseCommand: baseCmd };
  }
  if (baseCmd === "npm" || baseCmd === "npx") {
    return { allowed: false, reason: 'npm_npx_blocked', baseCommand: baseCmd };
  }
  if (baseCmd === "node" && /\s(?:-e|--eval)(?:\s|=|$)/.test(` ${trimmed}`)) {
    return { allowed: false, reason: 'node_eval_blocked', baseCommand: baseCmd };
  }
  if (!config.allowedCommands.includes(baseCmd)) {
    return { allowed: false, reason: 'not_in_allowed', baseCommand: baseCmd };
  }
  return { allowed: true, baseCommand: baseCmd };
}

export function isCommandAllowed(
  command: string,
  config: PermissionConfig,
): boolean {
  return getCommandPermissionResult(command, config).allowed;
}

export function isLiveWorkspaceReadOnlyCommandAllowed(
  command: string,
  config: PermissionConfig,
): boolean {
  if (!isCommandAllowed(command, config)) return false;
  const trimmed = command.trim();
  const baseCmd = trimmed.split(/\s+/)[0] || "";
  if (baseCmd === "node" || baseCmd === "npm" || baseCmd === "npx") {
    return false;
  }
  if (hasShellWriteOrCompositionSyntax(trimmed)) {
    return false;
  }
  return true;
}

function hasShellWriteOrCompositionSyntax(command: string): boolean {
  return /(?:^|[^\\])(?:>>?|<<|[|;&]|\$\(|`|\n)/.test(command) || /\b(?:tee|xargs)\b/.test(command);
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
