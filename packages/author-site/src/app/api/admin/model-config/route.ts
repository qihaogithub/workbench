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
import { readDbConfig, writeDbConfig } from "@/lib/db-config";
import { invalidateConfigCache } from "@/lib/model-config";

const CONFIG_ID = "model_config";

/**
 * 默认配置结构 (从环境变量初始化)
 */
function getDefaultConfig() {
  const allowedPrefixes = (process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const nameFilters = (process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultModelIds = (process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    frontend: {
      enabledModels: defaultModelIds,
      autoEnableRules: [
        ...allowedPrefixes.map((v) => ({ type: "prefix" as const, value: v })),
        ...nameFilters.map((v) => ({ type: "nameFilter" as const, value: v })),
      ],
      allowedPrefixes,
      blacklist: (process.env.NEXT_PUBLIC_MODEL_BLACKLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
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

    // 验证配置结构
    if (!body.frontend || typeof body.frontend !== "object") {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_CONFIG",
            message: "配置结构无效: 缺少 frontend 字段",
          },
        },
        { status: 400 },
      );
    }

    // 规范化提交的前端配置,自动同步新旧结构
    const normalizedFrontend = normalizeSubmittedFrontend(body.frontend);

    // 合并配置 (保留已有配置的其他字段)
    const existingConfig = readDbConfig(CONFIG_ID) || {};
    const updatedConfig = {
      ...existingConfig,
      ...body,
      frontend: {
        ...(existingConfig.frontend || {}),
        ...body.frontend,
        ...normalizedFrontend,
      },
      multimodalModels: Array.isArray(body.multimodalModels)
        ? body.multimodalModels
        : existingConfig.multimodalModels || [],
      lastSyncedToEnv: Date.now(),
    };

    // 写入数据库
    writeDbConfig(CONFIG_ID, updatedConfig, "admin");

    // 清除缓存,使配置立即生效
    invalidateConfigCache();

    return NextResponse.json({
      success: true,
      message: "配置已保存",
      data: updatedConfig,
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
