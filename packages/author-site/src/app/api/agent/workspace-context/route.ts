import { NextRequest, NextResponse } from 'next/server';
import { scanWorkspaceContext, readMemoryContent } from '@/lib/agent/scan-workspace';

export async function GET(request: NextRequest) {
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    const context = scanWorkspaceContext(workingDir);
    const memoryContent = readMemoryContent(workingDir);
    return NextResponse.json({ success: true, data: { ...context, memoryContent } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'SCAN_FAILED', message } },
      { status: 500 }
    );
  }
}
