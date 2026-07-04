import { NextRequest, NextResponse } from "next/server";

import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  applyVisualConfiguration,
  type VisualConfigTarget,
} from "@/lib/visual-configurator";
import { validateNoSchemaConflictFromStrings } from "@/lib/schema-validator";
import type { VisualNodeInfo } from "@opencode-workbench/demo-ui";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      code?: unknown;
      schema?: unknown;
      projectConfigSchema?: unknown;
      demoId?: unknown;
      node?: unknown;
      target?: unknown;
    };

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
    const demoId = typeof body.demoId === "string" ? body.demoId : "current";
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
