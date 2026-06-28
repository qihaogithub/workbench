/**
 * agent-service 配置同步工具
 *
 * 用途：author-side 修改 backendProviders 后，调用此模块推送到 agent-service
 * 鉴权：使用 .env 中的 INTERNAL_API_TOKEN（与 agent-service 共享）
 */

import type {
  BackendProvidersConfig,
  ExternalAuthSessionConfig,
} from "@opencode-workbench/shared";

import {
  getInternalApiToken,
  getServerAgentServiceUrl,
} from "./runtime-config";

export interface PushResult {
  ok: boolean;
  message: string;
  data?: unknown;
}

/**
 * 推送 backendProviders 配置到 agent-service
 *
 * 失败不会抛异常，返回结果对象供调用方决定如何处理
 */
export async function pushBackendProvidersToAgent(
  config: BackendProvidersConfig,
): Promise<PushResult> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return {
      ok: false,
      message:
        "INTERNAL_API_TOKEN 未配置（.env），无法推送配置到 agent-service",
    };
  }

  try {
    const res = await fetch(`${getServerAgentServiceUrl()}/internal/backend-providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internalToken,
      },
      body: JSON.stringify(config),
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      return {
        ok: false,
        message: body?.error?.message || `agent-service 响应 ${res.status}`,
        data: body,
      };
    }

    return {
      ok: true,
      message: `已推送到 agent-service（${config.providers.length} 个供应商）`,
      data: body?.data,
    };
  } catch (err) {
    return {
      ok: false,
      message: `推送失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * 从 agent-service 读取当前配置（用于验证推送成功）
 */
export async function fetchBackendProvidersFromAgent(): Promise<{
  ok: boolean;
  config?: BackendProvidersConfig;
  message?: string;
}> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return { ok: false, message: "INTERNAL_API_TOKEN 未配置" };
  }

  try {
    const res = await fetch(`${getServerAgentServiceUrl()}/internal/backend-providers`, {
      method: "GET",
      headers: {
        "X-Internal-Token": internalToken,
      },
    });

    const body = await res.json();
    if (!res.ok || !body.success) {
      return { ok: false, message: body?.error?.message || "拉取失败" };
    }
    return { ok: true, config: body.data };
  } catch (err) {
    return {
      ok: false,
      message: `拉取失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function pushSessionModelConfigToAgent(
  sessionId: string,
  config: BackendProvidersConfig,
): Promise<PushResult> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return {
      ok: false,
      message:
        "INTERNAL_API_TOKEN 未配置（.env），无法推送用户模型配置到 agent-service",
    };
  }

  try {
    const res = await fetch(
      `${getServerAgentServiceUrl()}/internal/sessions/${encodeURIComponent(sessionId)}/model-config`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internalToken,
        },
        body: JSON.stringify(config),
      },
    );

    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: { message?: unknown } }).error?.message ===
          "string"
          ? (body as { error: { message: string } }).error.message
          : `agent-service 响应 ${res.status}`;
      return { ok: false, message, data: body };
    }

    return {
      ok: true,
      message: "已推送用户模型配置到 agent-service session",
      data: body,
    };
  } catch (err) {
    return {
      ok: false,
      message: `推送失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function pushSessionExternalAuthToAgent(
  sessionId: string,
  config: ExternalAuthSessionConfig,
): Promise<PushResult> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return {
      ok: false,
      message:
        "INTERNAL_API_TOKEN 未配置（.env），无法推送外部授权配置到 agent-service",
    };
  }

  try {
    const res = await fetch(
      `${getServerAgentServiceUrl()}/internal/sessions/${encodeURIComponent(sessionId)}/external-auth`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": internalToken,
        },
        body: JSON.stringify(config),
      },
    );

    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }

    if (!res.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof (body as { error?: { message?: unknown } }).error?.message ===
          "string"
          ? (body as { error: { message: string } }).error.message
          : `agent-service 响应 ${res.status}`;
      return { ok: false, message, data: body };
    }

    return {
      ok: true,
      message: "已推送用户外部授权配置到 agent-service session",
      data: body,
    };
  } catch (err) {
    return {
      ok: false,
      message: `推送失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function startDingtalkAuthOnAgent(userId: string): Promise<PushResult> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return { ok: false, message: "INTERNAL_API_TOKEN 未配置" };
  }

  try {
    const res = await fetch(`${getServerAgentServiceUrl()}/internal/external-auth/dingtalk/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": internalToken,
      },
      body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      return {
        ok: false,
        message: body?.error?.message || `agent-service 响应 ${res.status}`,
        data: body,
      };
    }
    return { ok: true, message: "钉钉授权已启动", data: body.data };
  } catch (err) {
    return {
      ok: false,
      message: `启动钉钉授权失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function fetchDingtalkAuthFromAgent(userId: string): Promise<PushResult> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return { ok: false, message: "INTERNAL_API_TOKEN 未配置" };
  }

  try {
    const res = await fetch(
      `${getServerAgentServiceUrl()}/internal/external-auth/dingtalk/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: { "X-Internal-Token": internalToken },
      },
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      return {
        ok: false,
        message: body?.error?.message || `agent-service 响应 ${res.status}`,
        data: body,
      };
    }
    return { ok: true, message: "已读取钉钉授权状态", data: body.data };
  } catch (err) {
    return {
      ok: false,
      message: `读取钉钉授权状态失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function disconnectDingtalkAuthOnAgent(userId: string): Promise<PushResult> {
  const internalToken = getInternalApiToken();
  if (!internalToken) {
    return { ok: false, message: "INTERNAL_API_TOKEN 未配置" };
  }

  try {
    const res = await fetch(`${getServerAgentServiceUrl()}/internal/external-auth/dingtalk/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { "X-Internal-Token": internalToken },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      return {
        ok: false,
        message: body?.error?.message || `agent-service 响应 ${res.status}`,
        data: body,
      };
    }
    return { ok: true, message: "钉钉授权已断开", data: body.data };
  } catch (err) {
    return {
      ok: false,
      message: `断开钉钉授权失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
