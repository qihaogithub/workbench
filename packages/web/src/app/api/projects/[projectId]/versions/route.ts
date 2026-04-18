import { NextResponse } from 'next/server';
import { getVersionHistory, projectExists } from '@/lib/fs-utils';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const { projectId } = params;

    if (!projectExists(projectId)) {
      return NextResponse.json(
        createApiError('PROJECT_NOT_FOUND'),
        { status: 404 }
      );
    }

    const versions = getVersionHistory(projectId);
    const currentVersion = versions.length > 0 ? versions[0].versionId : 'v0';

    return NextResponse.json(createApiSuccess({
      projectId,
      currentVersion,
      versions,
      totalVersions: versions.length,
    }));
  } catch (error) {
    console.error('Error getting version history:', error);
    return NextResponse.json(
      createApiError('FILE_READ_ERROR', '获取版本历史失败'),
      { status: 500 }
    );
  }
}
