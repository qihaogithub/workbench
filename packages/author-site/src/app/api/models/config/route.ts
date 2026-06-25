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
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { getModelConfig } from "@/lib/model-config";
import { readUserBackendProvidersConfig } from "@/lib/user-model-config";

export async function GET() {
  try {
    const config = JSON.parse(JSON.stringify(await getModelConfig())) as Awaited<
      ReturnType<typeof getModelConfig>
    >;
    const token = getAuthCookie();
    const payload = token ? await verifyToken(token) : null;
    const userProviders = payload
      ? readUserBackendProvidersConfig(payload.userId)
      : null;

    if (userProviders?.providers.length) {
      const providerPrefixes = userProviders.providers
        .filter((provider) => provider.enabled !== false)
        .map((provider) => `${provider.id}/`);
      const existingRules = config.frontend.autoEnableRules || [];
      const existingPrefixValues = new Set(
        existingRules
          .filter((rule) => rule.type === "prefix")
          .map((rule) => rule.value),
      );
      const newRules = providerPrefixes
        .filter((prefix) => !existingPrefixValues.has(prefix))
        .map((prefix) => ({ type: "prefix" as const, value: prefix }));

      config.frontend = {
        ...config.frontend,
        autoEnableRules: [...existingRules, ...newRules],
        allowedPrefixes: Array.from(
          new Set([...(config.frontend.allowedPrefixes || []), ...providerPrefixes]),
        ),
      };
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
        error: { code: "INTERNAL_ERROR", message: "读取模型配置失败" },
      },
      { status: 500 },
    );
  }
}
