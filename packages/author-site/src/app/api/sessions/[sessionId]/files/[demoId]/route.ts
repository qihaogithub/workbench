import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import {
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  createApiSuccess,
  createApiError,
  findWorkspacePath,
  getWorkspaceDemoPageFiles,
  updateWorkspaceDemoFiles,
  getDemoDirPath,
  getProjectConfigSchema,
  listDemoPages,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import { getProjectAdminService } from "@/lib/project-admin-service";
import type { PrototypePageMeta } from "@opencode-workbench/shared";
import type { RuntimeValidationResult } from "@opencode-workbench/project-core";

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string; demoId: string } },
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

    const { sessionId, demoId } = params;

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

    const files = getWorkspaceDemoPageFiles(meta.workspaceId, demoId);
    if (!files) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    return NextResponse.json(createApiSuccess(files));
  } catch (error) {
    console.error("Error getting session demo page files:", error);
    return NextResponse.json(
      createApiError("FILE_READ_ERROR", "读取页面文件失败"),
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { sessionId: string; demoId: string } },
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

    const { sessionId, demoId } = params;

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

    const body = await request.json().catch(() => ({}));
    const { code, schema, prototypeHtml, prototypeCss, prototypeMeta } = body as {
      code?: string;
      schema?: string;
      prototypeHtml?: string;
      prototypeCss?: string;
      prototypeMeta?: unknown;
    };

    if (
      code === undefined &&
      schema === undefined &&
      prototypeHtml === undefined &&
      prototypeCss === undefined &&
      prototypeMeta === undefined
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code、schema 或 prototype 字段至少需提供一个"),
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
        } else {
          const otherSchemaPath = path.join(
            getDemoDirPath(wsPath, page.id),
            "config.schema.json",
          );
          if (fs.existsSync(otherSchemaPath)) {
            pageSchemas[page.id] = fs.readFileSync(otherSchemaPath, "utf-8");
          }
        }
      }
      if (!(demoId in pageSchemas)) {
        pageSchemas[demoId] = schema;
      }

      const projectSchemaStr = getProjectConfigSchema(wsPath);
      const conflictResult = validateNoSchemaConflictFromStrings(
        projectSchemaStr,
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

    let runtimeValidation: RuntimeValidationResult | undefined;
    const pageMeta = listDemoPages(wsPath).find((page) => page.id === demoId);
    const isPrototypePage = pageMeta?.runtimeType === "prototype-html-css";
    if (isPrototypePage) {
      const currentFiles = getWorkspaceDemoPageFiles(meta.workspaceId, demoId);
      if (!currentFiles) {
        return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
          status: 404,
        });
      }
      runtimeValidation = getProjectAdminService().validateDemoPageFilesRuntime(
        demoId,
        "prototype-html-css",
        {
          ...currentFiles,
          code: code ?? currentFiles.code,
          schema: schema ?? currentFiles.schema,
          prototypeHtml: prototypeHtml ?? currentFiles.prototypeHtml,
          prototypeCss: prototypeCss ?? currentFiles.prototypeCss,
          prototypeMeta: (prototypeMeta as PrototypePageMeta | undefined) ?? currentFiles.prototypeMeta,
        },
      );
      if (!runtimeValidation.ok) {
        return NextResponse.json(
          createApiError(
            "VALIDATION_ERROR",
            "原型页校验未通过，暂不保存页面文件",
            { runtimeValidation },
          ),
          { status: 422 },
        );
      }
    }

    const success = updateWorkspaceDemoFiles(meta.workspaceId, demoId, {
      code,
      schema,
      prototypeHtml,
      prototypeCss,
      prototypeMeta: prototypeMeta as PrototypePageMeta | undefined,
    });
    if (!success) {
      return NextResponse.json(
        createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
        { status: 500 },
      );
    }

    return NextResponse.json(createApiSuccess(runtimeValidation ? { runtimeValidation } : null));
  } catch (error) {
    console.error("Error updating session demo page files:", error);
    return NextResponse.json(
      createApiError("FILE_WRITE_ERROR", "更新页面文件失败"),
      { status: 500 },
    );
  }
}
