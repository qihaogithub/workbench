/**
 * 模型配置 API
 *
 * GET  - 获取当前模型配置
 * PUT  - 更新模型配置
 *
 * 配置存储在 SQLite system_configs 表中
 * 支持动态读取,无需重启服务
 *
 * 配置结构支持两种模式:
 * - 新结构: enabledModels(有序启用列表) + autoEnableRules(自动启用规则)
 * - 旧结构: allowedPrefixes + blacklist + defaultModelIds + nameFilters
 * 提交任意一种模式,服务端会自动同步另一种以保持兼容
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { syncBackendProvidersConfigToAgent } from "@/lib/backend-providers-sync";
import { readDbConfig, writeDbConfig } from "@/lib/db-config";
import { invalidateConfigCache } from "@/lib/model-config";
import { getModelEnvConfig } from "@/lib/runtime-config";

const CONFIG_ID = "model_config";

/**
 * 默认配置结构 (从环境变量初始化)
 */
function getDefaultConfig() {
  const { allowedPrefixes, nameFilters, defaultModelIds, blacklist } =
    getModelEnvConfig();

  return {
    frontend: {
      enabledModels: defaultModelIds,
      autoEnableRules: [
        ...allowedPrefixes.map((v) => ({ type: "prefix" as const, value: v })),
        ...nameFilters.map((v) => ({ type: "nameFilter" as const, value: v })),
      ],
      allowedPrefixes,
      blacklist,
      defaultModelIds,
      nameFilters,
    },
    multimodalModels: [] as string[],
    lastSyncedToEnv: Date.now(),
  };
}

/**
 * 根据提交的前端配置自动同步新旧结构
 *
 * - 如果提交的是新结构(enabledModels/autoEnableRules),生成旧字段
 * - 如果提交的是旧结构,生成新字段
 * - 两者都提交时,以新结构为准
 */
function normalizeSubmittedFrontend(frontend: Record<string, any>): {
  enabledModels: string[];
  autoEnableRules: Array<{ type: "prefix" | "nameFilter"; value: string }>;
  allowedPrefixes: string[];
  blacklist: string[];
  defaultModelIds: string[];
  nameFilters: string[];
} {
  const enabledModels: string[] | undefined = Array.isArray(
    frontend.enabledModels,
  )
    ? frontend.enabledModels.filter((s: unknown) => typeof s === "string")
    : undefined;
  const autoEnableRules:
    | Array<{ type: "prefix" | "nameFilter"; value: string }>
    | undefined = Array.isArray(frontend.autoEnableRules)
    ? frontend.autoEnableRules.filter(
        (r: unknown) =>
          typeof r === "object" &&
          r !== null &&
          "type" in r &&
          "value" in r &&
          typeof (r as { value: unknown }).value === "string",
      )
    : undefined;

  let allowedPrefixes: string[] = Array.isArray(frontend.allowedPrefixes)
    ? frontend.allowedPrefixes.filter((s: unknown) => typeof s === "string")
    : [];
  let blacklist: string[] = Array.isArray(frontend.blacklist)
    ? frontend.blacklist.filter((s: unknown) => typeof s === "string")
    : [];
  let defaultModelIds: string[] = Array.isArray(frontend.defaultModelIds)
    ? frontend.defaultModelIds.filter((s: unknown) => typeof s === "string")
    : [];
  let nameFilters: string[] = Array.isArray(frontend.nameFilters)
    ? frontend.nameFilters.filter((s: unknown) => typeof s === "string")
    : [];

  // 新结构 → 旧结构
  if (enabledModels && enabledModels.length > 0 && !defaultModelIds.length) {
    defaultModelIds = [...enabledModels];
  }
  if (autoEnableRules && autoEnableRules.length > 0) {
    const prefixValues = autoEnableRules
      .filter((r) => r.type === "prefix")
      .map((r) => r.value);
    const nameValues = autoEnableRules
      .filter((r) => r.type === "nameFilter")
      .map((r) => r.value);
    if (prefixValues.length > 0 && !allowedPrefixes.length) {
      allowedPrefixes = prefixValues;
    }
    if (nameValues.length > 0 && !nameFilters.length) {
      nameFilters = nameValues;
    }
  }

  // 旧结构 → 新结构
  const finalEnabledModels =
    enabledModels && enabledModels.length > 0
      ? enabledModels
      : [...defaultModelIds];
  const finalAutoEnableRules = autoEnableRules ?? [
    ...allowedPrefixes.map((v) => ({ type: "prefix" as const, value: v })),
    ...nameFilters.map((v) => ({ type: "nameFilter" as const, value: v })),
  ];

  return {
    enabledModels: finalEnabledModels,
    autoEnableRules: finalAutoEnableRules,
    allowedPrefixes,
    blacklist,
    defaultModelIds,
    nameFilters,
  };
}

/**
 * GET /api/admin/model-config
 * 获取当前模型配置
 */
export async function GET(request: NextRequest) {
  // 验证 Admin 权限
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "未授权访问" },
      },
      { status: 401 },
    );
  }

  try {
    // 从数据库读取配置
    let config = readDbConfig(CONFIG_ID);

    // 如果数据库中没有配置,返回环境变量默认值
    if (!config) {
      config = getDefaultConfig();
    }

    return NextResponse.json({
      success: true,
      data: config,
    });
  } catch (error) {
    console.error("[API] Failed to read model config:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "读取配置失败" },
      },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/admin/model-config
 * 更新模型配置
 */
export async function PUT(request: NextRequest) {
  // 验证 Admin 权限
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "未授权访问" },
      },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();

    // 支持部分更新: frontend 和 backendProviders 都不是必填
    // 单独更新任一字段时,保留 DB 中其他字段不变
    if (body.frontend !== undefined && (typeof body.frontend !== "object" || body.frontend === null)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONFIG",
            message: "frontend 字段必须是对象",
          },
        },
        { status: 400 },
      );
    }
    if (body.backendProviders !== undefined && (typeof body.backendProviders !== "object" || body.backendProviders === null)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONFIG",
            message: "backendProviders 字段必须是对象",
          },
        },
        { status: 400 },
      );
    }
    if (body.frontend === undefined && body.backendProviders === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONFIG",
            message: "请求体至少需要包含 frontend 或 backendProviders 字段之一",
          },
        },
        { status: 400 },
      );
    }

    // 合并配置 (保留已有配置的其他字段)
    const existingConfig = readDbConfig(CONFIG_ID) || {};
    const updatedConfig: Record<string, any> = {
      ...existingConfig,
      ...body,
      lastSyncedToEnv: Date.now(),
    };

    // 单独处理 frontend:提交时规范化新旧结构,缺失时不覆盖
    if (body.frontend !== undefined) {
      const normalizedFrontend = normalizeSubmittedFrontend(body.frontend);
      updatedConfig.frontend = {
        ...(existingConfig.frontend || {}),
        ...body.frontend,
        ...normalizedFrontend,
      };
    }

    // 单独处理 multimodalModels
    if (Array.isArray(body.multimodalModels)) {
      updatedConfig.multimodalModels = body.multimodalModels;
    }

    // 当保存 backendProviders 时，自动将供应商 ID 前缀同步到 frontend.autoEnableRules
    // 确保新添加的供应商模型不会被前端白名单过滤掉
    if (body.backendProviders !== undefined) {
      const providers = body.backendProviders.providers || [];
      const providerPrefixes = providers
        .filter((p: { enabled?: boolean }) => p.enabled !== false)
        .map((p: { id: string }) => `${p.id}/`);

      if (providerPrefixes.length > 0) {
        const existingFrontend = updatedConfig.frontend || {};
        const existingRules: Array<{ type: string; value: string }> =
          Array.isArray(existingFrontend.autoEnableRules)
            ? existingFrontend.autoEnableRules
            : [];

        // 收集已有的前缀规则值
        const existingPrefixValues = new Set(
          existingRules
            .filter((r) => r.type === "prefix")
            .map((r) => r.value),
        );

        // 添加缺失的供应商前缀规则
        const newRules = providerPrefixes
          .filter((prefix: string) => !existingPrefixValues.has(prefix))
          .map((prefix: string) => ({ type: "prefix" as const, value: prefix }));

        if (newRules.length > 0) {
          const allRules = [...existingRules, ...newRules];
          updatedConfig.frontend = {
            ...existingFrontend,
            autoEnableRules: allRules,
            // 同步旧结构
            allowedPrefixes: allRules
              .filter((r) => r.type === "prefix")
              .map((r) => r.value),
          };
        }
      }
    }

    // 写入数据库
    writeDbConfig(CONFIG_ID, updatedConfig, "admin");

    // 清除缓存,使配置立即生效
    invalidateConfigCache();

    // 如果包含 backendProviders 字段,推送到 agent-service
    let pushResult: { ok: boolean; message: string } | null = null;
    if (updatedConfig.backendProviders !== undefined) {
      pushResult = await syncBackendProvidersConfigToAgent(
        updatedConfig.backendProviders,
        "save",
        { scheduleRetryOnFailure: true },
      );
    }

    return NextResponse.json({
      success: true,
      message: "配置已保存",
      data: updatedConfig,
      agentPushResult: pushResult,
    });
  } catch (error) {
    console.error("[API] Failed to update model config:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "保存配置失败" },
      },
      { status: 500 },
    );
  }
}
