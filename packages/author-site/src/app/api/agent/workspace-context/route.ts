import { NextRequest, NextResponse } from 'next/server';
import { scanWorkspaceContext, readMemoryContent, scanKnowledgeIndex, readConventionContent, readPageConventionContent } from '@/lib/agent/scan-workspace';
import { formatInventoryL3, formatInventoryUnavailableL3, getProjectInventory, queryProjectInventory, redactUnavailableInventoryEntry } from '@/lib/agent/project-inventory';
import { decodeMarkdownReferenceUri } from '@workbench/shared';
import { getSessionMeta } from '@/lib/fs-utils';
import { findUserById } from '@/lib/user';
import { toProjectAdminActor } from '@/lib/auth/current-user';
import { getProjectAdminService } from '@/lib/project-admin-service';
import { resolveMarkdownReferenceWorkspace } from '@/lib/markdown-references';

export async function GET(request: NextRequest) {
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  const pageId = request.nextUrl.searchParams.get('pageId') || undefined;
  const projectId = request.nextUrl.searchParams.get('projectId') || undefined;
  const sessionId = request.nextUrl.searchParams.get('sessionId') || undefined;
  const question = request.nextUrl.searchParams.get('question') || undefined;
  if (!workingDir) {
    const response = NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
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
      pageId,
    });

    const context = scanWorkspaceContext(workingDir);
    const memoryContent = readMemoryContent(workingDir);
    const knowledgeIndex = scanKnowledgeIndex(workingDir);
    const conventionContent = readConventionContent(workingDir);
    const pageConventionContent = pageId
      ? readPageConventionContent(workingDir, pageId)
      : null;
    let inventoryPrefix: string | null = null;
    let inventoryStatus: 'available' | 'unavailable' = 'unavailable';
    if (projectId && sessionId) {
      const session = getSessionMeta(sessionId);
      const user = session?.userId ? findUserById(session.userId) : null;
      const inventoryContext = user
        ? resolveMarkdownReferenceWorkspace(
            new NextRequest(`${request.nextUrl.origin}${request.nextUrl.pathname}?sessionId=${encodeURIComponent(sessionId)}`),
            projectId,
            user.id,
          )
        : null;
      if (inventoryContext && path.resolve(inventoryContext.workspacePath) === path.resolve(workingDir)) {
        try {
          const inventory = await getProjectInventory(inventoryContext);
          let result = queryProjectInventory(inventory.snapshot, { query: question, limit: 100 });
          // Keep the project root and current page discoverable even when the
          // user's question has no lexical hit in the inventory.
          if (question && result.total === 0) {
            result = queryProjectInventory(inventory.snapshot, { limit: 100 });
          }
          if (user) {
            const actor = toProjectAdminActor(user);
            const service = getProjectAdminService();
            const access = new Map<string, boolean>();
            result = {
              ...result,
              entries: result.entries.map((entry) => {
                if (entry.scope === 'local') return { ...entry, targetAvailability: 'available' as const };
                const target = decodeMarkdownReferenceUri(entry.canonicalUri);
                if (!target) return redactUnavailableInventoryEntry(entry);
                let allowed = access.get(target.projectId);
                if (allowed === undefined) {
                  allowed = service.getProject(target.projectId, actor).ok;
                  access.set(target.projectId, allowed);
                }
                return allowed ? { ...entry, targetAvailability: 'available' as const } : redactUnavailableInventoryEntry(entry);
              }),
            };
          }
          const formatted = formatInventoryL3(result, pageId);
          inventoryPrefix = formatted.text;
          inventoryStatus = formatted.status;
        } catch (error) {
          // Inventory is an optional discovery aid. A stale/unavailable
          // index must not make ordinary chat context fail closed as a 500.
          console.warn('[workspace-context] inventory unavailable:', error instanceof Error ? error.message : String(error));
        }
      }
      if (!inventoryPrefix) inventoryPrefix = formatInventoryUnavailableL3();
    }
    const response = NextResponse.json({
      success: true,
      data: { ...context, memoryContent, knowledgeIndex, conventionContent, pageConventionContent, inventoryPrefix, inventoryStatus },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[workspace-context] 扫描失败:', { workingDir, error: message });
    const response = NextResponse.json(
      { success: false, error: { code: 'SCAN_FAILED', message } },
      { status: 500 }
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
