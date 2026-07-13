import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { syncBuiltinKnowledge } from '@/lib/knowledge/builtin-documents';
import { isLiveWorkspacePath } from '@/lib/live-workspace-route-context';

/**
 * 读取知识库文件内容
 * GET /api/knowledge/content?workingDir=...&fileName=...
 */
export async function GET(request: NextRequest) {
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  const fileName = request.nextUrl.searchParams.get('fileName');

  if (!workingDir || !fileName) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 和 fileName 必填' } },
      { status: 400 }
    );
  }

  // 安全校验：文件名不能包含路径分隔符（防止路径穿越）
  const sanitizedFileName = path.basename(fileName);
  if (sanitizedFileName !== fileName) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: '文件名不合法' } },
      { status: 400 }
    );
  }

  try {
    if (!isLiveWorkspacePath(workingDir)) syncBuiltinKnowledge(workingDir);
    const filePath = path.join(workingDir, 'knowledge', sanitizedFileName);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '文件不存在' } },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return NextResponse.json({ success: true, data: { content, fileName: sanitizedFileName } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'READ_FAILED', message } },
      { status: 500 }
    );
  }
}
