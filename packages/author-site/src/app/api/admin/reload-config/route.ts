/**
 * 配置缓存失效 API
 *
 * POST /api/admin/reload-config
 *
 * 清除配置缓存,使新的配置立即生效
 * 用于管理后台保存配置后强制刷新
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { invalidateConfigCache } from "@/lib/model-config";

export async function POST(request: NextRequest) {
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
    // 清除缓存
    invalidateConfigCache();

    return NextResponse.json({
      success: true,
      message: "配置缓存已清除",
    });
  } catch (error) {
    console.error("[API] Failed to invalidate config cache:", error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "清除缓存失败" },
      },
      { status: 500 },
    );
  }
}
