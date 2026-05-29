import { NextRequest, NextResponse } from 'next/server';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getPublishStatus } from '@/lib/publish-manager';

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const result = getPublishStatus(params.projectId);
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    if (error instanceof Error && error.message === 'PROJECT_NOT_FOUND') {
      return NextResponse.json(createApiError('PROJECT_NOT_FOUND'), { status: 404 });
    }
    console.error('获取发布状态失败:', error);
    return NextResponse.json(createApiError('FILE_READ_ERROR', '获取发布状态失败'), { status: 500 });
  }
}
