import { NextRequest, NextResponse } from 'next/server';
import { publishProject } from '@/lib/publish-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '未登录'), { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '登录已过期'), { status: 401 });
    }

    const result = await publishProject(params.projectId);
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PROJECT_NOT_FOUND') {
        return NextResponse.json(createApiError('PROJECT_NOT_FOUND'), { status: 404 });
      }
      if (error.message === 'NO_CONTENT_TO_PUBLISH') {
        return NextResponse.json(createApiError('NO_CONTENT_TO_PUBLISH', '项目没有可发布的Demo页面'), { status: 400 });
      }
    }
    console.error('发布失败:', error);
    return NextResponse.json(createApiError('PUBLISH_FAILED'), { status: 500 });
  }
}
