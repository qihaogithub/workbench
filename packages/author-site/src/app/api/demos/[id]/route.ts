import { NextResponse } from 'next/server';
import type { ProjectAuthoringPreferences } from '@workbench/shared';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getProjectAdminService, projectAdminResponse } from '@/lib/project-admin-service';

function parseProjectAuthoringPreferences(value: unknown): ProjectAuthoringPreferences | null | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const sketchEditorEngine = record.sketchEditorEngine;
  if (sketchEditorEngine === undefined) return {};
  if (sketchEditorEngine === 'native' || sketchEditorEngine === 'openpencil') {
    return { sketchEditorEngine };
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name, category, authoringPreferences } = body as {
      name?: unknown;
      category?: unknown;
      authoringPreferences?: unknown;
    };

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'name 参数必填且不能为空'),
        { status: 400 }
      );
    }

    if (category !== undefined && (typeof category !== 'string' || !category.trim())) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'category 参数必须是非空字符串'),
        { status: 400 }
      );
    }

    const parsedAuthoringPreferences =
      parseProjectAuthoringPreferences(authoringPreferences);
    if (authoringPreferences !== undefined && parsedAuthoringPreferences === null) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'authoringPreferences 参数不合法'),
        { status: 400 }
      );
    }

    if (name === undefined && category === undefined && authoringPreferences === undefined) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'name、category 或 authoringPreferences 至少提供一项'),
        { status: 400 }
      );
    }

    const result = getProjectAdminService().updateProject({
      projectId: id,
      name: typeof name === 'string' ? name.trim() : undefined,
      category: typeof category === 'string' ? category.trim() : undefined,
      authoringPreferences: parsedAuthoringPreferences ?? undefined,
    });
    if (!result.ok) return projectAdminResponse(result);

    return NextResponse.json(createApiSuccess({
      id,
      name: result.data?.name,
      category: result.data?.category,
      authoringPreferences: result.data?.authoringPreferences,
    }));
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '更新项目失败'),
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const service = getProjectAdminService();
    const preview = service.deleteProjectPreview(id);
    if (!preview.ok || !preview.data) return projectAdminResponse(preview);

    const result = service.deleteProjectExecute(
      preview.data.planId,
      preview.data.confirmToken,
    );
    if (!result.ok) return projectAdminResponse(result);

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '删除项目失败'),
      { status: 500 }
    );
  }
}
