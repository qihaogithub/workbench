import { NextResponse } from 'next/server';
import { cleanupExpiredSessions } from '@/lib/session-manager';
import { createApiSuccess, createApiError } from '@/lib/fs-utils';

export async function POST() {
  try {
    const cleaned = cleanupExpiredSessions();
    return NextResponse.json(createApiSuccess({ cleaned, count: cleaned.length }));
  } catch (error) {
    console.error('Error cleaning up sessions:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '清理 Session 失败'),
      { status: 500 }
    );
  }
}
