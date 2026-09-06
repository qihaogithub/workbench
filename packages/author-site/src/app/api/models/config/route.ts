/**
 * 模型配置公开 API (只读)
 *
 * GET /api/models/config
 *
 * 供前端组件读取模型配置(白名单/黑名单/默认模型/多模态)
 * 无需 admin 权限,但需要用户登录
 *
 * 此端点在服务端运行,安全地读取数据库配置并返回给客户端
 * 避免客户端直接依赖 better-sqlite3 等 Node.js 模块
 */

import { NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getModelConfig } from "@/lib/model-config";
import { readUserBackendProvidersConfig } from "@/lib/user-model-config";

function readRuntimeProviderPrefixes(): string[] {
  const prefixes = new Set<string>();
  const rawProviders = process.env.PI_AGENT_PROVIDERS?.trim();

  if (rawProviders) {
    try {
      const providers = JSON.parse(rawProviders) as unknown;
      if (Array.isArray(providers)) {
        for (const provider of providers) {
          if (
            provider &&
            typeof provider === "object" &&
            typeof (provider as { id?: unknown }).id === "string" &&
            (provider as { enabled?: unknown }).enabled !== false
          ) {
            prefixes.add(`${(provider as { id: string }).id.trim()}/`);
          }
        }
      }
    } catch {
      // The agent service will report an invalid provider configuration. Do
      // not make the public model-config endpoint fail because of it.
    }
  }

  const provider = process.env.PI_AGENT_PROVIDER?.trim();
  if (provider) prefixes.add(`${provider}/`);
  return Array.from(prefixes).filter((prefix) => prefix.length > 1);
}

function addRuntimeProviderRules(config: {
  frontend?: {
    autoEnableRules?: Array<{ type: "prefix" | "nameFilter"; value: string }>;
    allowedPrefixes?: string[];
  };
  backendProviders?: {
    providers?: Array<{ id?: string; enabled?: boolean }>;
  };
}): void {
  const prefixes = new Set<string>();
  for (const provider of config.backendProviders?.providers ?? []) {
    if (provider.enabled !== false && provider.id?.trim()) {
      prefixes.add(`${provider.id.trim()}/`);
    }
  }

  // A saved provider configuration replaces the agent-service env fallback.
  // Only use env prefixes when no enabled saved provider is present.
  if (prefixes.size === 0) {
    for (const prefix of readRuntimeProviderPrefixes()) prefixes.add(prefix);
  }
  if (prefixes.size === 0) return;

  const existingRules = config.frontend?.autoEnableRules ?? [];
  const existingPrefixes = new Set(
    existingRules
      .filter((rule) => rule.type === "prefix")
      .map((rule) => rule.value),
  );
  const newRules = Array.from(prefixes)
    .filter((prefix) => !existingPrefixes.has(prefix))
    .map((value) => ({ type: "prefix" as const, value }));
  if (newRules.length === 0) return;

  const existingAllowedPrefixes = config.frontend?.allowedPrefixes ?? [];
  config.frontend = {
    ...config.frontend,
    autoEnableRules: [...existingRules, ...newRules],
    allowedPrefixes: Array.from(
      new Set([...existingAllowedPrefixes, ...prefixes]),
    ),
  };
}

export async function GET() {
  try {
    const config = JSON.parse(JSON.stringify(await getModelConfig())) as Awaited<
      ReturnType<typeof getModelConfig>
    >;
    const token = await getAuthCookie();
    const payload = token ? await verifyToken(token) : null;
    let userProviders = null;
    if (payload) {
      try {
        userProviders = readUserBackendProvidersConfig(payload.userId);
      } catch (error) {
        // 个人 API Key 使用独立密钥加密；密钥轮换或历史脏数据不应让
        // 全局模型配置接口失败，否则前端会把 agent-service 的模型全部过滤掉。
        console.warn(
          "[API] Ignoring unreadable user model config:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (userProviders?.providers.length) {
      const enabledProviders = userProviders.providers.filter(
        (provider) => provider.enabled !== false,
      );
      const providerPrefixes = enabledProviders.map(
        (provider) => `${provider.id}/`,
      );
      // `enabledModels` 是管理员的精确白名单。将当前用户已保存的
      // 个人模型也并入这份响应，避免模型已由 agent-service 返回后仍被
      // 客户端白名单过滤掉。此响应按登录用户生成，不会泄露给其他用户。
      const userEnabledModels = enabledProviders.flatMap((provider) =>
        provider.models.map((modelId) => `${provider.id}/${modelId}`),
      );
      const existingRules = config.frontend.autoEnableRules || [];
      const existingPrefixValues = new Set(
        existingRules
          .filter((rule) => rule.type === "prefix")
          .map((rule) => rule.value),
      );
      const newRules = providerPrefixes
        .filter((prefix) => !existingPrefixValues.has(prefix))
        .map((prefix) => ({ type: "prefix" as const, value: prefix }));

      config.frontend = {
        ...config.frontend,
        autoEnableRules: [...existingRules, ...newRules],
        allowedPrefixes: Array.from(
          new Set([...(config.frontend.allowedPrefixes || []), ...providerPrefixes]),
        ),
        enabledModels: Array.isArray(config.frontend.enabledModels)
          ? Array.from(
              new Set([
                ...config.frontend.enabledModels,
                ...userEnabledModels,
              ]),
            )
          : config.frontend.enabledModels,
      };
    }

    addRuntimeProviderRules(config);

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("[API] Failed to read model config:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "读取模型配置失败" },
      },
      { status: 500 },
    );
  }
}
