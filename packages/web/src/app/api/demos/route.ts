import { NextRequest, NextResponse } from 'next/server';
import { listProjects, createProject, createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json(createApiSuccess(projects));
  } catch (error) {
    console.error('Error listing projects:', error);
    return NextResponse.json(
      createApiError('FILE_READ_ERROR', '读取项目列表失败'),
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
    
    const project = createProject(name);
    return NextResponse.json(createApiSuccess(project), { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '创建项目失败'),
      { status: 500 }
    );
  }
}
