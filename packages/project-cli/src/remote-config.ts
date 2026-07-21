import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface RemoteEntry {
  url: string;
  username?: string;
  token?: string;
  tokenExpiresAt?: number;
}

export interface CliConfig {
  defaultRemote?: string;
  remotes: Record<string, RemoteEntry>;
}

export class RemoteConfigError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RemoteConfigError";
  }
}

export function cliConfigPath(): string {
  const override = process.env.WORKBENCH_CLI_CONFIG;
  if (override) return path.resolve(override);
  return path.join(os.homedir(), ".workbench", "cli-config.json");
}

export function loadCliConfig(): CliConfig {
  const configPath = cliConfigPath();
  if (!fs.existsSync(configPath)) {
    return { remotes: {} };
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RemoteConfigError(
      "REMOTE_CONFIG_INVALID",
      `CLI 配置文件不是合法 JSON: ${configPath}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { remotes: {} };
  }
  const record = parsed as Record<string, unknown>;
  const remotesRaw =
    record.remotes && typeof record.remotes === "object"
      ? (record.remotes as Record<string, unknown>)
      : {};
  const remotes: Record<string, RemoteEntry> = {};
  for (const [name, entry] of Object.entries(remotesRaw)) {
    if (!entry || typeof entry !== "object") continue;
    const remote = entry as Record<string, unknown>;
    if (typeof remote.url !== "string" || !remote.url) continue;
    remotes[name] = {
      url: remote.url,
      username: typeof remote.username === "string" ? remote.username : undefined,
      token: typeof remote.token === "string" ? remote.token : undefined,
      tokenExpiresAt:
        typeof remote.tokenExpiresAt === "number"
          ? remote.tokenExpiresAt
          : undefined,
    };
  }
  return {
    defaultRemote:
      typeof record.defaultRemote === "string" && remotes[record.defaultRemote]
        ? record.defaultRemote
        : undefined,
    remotes,
  };
}

export function saveCliConfig(config: CliConfig): void {
  const configPath = cliConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  // writeFileSync 的 mode 只在新建文件时生效，已有文件需显式收紧权限
  fs.chmodSync(configPath, 0o600);
}

export function normalizeRemoteUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) {
    throw new RemoteConfigError(
      "REMOTE_URL_INVALID",
      `远程地址必须以 http:// 或 https:// 开头: ${url}`,
    );
  }
  return trimmed;
}

export function upsertRemote(name: string, url: string): CliConfig {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(name)) {
    throw new RemoteConfigError(
      "REMOTE_NAME_INVALID",
      `远程名称只能包含字母、数字、下划线和连字符: ${name}`,
    );
  }
  const config = loadCliConfig();
  const existing = config.remotes[name];
  config.remotes[name] = { ...existing, url: normalizeRemoteUrl(url) };
  if (!config.defaultRemote) config.defaultRemote = name;
  saveCliConfig(config);
  return config;
}

export function removeRemote(name: string): CliConfig {
  const config = loadCliConfig();
  if (!config.remotes[name]) {
    throw new RemoteConfigError("REMOTE_NOT_FOUND", `远程不存在: ${name}`);
  }
  delete config.remotes[name];
  if (config.defaultRemote === name) {
    config.defaultRemote = Object.keys(config.remotes)[0];
  }
  saveCliConfig(config);
  return config;
}

export function setDefaultRemote(name: string): CliConfig {
  const config = loadCliConfig();
  if (!config.remotes[name]) {
    throw new RemoteConfigError("REMOTE_NOT_FOUND", `远程不存在: ${name}`);
  }
  config.defaultRemote = name;
  saveCliConfig(config);
  return config;
}

export function setRemoteCredentials(
  name: string,
  credentials: { username?: string; token: string; tokenExpiresAt?: number },
): CliConfig {
  const config = loadCliConfig();
  const remote = config.remotes[name];
  if (!remote) {
    throw new RemoteConfigError("REMOTE_NOT_FOUND", `远程不存在: ${name}`);
  }
  config.remotes[name] = { ...remote, ...credentials };
  saveCliConfig(config);
  return config;
}

export function clearRemoteCredentials(name: string): CliConfig {
  const config = loadCliConfig();
  const remote = config.remotes[name];
  if (!remote) {
    throw new RemoteConfigError("REMOTE_NOT_FOUND", `远程不存在: ${name}`);
  }
  config.remotes[name] = { url: remote.url, username: remote.username };
  saveCliConfig(config);
  return config;
}

export function resolveRemoteEntry(name?: string): {
  name: string;
  remote: RemoteEntry;
} {
  const config = loadCliConfig();
  const targetName = name ?? config.defaultRemote;
  if (!targetName) {
    throw new RemoteConfigError(
      "REMOTE_NOT_CONFIGURED",
      "尚未配置远程 author-site，先运行 ow remote add <name> <url>",
    );
  }
  const remote = config.remotes[targetName];
  if (!remote) {
    throw new RemoteConfigError("REMOTE_NOT_FOUND", `远程不存在: ${targetName}`);
  }
  return { name: targetName, remote };
}
