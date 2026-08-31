import { NextRequest, NextResponse } from "next/server";

import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { findUserById } from "@/lib/user";
import { getProjectPath, listDemoPages, projectExists } from "@/lib/fs-utils";
import path from "path";
import {
  applyVisualConfiguration,
  type VisualConfigTarget,
} from "@/lib/visual-configurator";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import type { VisualNodeInfo } from "@workbench/demo-ui";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      code?: unknown;
      schema?: unknown;
      projectConfigSchema?: unknown;
      demoId?: unknown;
      node?: unknown;
      target?: unknown;
      projectId?: unknown;
    };

    const token = await getAuthCookie();
    const auth = token ? await verifyToken(token) : null;
    if (!auth) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), { status: 401 });
    }
    const user = findUserById(auth.userId);
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const demoId = typeof body.demoId === "string" ? body.demoId : "";
    if (!projectId || !demoId || !projectExists(projectId)) {
      return NextResponse.json(createApiError("INVALID_REQUEST", "projectId 和 demoId 必须有效"), { status: 400 });
    }
    const page = listDemoPages(path.join(getProjectPath(projectId), "workspace")).find((item) => item.id === demoId);
    if (!page) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND", "页面不存在"), { status: 404 });
    }
    if ((user as { role?: string } | null)?.role !== "admin" && (page as { isTemplatePage?: boolean }).isTemplatePage) {
      return NextResponse.json(createApiError("FORBIDDEN", "编辑者不能对模板页使用可视化配置"), { status: 403 });
    }

    if (typeof body.code !== "string" || typeof body.schema !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code 和 schema 必须为字符串"),
        { status: 400 },
      );
    }
    if (!isVisualNodeInfo(body.node)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "node 参数无效"),
        { status: 400 },
      );
    }
    if (!isVisualConfigTarget(body.target)) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "target 参数无效"),
        { status: 400 },
      );
    }

    const result = applyVisualConfiguration({
      code: body.code,
      schema: body.schema,
      node: body.node,
      target: body.target,
    });

    if (!result.ok) {
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", result.error),
        { status: 400 },
      );
    }

    const projectConfigSchema =
      typeof body.projectConfigSchema === "string"
        ? body.projectConfigSchema
        : undefined;
    const conflictResult = validateNoSchemaConflictFromStrings(
      projectConfigSchema,
      { [demoId]: result.schema },
    );

    if (!conflictResult.ok) {
      return NextResponse.json(
        createApiError("SCHEMA_CONFLICT", "新增字段与项目级配置冲突", {
          conflicts: conflictResult.conflicts,
        }),
        { status: 400 },
      );
    }

    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : "添加配置项失败";
    return NextResponse.json(
      createApiError("VALIDATION_ERROR", message),
      { status: 500 },
    );
  }
}

function isVisualNodeInfo(value: unknown): value is VisualNodeInfo {
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<VisualNodeInfo>;
  return (
    typeof node.nodeId === "string" &&
    typeof node.tagName === "string" &&
    typeof node.domPath === "string" &&
    !!node.rect &&
    typeof node.rect === "object" &&
    Array.isArray(node.editCapabilities)
  );
}

function isVisualConfigTarget(value: unknown): value is VisualConfigTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<VisualConfigTarget>;
  return (
    (target.kind === "text" ||
      target.kind === "image" ||
      target.kind === "color") &&
    typeof target.fieldKey === "string" &&
    typeof target.title === "string" &&
    typeof target.defaultValue === "string" &&
    (target.category === undefined || typeof target.category === "string")
  );
}
