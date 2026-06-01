/**
 * AI 后端供应商配置同步端点
 *
 * POST /api/admin/backend-providers/sync
 *
 * 用途：从 DB 读取最新的 backendProviders 配置，推送到 agent-service
 * 场景：
 *   - PUT /api/admin/model-config 推送失败后重试
 *   - agent-service 重启后重新加载
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { readDbConfig } from "@/lib/db-config";
import { pushBackendProvidersToAgent } from "@/lib/agent-providers";

const CONFIG_ID = "model_config";

export async function POST(request: NextRequest) {
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
    const config = readDbConfig(CONFIG_ID);
    const backendProviders = config?.backendProviders;

    if (!backendProviders || !Array.isArray(backendProviders.providers)) {
      return NextResponse.json({
        success: false,
        message: "数据库中没有 backendProviders 配置",
      });
    }

    const result = await pushBackendProvidersToAgent(backendProviders);

    return NextResponse.json({
      success: result.ok,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error("[API] Failed to sync backend providers:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "同步失败" },
      },
      { status: 500 },
    );
  }
}
