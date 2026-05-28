/**
 * 模型配置 API
 *
 * GET  - 获取当前模型配置
 * PUT  - 更新模型配置
 *
 * 配置存储在 SQLite system_configs 表中
 * 支持动态读取,无需重启服务
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
  return {
    frontend: {
      allowedPrefixes: (process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      blacklist: (process.env.NEXT_PUBLIC_MODEL_BLACKLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      defaultModelIds: (process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      nameFilters: (process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    },
    multimodalModels: [] as string[],
    lastSyncedToEnv: Date.now(),
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

    // 合并配置 (保留已有配置的其他字段)
    const existingConfig = readDbConfig(CONFIG_ID) || {};
    const updatedConfig = {
      ...existingConfig,
      ...body,
      frontend: {
        ...existingConfig.frontend,
        ...body.frontend,
      },
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
