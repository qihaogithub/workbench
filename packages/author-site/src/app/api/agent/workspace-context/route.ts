import { NextRequest, NextResponse } from 'next/server';
import { scanWorkspaceContext, readMemoryContent, scanKnowledgeIndex } from '@/lib/agent/scan-workspace';

export async function GET(request: NextRequest) {
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    // 诊断日志：帮助排查 Docker 部署后工作空间为空的问题
    const fs = await import('fs');
    const path = await import('path');
    const dirExists = fs.existsSync(workingDir);
    const treeExists = dirExists && fs.existsSync(path.join(workingDir, 'workspace-tree.json'));
    const demosExists = dirExists && fs.existsSync(path.join(workingDir, 'demos'));
    let demosDirEntries: string[] = [];
    if (demosExists) {
      try {
        demosDirEntries = fs.readdirSync(path.join(workingDir, 'demos'));
      } catch { /* ignore */ }
    }
    console.log('[workspace-context] 诊断信息:', {
      workingDir,
      dirExists,
      treeExists,
      demosExists,
      demosDirEntries,
    });

    const context = scanWorkspaceContext(workingDir);
    const memoryContent = readMemoryContent(workingDir);
    const knowledgeIndex = scanKnowledgeIndex(workingDir);
    return NextResponse.json({ success: true, data: { ...context, memoryContent, knowledgeIndex } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[workspace-context] 扫描失败:', { workingDir, error: message });
    return NextResponse.json(
      { success: false, error: { code: 'SCAN_FAILED', message } },
      { status: 500 }
    );
  }
}
