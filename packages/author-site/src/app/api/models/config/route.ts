/**
 * 模型配置公开 API（只读）。
 *
 * 返回按当前登录用户计算的 canonical frontend policy；个人 provider
 * 只会补充当前用户可用模型，不会改变管理员明确的“全部禁用”决定。
 */

import { NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getModelConfig } from "@/lib/model-config";
import { readUserBackendProvidersConfig } from "@/lib/user-model-config";

type ProviderSummary = { id?: string; enabled?: boolean; models?: unknown };

function readRuntimeProviders(): ProviderSummary[] {
  const raw = process.env.PI_AGENT_PROVIDERS?.trim();
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is ProviderSummary =>
            Boolean(item && typeof item === "object"),
        );
      }
    } catch {
      // Invalid provider JSON is reported by agent-service; public config remains readable.
    }
  }

  const provider = process.env.PI_AGENT_PROVIDER?.trim();
  const model = process.env.PI_AGENT_MODEL?.trim();
  return provider && model ? [{ id: provider, enabled: true, models: [model] }] : [];
}

function addRuntimeProviderRules(config: Awaited<ReturnType<typeof getModelConfig>>): void {
  const savedProviders = config.backendProviders?.providers ?? [];
  const providers = savedProviders.length > 0 ? savedProviders : readRuntimeProviders();
  const prefixes = Array.from(
    new Set(
      providers
        .filter((provider) => provider.enabled !== false && provider.id?.trim())
        .map((provider) => `${provider.id!.trim()}/`),
    ),
  );
  if (prefixes.length === 0) return;

  const existing = new Set(
    config.frontend.autoEnableRules
      .filter((rule) => rule.type === "prefix")
      .map((rule) => rule.value),
  );
  for (const value of prefixes) {
    if (!existing.has(value)) {
      config.frontend.autoEnableRules.push({ type: "prefix", value });
      existing.add(value);
    }
  }
}

export async function GET() {
  try {
    const config = JSON.parse(JSON.stringify(await getModelConfig())) as Awaited<
      ReturnType<typeof getModelConfig>
    >;
    const token = await getAuthCookie();
    const payload = token ? await verifyToken(token) : null;

    if (payload) {
      try {
        const userProviders = readUserBackendProvidersConfig(payload.userId);
        const enabledProviders = (userProviders?.providers ?? []).filter(
          (provider) => provider.enabled !== false,
        );
        const userEnabledModels = enabledProviders.flatMap((provider) =>
          provider.models.map((modelId) => `${provider.id}/${modelId}`),
        );

        // enabledModels=[] 是管理员显式禁用全部，个人 provider 不能绕过它。
        if (config.frontend.enabledModels.length > 0) {
          config.frontend.enabledModels = Array.from(
            new Set([...config.frontend.enabledModels, ...userEnabledModels]),
          ).filter((id) => !config.frontend.excludedModels.includes(id));
        }
        const existingPrefixes = new Set(
          config.frontend.autoEnableRules
            .filter((rule) => rule.type === "prefix")
            .map((rule) => rule.value),
        );
        for (const provider of enabledProviders) {
          const value = `${provider.id}/`;
          if (!existingPrefixes.has(value)) {
            config.frontend.autoEnableRules.push({ type: "prefix", value });
            existingPrefixes.add(value);
          }
        }
      } catch (error) {
        // 个人凭据无法解密时仍返回全局 canonical policy。
        console.warn(
          "[API] Ignoring unreadable user model config:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    addRuntimeProviderRules(config);
    // 公开接口只返回 frontend policy，绝不把 backendProviders/imageGen 凭据带到浏览器。
    return NextResponse.json({
      success: true,
      data: { frontend: config.frontend },
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
