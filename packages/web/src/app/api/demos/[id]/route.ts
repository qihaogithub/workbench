import { NextResponse } from 'next/server';
import { deleteProject, projectExists, createApiSuccess, createApiError } from '@/lib/fs-utils';

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
