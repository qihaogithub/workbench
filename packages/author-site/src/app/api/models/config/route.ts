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
import { getModelConfig } from "@/lib/model-config";

export async function GET() {
  try {
    const config = await getModelConfig();

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
