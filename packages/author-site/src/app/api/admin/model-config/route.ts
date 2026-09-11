/**
 * 管理员模型配置 API。
 *
 * frontend policy 是严格 canonical 结构：
 * enabledModels、autoEnableRules、excludedModels。
 * 数据库写入时只保留当前契约字段，不再生成历史字段或历史同步结构。
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { pushImageGenConfig } from "@/lib/agent-providers";
import { syncBackendProvidersConfigToAgent } from "@/lib/backend-providers-sync";
import { readDbConfig, writeDbConfig } from "@/lib/db-config";
import {
  sanitizeModelConfig,
  sealModelConfig,
} from "@/lib/global-model-secrets";
import {
  DEFAULT_IMAGE_GEN_CONFIG,
  getModelConfig,
  invalidateConfigCache,
  normalizeFrontendModelConfig,
  type AutoEnableRule,
  type FrontendModelConfig,
  type ImageGenConfig,
  type ModelConfigData,
} from "@/lib/model-config";

const CONFIG_ID = "model_config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSubmittedFrontend(value: unknown): FrontendModelConfig {
  if (!isRecord(value)) throw new TypeError("frontend 字段必须是对象");
  const keys = Object.keys(value);
  const allowed = new Set(["enabledModels", "autoEnableRules", "excludedModels"]);
  const unsupported = keys.find((key) => !allowed.has(key));
  if (unsupported) {
    throw new TypeError(`frontend 不支持字段: ${unsupported}`);
  }
  for (const key of allowed) {
    if (!(key in value)) throw new TypeError(`frontend.${key} 字段必填`);
  }
  return normalizeFrontendModelConfig(value);
}

function normalizeImageGen(value: unknown, existing: unknown): ImageGenConfig {
  if (!isRecord(value)) throw new TypeError("imageGen 字段必须是对象");
  const merged = {
    ...DEFAULT_IMAGE_GEN_CONFIG,
    ...(isRecord(existing) ? existing : {}),
    ...value,
  } as ImageGenConfig;

  // 空 key 表示保留已有值；具体密文格式由后续密钥收敛阶段负责。
  if (value.apiKey === "" && isRecord(existing) && typeof existing.apiKey === "string") {
    merged.apiKey = existing.apiKey;
  }
  const profiles = new Set(["auto", "gpt-image", "dall-e-3", "generation-only"]);
  if (!profiles.has(merged.apiProfile)) {
    throw new TypeError("imageGen.apiProfile 不受支持");
  }
  return merged;
}

function addProviderRules(
  frontend: FrontendModelConfig,
  backendProviders: ModelConfigData["backendProviders"],
): FrontendModelConfig {
  if (!backendProviders) return frontend;
  const rules = [...frontend.autoEnableRules];
  const seen = new Set(
    rules
      .filter((rule) => rule.type === "prefix")
      .map((rule) => rule.value),
  );
  for (const provider of backendProviders.providers) {
    if (provider.enabled === false || !provider.id.trim()) continue;
    const value = `${provider.id.trim()}/`;
    if (!seen.has(value)) {
      rules.push({ type: "prefix", value });
      seen.add(value);
    }
  }
  return { ...frontend, autoEnableRules: rules as AutoEnableRule[] };
}

function normalizeSubmittedBackendProviders(
  value: Record<string, unknown>,
  existing: ModelConfigData["backendProviders"],
): NonNullable<ModelConfigData["backendProviders"]> {
  if (!Array.isArray(value.providers)) {
    throw new TypeError("backendProviders.providers 必须是数组");
  }
  const existingById = new Map(
    (existing?.providers ?? []).map((provider) => [provider.id, provider]),
  );
  const providers = value.providers.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string") {
      throw new TypeError("backendProviders provider.id 必填");
    }
    const { hasApiKey: _hasApiKey, ...provider } = item;
    const submittedApiKey =
      typeof provider.apiKey === "string" ? provider.apiKey.trim() : "";
    return {
      ...provider,
      apiKey: submittedApiKey || existingById.get(item.id)?.apiKey || "",
    } as NonNullable<ModelConfigData["backendProviders"]>["providers"][number];
  });
  return {
    providers,
    activeProviderId:
      typeof value.activeProviderId === "string" ? value.activeProviderId : undefined,
    activeModelId:
      typeof value.activeModelId === "string" ? value.activeModelId : undefined,
  };
}

async function readCanonicalConfig(): Promise<ModelConfigData> {
  const config = await getModelConfig();
  // getModelConfig 已将 DB 中的 frontend 归一化，并在缺失 DB 时提供完整 env fallback。
  return {
    frontend: config.frontend,
    ...(config.backendProviders ? { backendProviders: config.backendProviders } : {}),
    ...(config.imageGen ? { imageGen: config.imageGen } : {}),
  };
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  try {
    const config = await readCanonicalConfig();
    return NextResponse.json({ success: true, data: sanitizeModelConfig(config) });
  } catch (error) {
    console.error("[API] Failed to read model config:", error);
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "读取配置失败" } },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) throw new TypeError("请求体必须是对象");

    const allowedFields = new Set(["frontend", "backendProviders", "imageGen"]);
    const unsupported = Object.keys(body).find((key) => !allowedFields.has(key));
    if (unsupported) throw new TypeError(`不支持的配置字段: ${unsupported}`);
    if (!("frontend" in body || "backendProviders" in body || "imageGen" in body)) {
      throw new TypeError("请求体至少需要包含 frontend、backendProviders 或 imageGen 字段之一");
    }

    const existing = await readCanonicalConfig();
    const frontend = body.frontend === undefined
      ? existing.frontend
      : normalizeSubmittedFrontend(body.frontend);

    let backendProviders = existing.backendProviders;
    if (body.backendProviders !== undefined) {
      if (!isRecord(body.backendProviders)) throw new TypeError("backendProviders 必须是对象");
      // backendProviders 是完整 snapshot，不能与旧 snapshot 做 partial merge。
      backendProviders = normalizeSubmittedBackendProviders(
        body.backendProviders,
        existing.backendProviders,
      );
    }

    let imageGen = existing.imageGen;
    if (body.imageGen !== undefined) {
      imageGen = normalizeImageGen(body.imageGen, existing.imageGen);
    }

    const updatedConfig: ModelConfigData = {
      frontend: addProviderRules(frontend, backendProviders),
      ...(backendProviders ? { backendProviders } : {}),
      ...(imageGen ? { imageGen } : {}),
    };

    const sealedConfig = sealModelConfig(
      updatedConfig,
      readDbConfig(CONFIG_ID) ?? undefined,
    );
    writeDbConfig(
      CONFIG_ID,
      { ...sealedConfig, lastSyncedToEnv: Date.now() },
      "admin",
    );
    invalidateConfigCache();

    let pushResult: { ok: boolean; message: string } | null = null;
    if (body.backendProviders !== undefined && backendProviders) {
      pushResult = await syncBackendProvidersConfigToAgent(
        backendProviders,
        "save",
        { scheduleRetryOnFailure: true },
      );
    }

    let imageGenPushResult: { ok: boolean; message: string } | null = null;
    if (body.imageGen !== undefined && imageGen) {
      imageGenPushResult = await pushImageGenConfig(imageGen);
    }

    return NextResponse.json({
      success: true,
      message: "配置已保存",
      data: sanitizeModelConfig(updatedConfig),
      agentPushResult: pushResult,
      imageGenPushResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存配置失败";
    const isInvalid = error instanceof TypeError;
    console.error("[API] Failed to update model config:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: isInvalid ? "INVALID_CONFIG" : "INTERNAL_ERROR", message },
      },
      { status: isInvalid ? 400 : 500 },
    );
  }
}
