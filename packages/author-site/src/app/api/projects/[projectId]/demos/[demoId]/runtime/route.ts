import { NextRequest, NextResponse } from "next/server";
import path from "path";
import type {
  DemoPageRuntimeType,
  PrototypePageMeta,
} from "@opencode-workbench/shared";
import type { RuntimeValidationResult } from "@opencode-workbench/project-core";

import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  createApiError,
  createApiSuccess,
  findWorkspacePath,
  getDemoDirPath,
  getProjectConfigSchema,
  getSessionMeta,
  getWorkspaceDemoPageFiles,
  isSessionExpired,
  listDemoPages,
  projectExists,
  readDemoPageMeta,
  sessionExists,
  updateWorkspaceDemoFiles,
  writeDemoPageMeta,
} from "@/lib/fs-utils";
import { getProjectAdminService } from "@/lib/project-admin-service";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import fs from "fs";

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; demoId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "未登录"), {
        status: 401,
      });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError("UNAUTHORIZED", "登录已过期"), {
        status: 401,
      });
    }

    const { projectId, demoId } = params;
    if (!projectExists(projectId)) {
      return NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      });
    }

    const body = await request.json().catch(() => ({}));
    const {
      sessionId,
      targetRuntimeType,
      code,
      schema,
      prototypeHtml,
      prototypeCss,
      prototypeMeta,
    } = body as {
      sessionId?: string;
      targetRuntimeType?: DemoPageRuntimeType;
      code?: string;
      schema?: string;
      prototypeHtml?: string;
      prototypeCss?: string;
      prototypeMeta?: unknown;
    };

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 参数必填"),
        { status: 400 },
      );
    }
    if (
      targetRuntimeType !== "prototype-html-css" &&
      targetRuntimeType !== "high-fidelity-react"
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "targetRuntimeType 不合法"),
        { status: 400 },
      );
    }
    if (code !== undefined && typeof code !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code 必须为字符串"),
        { status: 400 },
      );
    }
    if (schema !== undefined && typeof schema !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "schema 必须为字符串"),
        { status: 400 },
      );
    }
    if (prototypeHtml !== undefined && typeof prototypeHtml !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "prototypeHtml 必须为字符串"),
        { status: 400 },
      );
    }
    if (prototypeCss !== undefined && typeof prototypeCss !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "prototypeCss 必须为字符串"),
        { status: 400 },
      );
    }

    if (!sessionExists(sessionId)) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }

    const meta = getSessionMeta(sessionId);
    if (!meta) {
      return NextResponse.json(createApiError("SESSION_NOT_FOUND"), {
        status: 404,
      });
    }
    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权操作其他用户的 Session"),
        { status: 403 },
      );
    }
    if (meta.demoId !== projectId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sessionId 与 projectId 不匹配"),
        { status: 400 },
      );
    }
    if (isSessionExpired(meta)) {
      return NextResponse.json(createApiError("SESSION_EXPIRED"), {
        status: 410,
      });
    }
    if (!meta.workspaceId) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "Session 未绑定 workspaceId"),
        { status: 400 },
      );
    }

    const wsPath = findWorkspacePath(meta.workspaceId);
    if (!wsPath) {
      return NextResponse.json(
        createApiError("FILE_READ_ERROR", "工作空间路径不存在"),
        { status: 500 },
      );
    }
    const demoDir = getDemoDirPath(wsPath, demoId);
    if (!fs.existsSync(demoDir)) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }
    if (typeof schema === "string") {
      const allDemoPages = listDemoPages(wsPath);
      const pageSchemas: Record<string, string> = {};
      for (const page of allDemoPages) {
        if (page.id === demoId) {
          pageSchemas[page.id] = schema;
          continue;
        }
        const otherSchemaPath = path.join(
          getDemoDirPath(wsPath, page.id),
          "config.schema.json",
        );
        if (fs.existsSync(otherSchemaPath)) {
          pageSchemas[page.id] = fs.readFileSync(otherSchemaPath, "utf-8");
        }
      }
      if (!(demoId in pageSchemas)) {
        pageSchemas[demoId] = schema;
      }

      const conflictResult = validateNoSchemaConflictFromStrings(
        getProjectConfigSchema(wsPath),
        pageSchemas,
      );
      if (!conflictResult.ok) {
        return NextResponse.json(
          createApiError(
            "SCHEMA_CONFLICT",
            "页面 Schema 字段与项目级配置冲突",
            { conflicts: conflictResult.conflicts },
          ),
          { status: 400 },
        );
      }
    }

    const currentMeta = readDemoPageMeta(wsPath, demoId);
    const currentFiles = getWorkspaceDemoPageFiles(meta.workspaceId, demoId);
    if (!currentMeta || !currentFiles) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }
    const nextFiles = {
      ...currentFiles,
      code: code ?? currentFiles.code,
      schema: schema ?? currentFiles.schema,
      prototypeHtml: prototypeHtml ?? currentFiles.prototypeHtml,
      prototypeCss: prototypeCss ?? currentFiles.prototypeCss,
      prototypeMeta: (prototypeMeta as PrototypePageMeta | undefined) ?? currentFiles.prototypeMeta,
    };
    const runtimeValidation: RuntimeValidationResult =
      getProjectAdminService().validateDemoPageFilesRuntime(
        demoId,
        targetRuntimeType,
        nextFiles,
      );
    if (!runtimeValidation.ok) {
      return NextResponse.json(
        createApiError(
          "VALIDATION_ERROR",
          "页面类型切换校验失败，已保留原页面内容",
          { runtimeValidation },
        ),
        { status: 422 },
      );
    }

    const success = updateWorkspaceDemoFiles(meta.workspaceId, demoId, {
      code: targetRuntimeType === "high-fidelity-react" ? nextFiles.code : undefined,
      schema,
      prototypeHtml: targetRuntimeType === "prototype-html-css" ? nextFiles.prototypeHtml : undefined,
      prototypeCss: targetRuntimeType === "prototype-html-css" ? nextFiles.prototypeCss : undefined,
      prototypeMeta: targetRuntimeType === "prototype-html-css" ? nextFiles.prototypeMeta : undefined,
    });
    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
        { status: 500 },
      );
    }
    const updatedMeta = writeDemoPageMeta(wsPath, demoId, {
      runtimeType: targetRuntimeType,
    });

    return NextResponse.json(createApiSuccess({
      meta: updatedMeta,
      runtimeValidation,
    }));
  } catch (error) {
    console.error("Error switching demo page runtime:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "切换页面类型失败"),
      { status: 500 },
    );
  }
}
