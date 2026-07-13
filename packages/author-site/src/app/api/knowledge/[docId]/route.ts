import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import type { WorkspaceMutationOperation } from '@workbench/shared/contracts';
import * as fs from 'fs';
import * as path from 'path';
import { syncBuiltinKnowledge } from '@/lib/knowledge/builtin-documents';
import { ProjectAdminService } from '@workbench/project-core';
import { getDataDir } from '@/lib/fs-utils';
import { getLiveWorkspaceRouteContext, isLiveWorkspacePath } from '@/lib/live-workspace-route-context';
import { commitWorkspaceMutation, WorkspaceAuthorityClientError } from '@/lib/workspace-authority-client';

interface KnowledgeItem {
  id: string;
  title: string;
  source: 'system' | 'user';
  description: string;
  fileName: string;
  addedAt: string;
  updatedAt: string;
  sizeBytes?: number;
}

interface Manifest {
  version: number;
  items: KnowledgeItem[];
}

function readManifest(workingDir: string): Manifest | null {
  const manifestPath = path.join(workingDir, 'knowledge', 'manifest.json');
  try {
    if (!fs.existsSync(manifestPath)) return null;
    const content = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeManifest(workingDir: string, manifest: Manifest): void {
  const knowledgeDir = path.join(workingDir, 'knowledge');
  fs.writeFileSync(
    path.join(knowledgeDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

function hashText(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function createLiveWorkspaceSessionError() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'WORKSPACE_AUTHORITY_NOT_READY',
        message: 'live Workspace 知识写入必须提供有效 sessionId',
      },
    },
    { status: 409 },
  );
}

function createMutationErrorResponse(error: WorkspaceAuthorityClientError) {
  return NextResponse.json(
    { success: false, error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

function createKnowledgeVersion(projectId: string | null, workingDir: string, docId: string, note: string): void {
  if (!projectId) return;
  new ProjectAdminService({ dataDir: getDataDir() }).resourceVersionCreate(
    {
      projectId,
      kind: 'knowledge_document',
      resourceId: docId,
      sourceWorkspacePath: workingDir,
      note,
    },
    {
      id: 'author-site',
      name: 'Author Site',
      role: 'creator',
      source: 'author-site',
    },
  );
}

// PUT - 更新知识文档（仅 source: "user"）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    const liveSession = getLiveWorkspaceRouteContext({ request, workingDir, projectId });
    if (isLiveWorkspacePath(workingDir) && !liveSession) return createLiveWorkspaceSessionError();
    const versionProjectId = liveSession?.projectId ?? projectId;
    if (!liveSession) syncBuiltinKnowledge(workingDir);
    const manifest = readManifest(workingDir);
    if (!manifest) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '知识库不存在' } },
        { status: 404 }
      );
    }

    const itemIndex = manifest.items.findIndex((item) => item.id === docId);
    if (itemIndex === -1) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '文档不存在' } },
        { status: 404 }
      );
    }

    const item = manifest.items[itemIndex];

    // 清理前的历史 system 条目不可修改
    if (item.source === 'system') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '历史 system 文档不可修改' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { title, description, content } = body;

    const manifestPath = path.join(workingDir, 'knowledge', 'manifest.json');
    const previousManifest = fs.readFileSync(manifestPath, 'utf-8');
    const filePath = path.join(workingDir, 'knowledge', item.fileName);
    const previousContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;

    // 更新 .md 文件内容
    if (content !== undefined && typeof content === 'string') {
      if (!liveSession) fs.writeFileSync(filePath, content, 'utf-8');
    }

    // 更新 manifest 中的元数据
    const now = new Date().toISOString();
    if (title !== undefined && typeof title === 'string' && title.trim()) {
      manifest.items[itemIndex].title = title.trim();
    }
    if (description !== undefined && typeof description === 'string') {
      manifest.items[itemIndex].description = description.trim();
    }
    manifest.items[itemIndex].updatedAt = now;

    // 更新文件大小
    manifest.items[itemIndex].sizeBytes = content !== undefined && typeof content === 'string'
      ? Buffer.byteLength(content, 'utf-8')
      : (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0);

    if (liveSession) {
      const operations: WorkspaceMutationOperation[] = [{
        type: 'put_text' as const,
        path: 'knowledge/manifest.json',
        content: JSON.stringify(manifest, null, 2),
        expectedHash: hashText(previousManifest),
      }];
      if (content !== undefined && typeof content === 'string') {
        operations.unshift({
          type: 'put_text' as const,
          path: `knowledge/${item.fileName}`,
          content,
          ...(previousContent === null
            ? { expectedAbsent: true }
            : { expectedHash: hashText(previousContent) }),
        });
      }
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(), projectId: liveSession.projectId, workspaceId: liveSession.workspaceId,
        sessionId: liveSession.sessionId, baseRevision: 0, actor: 'author-site', reason: 'update_knowledge_document', operations,
      });
    } else {
      writeManifest(workingDir, manifest);
    }
    createKnowledgeVersion(versionProjectId, workingDir, docId, `更新知识文档 ${manifest.items[itemIndex].title}`);

    return NextResponse.json({ success: true, data: manifest.items[itemIndex] });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return createMutationErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'UPDATE_FAILED', message } },
      { status: 500 }
    );
  }
}

// DELETE - 删除知识文档（仅 source: "user"）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    const liveSession = getLiveWorkspaceRouteContext({ request, workingDir, projectId });
    if (isLiveWorkspacePath(workingDir) && !liveSession) return createLiveWorkspaceSessionError();
    const versionProjectId = liveSession?.projectId ?? projectId;
    if (!liveSession) syncBuiltinKnowledge(workingDir);
    const manifest = readManifest(workingDir);
    if (!manifest) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '知识库不存在' } },
        { status: 404 }
      );
    }

    const itemIndex = manifest.items.findIndex((item) => item.id === docId);
    if (itemIndex === -1) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: '文档不存在' } },
        { status: 404 }
      );
    }

    const item = manifest.items[itemIndex];

    // 清理前的历史 system 条目不可删除
    if (item.source === 'system') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: '历史 system 文档不可删除' } },
        { status: 403 }
      );
    }

    // 删除 .md 文件
    const manifestPath = path.join(workingDir, 'knowledge', 'manifest.json');
    const previousManifest = fs.readFileSync(manifestPath, 'utf-8');
    const filePath = path.join(workingDir, 'knowledge', item.fileName);
    const previousContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
    if (!liveSession && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 从 manifest 中移除
    const deletedTitle = item.title;
    manifest.items.splice(itemIndex, 1);
    if (liveSession) {
      const operations: WorkspaceMutationOperation[] = [{
        type: 'put_text',
        path: 'knowledge/manifest.json',
        content: JSON.stringify(manifest, null, 2),
        expectedHash: hashText(previousManifest),
      }];
      if (previousContent !== null) {
        operations.unshift({
          type: 'delete_path',
          path: `knowledge/${item.fileName}`,
          expectedHash: hashText(previousContent),
        });
      }
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId: liveSession.projectId,
        workspaceId: liveSession.workspaceId,
        sessionId: liveSession.sessionId,
        baseRevision: 0,
        actor: 'author-site',
        reason: 'delete_knowledge_document',
        operations,
      });
    } else {
      writeManifest(workingDir, manifest);
    }
    if (versionProjectId) {
      new ProjectAdminService({ dataDir: getDataDir() }).resourceDelete(
        {
          projectId: versionProjectId,
          kind: 'knowledge_document',
          resourceId: docId,
          title: `删除知识文档 ${deletedTitle}`,
        },
        {
          id: 'author-site',
          name: 'Author Site',
          role: 'creator',
          source: 'author-site',
        },
      );
    }

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return createMutationErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'DELETE_FAILED', message } },
      { status: 500 }
    );
  }
}
