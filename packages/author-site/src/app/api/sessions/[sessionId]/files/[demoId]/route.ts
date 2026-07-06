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
import { isSketchSceneAuthoringEnabled } from "@/lib/authoring-feature-flags";
import { appendEditorDiagnosticEvents } from "@/lib/editor-diagnostics/store";
import type { EditorDiagnosticEvent } from "@/lib/editor-diagnostics/types";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import { getProjectAdminService } from "@/lib/project-admin-service";
import {
  applySketchScenePatchOperations,
  parseSketchSceneDocument,
  type PrototypePageMeta,
  type SketchSceneDocument,
  type SketchScenePatchOperation,
} from "@workbench/shared";
import type { RuntimeValidationResult } from "@workbench/project-core";

type SketchPatchPayload = {
  baseSceneKey?: string;
  operations: SketchScenePatchOperation[];
};

type SketchPatchDiagnosticContext = {
  editorSessionId: string;
  traceId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonSketchScene(value: string | undefined): SketchSceneDocument | null {
  if (value === undefined) return null;
  try {
    return parseSketchSceneDocument(JSON.parse(value));
  } catch {
    return null;
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = sortJsonValue(value[key]);
      return output;
    }, {});
}

function normalizeSketchSceneForPatchCompare(scene: SketchSceneDocument): SketchSceneDocument {
  const metadata = scene.metadata ? { ...scene.metadata } : undefined;
  if (metadata) delete metadata.updatedAt;
  return {
    ...scene,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

function parseSketchPatchPayload(value: unknown): SketchPatchPayload | null {
  if (!isRecord(value)) return null;
  const operations = value.operations;
  if (!Array.isArray(operations) || !operations.every(isSketchPatchOperationCandidate)) {
    return null;
  }
  return {
    baseSceneKey: typeof value.baseSceneKey === "string" ? value.baseSceneKey : undefined,
    operations: operations as SketchScenePatchOperation[],
  };
}

function parseSketchPatchDiagnosticContext(
  value: unknown,
): SketchPatchDiagnosticContext | null {
  if (!isRecord(value) || typeof value.editorSessionId !== "string") return null;
  return {
    editorSessionId: value.editorSessionId,
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
  };
}

function countPatchOperations(value: unknown): number | undefined {
  if (!isRecord(value) || !Array.isArray(value.operations)) return undefined;
  return value.operations.length;
}

function createDiagnosticId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function recordSketchPatchDiagnostic(input: {
  context: SketchPatchDiagnosticContext | null;
  projectId: string;
  sessionId: string;
  workspaceId?: string;
  pageId: string;
  eventType: "page.sketch_patch_rejected" | "page.sketch_patch_validated";
  level?: EditorDiagnosticEvent["level"];
  details: Record<string, unknown>;
}): Promise<void> {
  if (!input.context) return;
  const event: EditorDiagnosticEvent = {
    id: createDiagnosticId("evt-sketch-patch"),
    editorSessionId: input.context.editorSessionId,
    projectId: input.projectId,
    sessionId: input.sessionId,
    workspaceId: input.workspaceId,
    activePageId: input.pageId,
    timestamp: Date.now(),
    category: "page",
    name: input.eventType,
    traceId: input.context.traceId,
    level: input.level ?? "info",
    details: input.details,
  };
  try {
    await appendEditorDiagnosticEvents([event]);
  } catch (error) {
    console.warn(
      "[sessions/files] failed to record sketch patch diagnostic",
      error instanceof Error ? error.message : error,
    );
  }
}

function isSketchPatchOperationCandidate(value: unknown): boolean {
  if (!isRecord(value) || typeof value.op !== "string") return false;
  if (value.op === "add") return isRecord(value.node);
  if (value.op === "update") return typeof value.nodeId === "string" && isRecord(value.patch);
  if (value.op === "delete") return typeof value.nodeId === "string";
  if (value.op === "duplicate") {
    return typeof value.nodeId === "string" && typeof value.newNodeId === "string";
  }
  if (value.op === "reorder") {
    return Array.isArray(value.nodeIds) && value.nodeIds.every((nodeId) => typeof nodeId === "string");
  }
  if (value.op === "group") {
    return (
      typeof value.groupId === "string" &&
      Array.isArray(value.nodeIds) &&
      value.nodeIds.every((nodeId) => typeof nodeId === "string") &&
      (value.name === undefined || typeof value.name === "string")
    );
  }
  if (value.op === "ungroup") return typeof value.groupId === "string";
  if (value.op === "set-locked") {
    return Array.isArray(value.nodeIds) && typeof value.locked === "boolean";
  }
  if (value.op === "set-visible") {
    return Array.isArray(value.nodeIds) && typeof value.visible === "boolean";
  }
  if (value.op === "bind") {
    return (
      typeof value.nodeId === "string" &&
      typeof value.property === "string" &&
      typeof value.field === "string"
    );
  }
  if (value.op === "unbind") {
    return typeof value.nodeId === "string" && typeof value.property === "string";
  }
  return false;
}

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

    if (meta.userId && meta.userId !== payload.userId) {
      return NextResponse.json(
        createApiError("FORBIDDEN", "无权访问其他用户的 Session"),
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
    const {
      code,
      schema,
      prototypeHtml,
      prototypeCss,
      prototypeMeta,
      sketchScene,
      sketchMeta,
      sketchPatch,
      diagnosticContext,
    } = body as {
      code?: string;
      schema?: string;
      prototypeHtml?: string;
      prototypeCss?: string;
      prototypeMeta?: unknown;
      sketchScene?: string;
      sketchMeta?: unknown;
      sketchPatch?: unknown;
      diagnosticContext?: unknown;
    };
    const sketchPatchDiagnosticContext =
      parseSketchPatchDiagnosticContext(diagnosticContext);
    let sketchSceneForWrite = sketchScene;

    if (
      code === undefined &&
      schema === undefined &&
      prototypeHtml === undefined &&
      prototypeCss === undefined &&
      prototypeMeta === undefined &&
      sketchScene === undefined &&
      sketchMeta === undefined &&
      sketchPatch === undefined
    ) {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "code、schema、prototype 或 sketch 字段至少需提供一个"),
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
    if (sketchScene !== undefined && typeof sketchScene !== "string") {
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sketchScene 必须为字符串"),
        { status: 400 },
      );
    }
    const parsedSketchPatch =
      sketchPatch === undefined ? null : parseSketchPatchPayload(sketchPatch);
    if (sketchPatch !== undefined && !parsedSketchPatch) {
      await recordSketchPatchDiagnostic({
        context: sketchPatchDiagnosticContext,
        projectId: meta.demoId,
        sessionId,
        workspaceId: meta.workspaceId,
        pageId: demoId,
        eventType: "page.sketch_patch_rejected",
        level: "warn",
        details: {
          reason: "invalid_payload",
          status: "rejected",
          success: false,
          operationCount: countPatchOperations(sketchPatch),
          hasBaseSceneKey: Boolean(
            isRecord(sketchPatch) && typeof sketchPatch.baseSceneKey === "string",
          ),
        },
      });
      return NextResponse.json(
        createApiError("INVALID_REQUEST", "sketchPatch 必须包含合法的 operations"),
        { status: 400 },
      );
    }
    if (
      (sketchScene !== undefined || sketchMeta !== undefined || sketchPatch !== undefined) &&
      !isSketchSceneAuthoringEnabled()
    ) {
      if (sketchPatch !== undefined) {
        await recordSketchPatchDiagnostic({
          context: sketchPatchDiagnosticContext,
          projectId: meta.demoId,
          sessionId,
          workspaceId: meta.workspaceId,
          pageId: demoId,
          eventType: "page.sketch_patch_rejected",
          level: "warn",
          details: {
            reason: "feature_disabled",
            status: "rejected",
            success: false,
            operationCount: parsedSketchPatch?.operations.length,
            hasBaseSceneKey: Boolean(parsedSketchPatch?.baseSceneKey),
          },
        });
      }
      return NextResponse.json(
        createApiError("FORBIDDEN", "手绘页面功能暂未在创作端开放"),
        { status: 403 },
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
    const isSketchPage = pageMeta?.runtimeType === "sketch-scene";
    const currentFiles =
      isPrototypePage || isSketchPage || parsedSketchPatch
        ? getWorkspaceDemoPageFiles(meta.workspaceId, demoId)
        : null;
    if ((isPrototypePage || isSketchPage || parsedSketchPatch) && !currentFiles) {
      return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
        status: 404,
      });
    }

    if (parsedSketchPatch) {
      if (!isSketchPage) {
        await recordSketchPatchDiagnostic({
          context: sketchPatchDiagnosticContext,
          projectId: meta.demoId,
          sessionId,
          workspaceId: meta.workspaceId,
          pageId: demoId,
          eventType: "page.sketch_patch_rejected",
          level: "warn",
          details: {
            reason: "non_sketch_page",
            status: "rejected",
            success: false,
            operationCount: parsedSketchPatch.operations.length,
            hasBaseSceneKey: Boolean(parsedSketchPatch.baseSceneKey),
          },
        });
        return NextResponse.json(
          createApiError("INVALID_REQUEST", "sketchPatch 只能用于手绘页面"),
          { status: 400 },
        );
      }
      const currentSketchScene = parseJsonSketchScene(currentFiles?.sketchScene);
      const clientTargetSketchScene =
        sketchScene === undefined ? null : parseJsonSketchScene(sketchScene);
      if (!currentSketchScene || (sketchScene !== undefined && !clientTargetSketchScene)) {
        await recordSketchPatchDiagnostic({
          context: sketchPatchDiagnosticContext,
          projectId: meta.demoId,
          sessionId,
          workspaceId: meta.workspaceId,
          pageId: demoId,
          eventType: "page.sketch_patch_rejected",
          level: "warn",
          details: {
            reason: "scene_parse_failed",
            status: "rejected",
            success: false,
            operationCount: parsedSketchPatch.operations.length,
            hasBaseSceneKey: Boolean(parsedSketchPatch.baseSceneKey),
            currentNodeCount: currentSketchScene?.nodes.length,
            targetNodeCount: clientTargetSketchScene?.nodes.length,
            targetSource: sketchScene === undefined ? "server_patch" : "client_scene",
          },
        });
        return NextResponse.json(
          createApiError("INVALID_REQUEST", "草图 scene 无法解析，暂不应用 patch"),
          { status: 400 },
        );
      }
      if (
        parsedSketchPatch.baseSceneKey &&
        parsedSketchPatch.baseSceneKey !== stableStringify(currentSketchScene)
      ) {
        await recordSketchPatchDiagnostic({
          context: sketchPatchDiagnosticContext,
          projectId: meta.demoId,
          sessionId,
          workspaceId: meta.workspaceId,
          pageId: demoId,
          eventType: "page.sketch_patch_rejected",
          level: "warn",
          details: {
            reason: "base_scene_mismatch",
            status: "rejected",
            success: false,
            operationCount: parsedSketchPatch.operations.length,
            hasBaseSceneKey: true,
            currentNodeCount: currentSketchScene.nodes.length,
            targetNodeCount: clientTargetSketchScene?.nodes.length,
            targetSource: sketchScene === undefined ? "server_patch" : "client_scene",
          },
        });
        return NextResponse.json(
          createApiError("INVALID_REQUEST", "草图 patch 基线已过期，请重新加载后再保存"),
          { status: 409 },
        );
      }
      const patchedScene = applySketchScenePatchOperations(
        currentSketchScene,
        parsedSketchPatch.operations,
      );
      const targetSketchScene = clientTargetSketchScene ?? patchedScene;
      const targetSource = clientTargetSketchScene ? "client_scene" : "server_patch";
      if (
        clientTargetSketchScene &&
        stableStringify(normalizeSketchSceneForPatchCompare(patchedScene)) !==
        stableStringify(normalizeSketchSceneForPatchCompare(targetSketchScene))
      ) {
        await recordSketchPatchDiagnostic({
          context: sketchPatchDiagnosticContext,
          projectId: meta.demoId,
          sessionId,
          workspaceId: meta.workspaceId,
          pageId: demoId,
          eventType: "page.sketch_patch_rejected",
          level: "warn",
          details: {
            reason: "patch_replay_mismatch",
            status: "rejected",
            success: false,
            operationCount: parsedSketchPatch.operations.length,
            hasBaseSceneKey: Boolean(parsedSketchPatch.baseSceneKey),
            currentNodeCount: currentSketchScene.nodes.length,
            targetNodeCount: targetSketchScene.nodes.length,
            targetSource,
          },
        });
        return NextResponse.json(
          createApiError("INVALID_REQUEST", "草图 patch 回放结果与提交 scene 不一致"),
          { status: 409 },
        );
      }
      await recordSketchPatchDiagnostic({
        context: sketchPatchDiagnosticContext,
        projectId: meta.demoId,
        sessionId,
        workspaceId: meta.workspaceId,
        pageId: demoId,
        eventType: "page.sketch_patch_validated",
        details: {
          status: "validated",
          success: true,
          operationCount: parsedSketchPatch.operations.length,
          hasBaseSceneKey: Boolean(parsedSketchPatch.baseSceneKey),
          currentNodeCount: currentSketchScene.nodes.length,
          targetNodeCount: targetSketchScene.nodes.length,
          targetSource,
        },
      });
      sketchSceneForWrite = clientTargetSketchScene
        ? sketchScene
        : JSON.stringify(patchedScene, null, 2);
    }

    if (isPrototypePage || isSketchPage) {
      if (!currentFiles) {
        return NextResponse.json(createApiError("DEMO_PAGE_NOT_FOUND"), {
          status: 404,
        });
      }
      runtimeValidation = getProjectAdminService().validateDemoPageFilesRuntime(
        demoId,
        isSketchPage ? "sketch-scene" : "prototype-html-css",
        {
          ...currentFiles,
          code: code ?? currentFiles.code,
          schema: schema ?? currentFiles.schema,
          prototypeHtml: prototypeHtml ?? currentFiles.prototypeHtml,
          prototypeCss: prototypeCss ?? currentFiles.prototypeCss,
          prototypeMeta: (prototypeMeta as PrototypePageMeta | undefined) ?? currentFiles.prototypeMeta,
          sketchScene: sketchSceneForWrite ?? currentFiles.sketchScene,
          sketchMeta: (sketchMeta as Record<string, unknown> | undefined) ?? currentFiles.sketchMeta,
        },
      );
      if (!runtimeValidation.ok) {
        return NextResponse.json(
          createApiError(
            "VALIDATION_ERROR",
            isSketchPage ? "手绘页面校验未通过，暂不保存页面文件" : "原型页校验未通过，暂不保存页面文件",
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
      sketchScene: sketchSceneForWrite,
      sketchMeta: sketchMeta as Record<string, unknown> | undefined,
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
