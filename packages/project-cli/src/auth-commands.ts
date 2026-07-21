import readline from "node:readline";
import {
  stdin as processStdin,
  stdout as processStdout,
} from "node:process";

import {
  RemoteConfigError,
  clearRemoteCredentials,
  loadCliConfig,
  removeRemote,
  resolveRemoteEntry,
  setDefaultRemote,
  setRemoteCredentials,
  upsertRemote,
} from "./remote-config.js";
import {
  RemoteApiError,
  remoteFetch,
  remoteJson,
  remoteTokenWarnings,
  resolveRemoteTarget,
} from "./remote-api.js";

export interface AuthCommandResult {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; recoverable: true };
  warnings?: string[];
  nextActions?: string[];
}

function fail(
  code: string,
  message: string,
  nextActions?: string[],
): AuthCommandResult {
  return {
    ok: false,
    error: { code, message, recoverable: true },
    nextActions,
  };
}

function toResult(error: unknown): AuthCommandResult {
  if (error instanceof RemoteApiError) {
    return fail(error.code, error.message, error.nextActions);
  }
  if (error instanceof RemoteConfigError) {
    return fail(error.code, error.message);
  }
  throw error;
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: processStdin,
    output: processStdout,
  });
  try {
    return await new Promise<string>((resolve) => {
      rl.question(question, resolve);
    });
  } finally {
    rl.close();
  }
}

async function promptHidden(question: string): Promise<string> {
  if (!processStdin.isTTY) {
    return promptLine(question);
  }
  processStdout.write(question);
  processStdin.setRawMode(true);
  processStdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf-8")) {
        if (char === "") {
          cleanup();
          reject(new Error("已取消输入"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          processStdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    const cleanup = () => {
      processStdin.off("data", onData);
      processStdin.setRawMode(false);
      processStdin.pause();
    };
    processStdin.on("data", onData);
  });
}

function formatExpiry(expiresAt?: number): string | undefined {
  if (!expiresAt) return undefined;
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) return "已过期";
  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  if (hours >= 24) return `约 ${Math.floor(hours / 24)} 天后过期`;
  return `约 ${Math.max(1, hours)} 小时后过期`;
}

export function remoteAdd(name: string, url: string): AuthCommandResult {
  if (!name || !url) {
    return fail("VALIDATION_ERROR", "用法: ow remote add <name> <url>");
  }
  try {
    const config = upsertRemote(name, url);
    return {
      ok: true,
      data: {
        name,
        url: config.remotes[name].url,
        isDefault: config.defaultRemote === name,
      },
      nextActions: [`ow login --remote ${name}`],
    };
  } catch (error) {
    return toResult(error);
  }
}

export function remoteRemove(name: string): AuthCommandResult {
  if (!name) return fail("VALIDATION_ERROR", "用法: ow remote remove <name>");
  try {
    const config = removeRemote(name);
    return {
      ok: true,
      data: { removed: name, defaultRemote: config.defaultRemote },
    };
  } catch (error) {
    return toResult(error);
  }
}

export function remoteUse(name: string): AuthCommandResult {
  if (!name) return fail("VALIDATION_ERROR", "用法: ow remote use <name>");
  try {
    setDefaultRemote(name);
    return { ok: true, data: { defaultRemote: name } };
  } catch (error) {
    return toResult(error);
  }
}

export function remoteList(): AuthCommandResult {
  const config = loadCliConfig();
  const remotes = Object.entries(config.remotes).map(([name, remote]) => ({
    name,
    url: remote.url,
    isDefault: config.defaultRemote === name,
    loggedIn: Boolean(remote.token),
    username: remote.username,
    tokenExpiry: formatExpiry(remote.tokenExpiresAt),
  }));
  return {
    ok: true,
    data: { defaultRemote: config.defaultRemote, remotes },
    nextActions:
      remotes.length === 0 ? ["ow remote add <name> <url>"] : undefined,
  };
}

interface LoginResponseData {
  user: { id: string; username: string };
  token?: string;
  expiresAt?: number;
}

export async function login(args: {
  remote?: string;
  username?: string;
  password?: string;
}): Promise<AuthCommandResult> {
  let remoteName: string;
  let remoteUrl: string;
  try {
    const resolved = resolveRemoteEntry(args.remote);
    remoteName = resolved.name;
    remoteUrl = resolved.remote.url;
  } catch (error) {
    return toResult(error);
  }

  let username = args.username;
  let password = args.password;
  if (!username || !password) {
    if (!processStdin.isTTY) {
      return fail(
        "LOGIN_INPUT_REQUIRED",
        "非交互终端下必须传入 --username 与 --password",
        [`ow login --remote ${remoteName} --username <u> --password <p>`],
      );
    }
    username = username || (await promptLine(`用户名 (${remoteUrl}): `));
    password = password || (await promptHidden("密码: "));
  }
  if (!username || !password) {
    return fail("VALIDATION_ERROR", "用户名和密码不能为空");
  }

  try {
    const target = { url: remoteUrl, remoteName, source: "config" as const };
    const { status, payload } = await remoteJson<LoginResponseData>(
      target,
      "/api/auth/login",
      {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, includeToken: true }),
      },
    );
    if (!payload.success || !payload.data) {
      return fail(
        payload.error?.code ?? `HTTP_${status}`,
        payload.error?.message ?? "登录失败",
      );
    }
    if (!payload.data.token) {
      return fail(
        "LOGIN_TOKEN_MISSING",
        "远程 author-site 未返回 token，需要包含 includeToken 支持的版本",
      );
    }
    setRemoteCredentials(remoteName, {
      username: payload.data.user.username,
      token: payload.data.token,
      tokenExpiresAt: payload.data.expiresAt,
    });
    return {
      ok: true,
      data: {
        remote: remoteName,
        url: remoteUrl,
        user: payload.data.user,
        tokenExpiry: formatExpiry(payload.data.expiresAt),
      },
      nextActions: ["ow whoami --json"],
    };
  } catch (error) {
    return toResult(error);
  }
}

export function logout(args: { remote?: string }): AuthCommandResult {
  try {
    const { name } = resolveRemoteEntry(args.remote);
    clearRemoteCredentials(name);
    return { ok: true, data: { remote: name, loggedOut: true } };
  } catch (error) {
    return toResult(error);
  }
}

export function whoami(args: {
  remote?: string;
  authorSiteUrl?: string;
  authToken?: string;
}): AuthCommandResult {
  try {
    const target = resolveRemoteTarget(args);
    const warnings = remoteTokenWarnings(target);
    return {
      ok: true,
      data: {
        remote: target.remoteName,
        url: target.url,
        urlSource: target.source,
        loggedIn: Boolean(target.token),
        username: target.remoteName
          ? loadCliConfig().remotes[target.remoteName]?.username
          : undefined,
        tokenExpiry: formatExpiry(target.tokenExpiresAt),
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      nextActions: target.token
        ? undefined
        : [
            target.remoteName
              ? `ow login --remote ${target.remoteName}`
              : "ow login",
          ],
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function diagnoseRemote(args: {
  remote?: string;
  authorSiteUrl?: string;
  authToken?: string;
}): Promise<AuthCommandResult> {
  const config = loadCliConfig();
  if (
    !args.remote &&
    !args.authorSiteUrl &&
    !process.env.AUTHOR_SITE_URL &&
    !config.defaultRemote
  ) {
    return {
      ok: true,
      data: { configured: false },
      nextActions: ["ow remote add <name> <url>"],
    };
  }

  try {
    const target = resolveRemoteTarget(args);
    const connectivity = {
      ok: false,
      status: undefined as number | undefined,
      message: undefined as string | undefined,
    };
    try {
      const response = await remoteFetch(target, "/", {
        method: "HEAD",
        auth: false,
        signal: AbortSignal.timeout(5_000),
      });
      connectivity.ok = response.status < 500;
      connectivity.status = response.status;
      if (!connectivity.ok) connectivity.message = `HTTP ${response.status}`;
    } catch (error) {
      connectivity.message =
        error instanceof Error ? error.message : String(error);
    }

    const credentials: {
      configured: boolean;
      valid?: boolean;
      status?: number;
      message?: string;
    } = { configured: Boolean(target.token) };
    if (target.token && connectivity.ok) {
      try {
        const response = await remoteFetch(target, "/api/sessions", {
          method: "GET",
          signal: AbortSignal.timeout(5_000),
        });
        credentials.status = response.status;
        credentials.valid = response.status !== 401 && response.status !== 403;
        if (!credentials.valid) credentials.message = "登录凭证无效或已过期";
      } catch (error) {
        credentials.valid = false;
        credentials.message =
          error instanceof Error ? error.message : String(error);
      }
    }

    const warnings = remoteTokenWarnings(target);
    if (!connectivity.ok) warnings.push("远程 author-site 不可达");
    if (credentials.configured && credentials.valid === false) {
      warnings.push("远程登录凭证无效，请重新 ow login");
    }
    return {
      ok: true,
      data: {
        configured: true,
        remote: target.remoteName,
        url: target.url,
        connectivity,
        credentials,
        tokenExpiresAt: target.tokenExpiresAt,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      nextActions:
        credentials.configured && credentials.valid !== false
          ? undefined
          : [
              target.remoteName
                ? `ow login --remote ${target.remoteName}`
                : "ow login",
            ],
    };
  } catch (error) {
    return toResult(error);
  }
}
