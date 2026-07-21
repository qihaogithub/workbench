import {
  RemoteConfigError,
  loadCliConfig,
  normalizeRemoteUrl,
} from "./remote-config.js";

export interface RemoteTarget {
  url: string;
  token?: string;
  remoteName?: string;
  tokenExpiresAt?: number;
  /** url 的来源，用于错误提示 */
  source: "args" | "env" | "config";
}

export class RemoteApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly nextActions: string[] = [],
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "RemoteApiError";
  }
}

export interface RemoteTargetArgs {
  remote?: string;
  authorSiteUrl?: string;
  authToken?: string;
}

const TOKEN_EXPIRY_WARNING_MS = 24 * 60 * 60 * 1000;

/**
 * 解析远程目标。优先级：
 * - url：--remote 指定的配置 → --author-site-url → AUTHOR_SITE_URL → 默认 remote 配置
 * - token：--auth-token → AUTHOR_SITE_AUTH_TOKEN → 对应 remote 的缓存 token
 *
 * 缓存 token 只会随其所属 remote 的 url 一起使用，不会发给 args/env 指定的其他地址。
 */
export function resolveRemoteTarget(args: RemoteTargetArgs): RemoteTarget {
  const explicitToken =
    args.authToken ?? process.env.AUTHOR_SITE_AUTH_TOKEN ?? undefined;

  if (args.remote) {
    const config = loadCliConfig();
    const remote = config.remotes[args.remote];
    if (!remote) {
      throw new RemoteApiError(
        "REMOTE_NOT_FOUND",
        `远程不存在: ${args.remote}`,
        ["ow remote list --json", `ow remote add ${args.remote} <url>`],
      );
    }
    return {
      url: remote.url,
      token: explicitToken ?? remote.token,
      remoteName: args.remote,
      tokenExpiresAt: explicitToken ? undefined : remote.tokenExpiresAt,
      source: "config",
    };
  }

  if (args.authorSiteUrl) {
    return {
      url: normalizeRemoteUrl(args.authorSiteUrl),
      token: explicitToken,
      source: "args",
    };
  }

  if (process.env.AUTHOR_SITE_URL) {
    return {
      url: normalizeRemoteUrl(process.env.AUTHOR_SITE_URL),
      token: explicitToken,
      source: "env",
    };
  }

  const config = loadCliConfig();
  if (config.defaultRemote && config.remotes[config.defaultRemote]) {
    const remote = config.remotes[config.defaultRemote];
    return {
      url: remote.url,
      token: explicitToken ?? remote.token,
      remoteName: config.defaultRemote,
      tokenExpiresAt: explicitToken ? undefined : remote.tokenExpiresAt,
      source: "config",
    };
  }

  throw new RemoteApiError(
    "REMOTE_NOT_CONFIGURED",
    "未配置远程 author-site 地址",
    [
      "ow remote add <name> <url> 后 ow login",
      "或传入 --author-site-url <url> / 设置 AUTHOR_SITE_URL",
    ],
  );
}

export function requireRemoteToken(target: RemoteTarget): string {
  if (!target.token) {
    throw new RemoteApiError(
      "REMOTE_TOKEN_MISSING",
      `远程 ${target.remoteName ?? target.url} 未登录`,
      [
        target.remoteName ? `ow login --remote ${target.remoteName}` : "ow login",
        "或传入 --auth-token <token> / 设置 AUTHOR_SITE_AUTH_TOKEN",
      ],
    );
  }
  if (target.tokenExpiresAt && target.tokenExpiresAt <= Date.now()) {
    throw new RemoteApiError(
      "REMOTE_TOKEN_EXPIRED",
      `远程 ${target.remoteName ?? target.url} 的登录凭证已过期`,
      [
        target.remoteName ? `ow login --remote ${target.remoteName}` : "ow login",
      ],
    );
  }
  return target.token;
}

export function remoteTokenWarnings(target: RemoteTarget): string[] {
  if (!target.token || !target.tokenExpiresAt) return [];
  const remaining = target.tokenExpiresAt - Date.now();
  if (remaining <= 0) return [];
  if (remaining < TOKEN_EXPIRY_WARNING_MS) {
    const hours = Math.max(1, Math.round(remaining / (60 * 60 * 1000)));
    return [
      `登录凭证约 ${hours} 小时后过期，建议重新 ow login${target.remoteName ? ` --remote ${target.remoteName}` : ""}`,
    ];
  }
  return [];
}

interface RemoteJsonResponse<T> {
  status: number;
  payload: {
    success: boolean;
    data?: T;
    error?: { code?: string; message?: string; details?: unknown };
  };
}

/**
 * 调用远程 author-site API。鉴权走 `Cookie: auth_token=<token>` 头，
 * 与服务端各 route 的 getAuthCookie() 读取方式一致。
 */
export async function remoteFetch(
  target: RemoteTarget,
  apiPath: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<Response> {
  const { auth = true, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (auth) {
    const token = requireRemoteToken(target);
    headers.set("Cookie", `auth_token=${encodeURIComponent(token)}`);
  }
  try {
    return await fetch(`${target.url}${apiPath}`, {
      ...requestInit,
      headers,
    });
  } catch (error) {
    throw new RemoteApiError(
      "REMOTE_UNREACHABLE",
      `无法连接远程 author-site (${target.url}): ${error instanceof Error ? error.message : String(error)}`,
      ["确认远程服务正在运行", "ow doctor --json"],
    );
  }
}

export async function remoteJson<T>(
  target: RemoteTarget,
  apiPath: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<RemoteJsonResponse<T>> {
  const response = await remoteFetch(target, apiPath, init);
  let payload: RemoteJsonResponse<T>["payload"];
  try {
    payload = (await response.json()) as RemoteJsonResponse<T>["payload"];
  } catch {
    throw new RemoteApiError(
      "REMOTE_RESPONSE_INVALID",
      `远程响应不是合法 JSON (HTTP ${response.status})`,
      ["确认远程地址指向 author-site 服务"],
    );
  }
  if (response.status === 401) {
    throw new RemoteApiError(
      "REMOTE_UNAUTHORIZED",
      payload.error?.message ?? "远程登录已失效",
      [
        target.remoteName ? `ow login --remote ${target.remoteName}` : "ow login",
      ],
      payload.error?.details,
    );
  }
  return { status: response.status, payload };
}

export { RemoteConfigError };
