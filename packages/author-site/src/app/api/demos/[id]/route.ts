import { NextResponse } from 'next/server';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getProjectAdminService, projectAdminResponse } from '@/lib/project-admin-service';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'name 参数必填且不能为空'),
        { status: 400 }
      );
    }

    const result = getProjectAdminService().updateProject({
      projectId: id,
      name: name.trim(),
    });
    if (!result.ok) return projectAdminResponse(result);

    return NextResponse.json(createApiSuccess({ id, name: result.data?.name }));
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '更新项目名称失败'),
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
