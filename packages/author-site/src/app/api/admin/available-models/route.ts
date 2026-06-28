/**
 * 可用模型列表 API (管理后台专用)
 *
 * GET /api/admin/available-models
 *
 * 代理请求 agent-service 的 GET /models 端点
 * 返回与编辑页相同数据源的模型列表，供管理后台配置页使用
 * 需要 admin 权限
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { getServerAgentServiceUrl } from "@/lib/runtime-config";

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
    // HTTP 调用，给予 10s 超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${getServerAgentServiceUrl()}/models`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Agent service responded ${res.status}: ${text}`);
    }

    const body = await res.json();

    return NextResponse.json({
      success: true,
      data: body.data || { models: [], currentModelId: null, canSwitch: false },
    });
  } catch (error) {
    console.error("[API] Failed to fetch available models:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "GET_MODELS_ERROR",
          message: error instanceof Error ? error.message : "获取模型列表失败",
        },
        data: { models: [], currentModelId: null, canSwitch: false },
      },
      { status: 502 },
    );
  }
}
