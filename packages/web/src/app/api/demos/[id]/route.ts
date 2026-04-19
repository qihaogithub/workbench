import { NextResponse } from 'next/server';
import { deleteProject, projectExists, readProjectMeta, writeProjectMeta, createApiSuccess, createApiError } from '@/lib/fs-utils';

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

    const project = readProjectMeta(id);
    if (!project) {
      return NextResponse.json(
        createApiError('PROJECT_NOT_FOUND', '项目不存在'),
        { status: 404 }
      );
    }

    project.name = name.trim();
    project.updatedAt = Date.now();
    writeProjectMeta(id, project);

    return NextResponse.json(createApiSuccess({ id, name: project.name }));
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

    if (!projectExists(id)) {
      return NextResponse.json(
        createApiError('PROJECT_NOT_FOUND'),
        { status: 404 }
      );
    }

    const success = deleteProject(id);

    if (!success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '删除项目失败'),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '删除项目失败'),
      { status: 500 }
    );
  }
}
