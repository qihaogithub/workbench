/**
 * AI 后端供应商配置同步端点
 *
 * GET  /api/admin/backend-providers/sync
 * POST /api/admin/backend-providers/sync
 *
 * 用途：读取同步状态，或从 DB 读取最新的 backendProviders 配置并推送到 agent-service
 * 场景：
 *   - PUT /api/admin/model-config 推送失败后重试
 *   - agent-service 重启后重新加载
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import {
  getBackendProvidersSyncStatus,
  syncStoredBackendProvidersToAgent,
} from "@/lib/backend-providers-sync";

export async function GET(request: NextRequest) {
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
    const status = await getBackendProvidersSyncStatus();
    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("[API] Failed to read backend providers sync status:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "读取同步状态失败" },
      },
      { status: 500 },
    );
  }
}

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
    const result = await syncStoredBackendProvidersToAgent("manual", {
      scheduleRetryOnFailure: true,
    });
    const status = await getBackendProvidersSyncStatus();

    return NextResponse.json({
      success: result.ok,
      message: result.message,
      data: result.data,
      syncStatus: status,
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
