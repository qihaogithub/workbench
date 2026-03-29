import { NextRequest, NextResponse } from 'next/server';
import { listDemos, createDemo, createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function GET() {
  try {
    const demos = listDemos();
    return NextResponse.json(createApiSuccess(demos));
  } catch (error) {
    console.error('Error listing demos:', error);
    return NextResponse.json(
      createApiError('FILE_READ_ERROR', '读取 Demo 列表失败'),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'name 参数必填'),
        { status: 400 }
      );
    }
    
    const demo = createDemo(name);
    return NextResponse.json(createApiSuccess(demo), { status: 201 });
  } catch (error) {
    console.error('Error creating demo:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '创建 Demo 失败'),
      { status: 500 }
    );
  }
}
