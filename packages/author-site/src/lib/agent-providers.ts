/**
 * agent-service 配置同步工具
 *
 * 用途：author-side 修改 backendProviders 后，调用此模块推送到 agent-service
 * 鉴权：使用 .env 中的 INTERNAL_API_TOKEN（与 agent-service 共享）
 */

import type {
  BackendProvidersConfig,
  SystemKnowledgeSnapshot,
} from "@opencode-workbench/shared";

const AGENT_SERVICE_URL =
  process.env.AGENT_SERVICE_URL || "http://localhost:3201";
const INTERNAL_TOKEN =
  process.env.INTERNAL_API_TOKEN ||
  (process.env.NODE_ENV === "production" ? "" : "dev-internal-token");

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
  if (!INTERNAL_TOKEN) {
    return {
      ok: false,
      message:
        "INTERNAL_API_TOKEN 未配置（.env），无法推送配置到 agent-service",
    };
  }

  try {
    const res = await fetch(`${AGENT_SERVICE_URL}/internal/backend-providers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": INTERNAL_TOKEN,
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
  if (!INTERNAL_TOKEN) {
    return { ok: false, message: "INTERNAL_API_TOKEN 未配置" };
  }

  try {
    const res = await fetch(`${AGENT_SERVICE_URL}/internal/backend-providers`, {
      method: "GET",
      headers: {
        "X-Internal-Token": INTERNAL_TOKEN,
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
  if (!INTERNAL_TOKEN) {
    return {
      ok: false,
      message:
        "INTERNAL_API_TOKEN 未配置（.env），无法推送用户模型配置到 agent-service",
    };
  }

  try {
    const res = await fetch(
      `${AGENT_SERVICE_URL}/internal/sessions/${encodeURIComponent(sessionId)}/model-config`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": INTERNAL_TOKEN,
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

export async function pushSystemKnowledgeToAgent(
  snapshot: SystemKnowledgeSnapshot,
): Promise<PushResult> {
  if (!INTERNAL_TOKEN) {
    return {
      ok: false,
      message:
        "INTERNAL_API_TOKEN 未配置（.env），无法推送知识库到 agent-service",
    };
  }

  try {
    const res = await fetch(`${AGENT_SERVICE_URL}/internal/knowledge-documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": INTERNAL_TOKEN,
      },
      body: JSON.stringify(snapshot),
    });

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
      message: `已推送知识库到 agent-service（${snapshot.documents.length} 篇）`,
      data: body,
    };
  } catch (err) {
    return {
      ok: false,
      message: `推送失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
