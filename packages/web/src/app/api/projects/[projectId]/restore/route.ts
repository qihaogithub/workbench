import { NextResponse } from 'next/server';
import { restoreVersion, projectExists } from '@/lib/fs-utils';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;
    const body = await request.json();

    if (!projectExists(projectId)) {
      return NextResponse.json(
        createApiError('PROJECT_NOT_FOUND'),
        { status: 404 }
      );
    }

    if (!body.versionId) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', '版本号不能为空'),
        { status: 400 }
      );
    }

    const result = restoreVersion(projectId, body.versionId, body.userId);

    if (!result.success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', result.error || '恢复版本失败'),
        { status: 500 }
      );
    }

    return NextResponse.json(createApiSuccess({
      projectId,
      newVersionId: result.newVersionId,
      restoredAt: Date.now(),
    }));
  } catch (error) {
    console.error('Error restoring version:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '恢复版本失败'),
      { status: 500 }
    );
  }
}
