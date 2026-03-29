import { NextResponse } from 'next/server';
import { deleteDemo, demoExists, createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    
    if (!demoExists(id)) {
      return NextResponse.json(
        createApiError('DEMO_NOT_FOUND'),
        { status: 404 }
      );
    }
    
    const success = deleteDemo(id);
    
    if (!success) {
      return NextResponse.json(
        createApiError('FILE_WRITE_ERROR', '删除 Demo 失败'),
        { status: 500 }
      );
    }
    
    return NextResponse.json(createApiSuccess(null));
  } catch (error) {
    console.error('Error deleting demo:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '删除 Demo 失败'),
      { status: 500 }
    );
  }
}
