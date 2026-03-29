import { NextRequest, NextResponse } from 'next/server';
import { createSession, demoExists, createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { demoId } = body;
    
    if (!demoId || typeof demoId !== 'string') {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'demoId 参数必填'),
        { status: 400 }
      );
    }
    
    if (!demoExists(demoId)) {
      return NextResponse.json(
        createApiError('DEMO_NOT_FOUND'),
        { status: 404 }
      );
    }
    
    const session = createSession(demoId);
    return NextResponse.json(createApiSuccess(session), { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    
    if (error instanceof Error && error.message.includes('不存在')) {
      return NextResponse.json(
        createApiError('DEMO_NOT_FOUND'),
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '创建 Session 失败'),
      { status: 500 }
    );
  }
}
