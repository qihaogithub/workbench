import { NextResponse } from "next/server";
import {
  ProjectAdminService,
  type ProjectAdminResult,
} from "@opencode-workbench/project-core";
import type { ErrorCodeType } from "@opencode-workbench/shared";

import { createApiError, createApiSuccess } from "@/lib/fs-utils";

export function getProjectAdminService(): ProjectAdminService {
  return new ProjectAdminService();
}

const ERROR_STATUS: Record<string, number> = {
  INVALID_REQUEST: 400,
  VALIDATION_BLOCKED: 400,
  CONFIRMATION_REQUIRED: 400,
  TEMPLATE_NOT_FOUND: 404,
  PROJECT_NOT_FOUND: 404,
  PROJECT_LOCKED: 423,
  DEMO_PAGE_NOT_FOUND: 404,
  FOLDER_NOT_FOUND: 404,
  EDIT_NOT_FOUND: 404,
  FORBIDDEN: 403,
};

const ERROR_CODE_MAP: Record<string, ErrorCodeType> = {
  TEMPLATE_NOT_FOUND: "PROJECT_NOT_FOUND",
  ASSET_NOT_FOUND: "FILE_READ_ERROR",
  EDIT_NOT_FOUND: "SESSION_NOT_FOUND",
  PROJECT_LOCKED: "FORBIDDEN",
  VALIDATION_BLOCKED: "VALIDATION_ERROR",
  CONFIRMATION_REQUIRED: "VALIDATION_ERROR",
};

export function projectAdminResponse<T>(
  result: ProjectAdminResult<T>,
  successStatus = 200,
) {
  if (result.ok) {
    return NextResponse.json(createApiSuccess(result.data as T), {
      status: successStatus,
    });
  }

  const code = result.error?.code ?? "INTERNAL_ERROR";
  const apiCode = ERROR_CODE_MAP[code] ?? code;
  return NextResponse.json(
    createApiError(
      apiCode as ErrorCodeType,
      result.error?.message ?? "操作失败",
      result.error?.details,
    ),
    { status: ERROR_STATUS[code] ?? 500 },
  );
}
