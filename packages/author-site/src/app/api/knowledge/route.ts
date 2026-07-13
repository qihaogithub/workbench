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
  category?: string;
  tags?: string[];
  aiSummary?: string;
  aiKeywords?: string[];
  summaryStatus?: "ready" | "stale" | "failed";
  readonly?: boolean;
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
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(knowledgeDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  );
}

function hashText(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readManifestRaw(workingDir: string): string | null {
  const manifestPath = path.join(workingDir, 'knowledge', 'manifest.json');
  return fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf-8') : null;
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

/**
 * 将标题转换为安全文件名
 * 仅允许中文、英文、数字、下划线、连字符，其余字符替换为下划线
 */
function sanitizeFileName(title: string): string {
  return title
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    || 'untitled';
}

/**
 * 生成不重复的文件名，同名文件追加序号
 */
function generateUniqueFileName(workingDir: string, baseName: string): string {
  const knowledgeDir = path.join(workingDir, 'knowledge');
  let fileName = `${baseName}.md`;
  let counter = 2;

  while (fs.existsSync(path.join(knowledgeDir, fileName))) {
    fileName = `${baseName}_${counter}.md`;
    counter++;
  }

  return fileName;
}

/**
 * 生成知识库文档 ID
 */
function generateDocId(): string {
  return `kb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

// GET - 获取知识库列表
export async function GET(request: NextRequest) {
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    if (!isLiveWorkspacePath(workingDir)) syncBuiltinKnowledge(workingDir);
    const manifest = readManifest(workingDir);
    const userItems = (manifest?.items || []).filter(
      (item) => item.source !== 'system',
    );
    return NextResponse.json({ success: true, data: userItems });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'READ_FAILED', message } },
      { status: 500 }
    );
  }
}

// POST - 添加知识文档（仅 source: "user"）
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { title, description, content } = body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: '标题必填' } },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: '内容必填' } },
        { status: 400 }
      );
    }

    const knowledgeDir = path.join(workingDir, 'knowledge');
    if (!liveSession && !fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true });
    }

    // 生成安全文件名
    const baseName = sanitizeFileName(title.trim());
    const fileName = generateUniqueFileName(workingDir, baseName);
    const filePath = path.join(knowledgeDir, fileName);

    // 写入 .md 文件
    if (!liveSession) fs.writeFileSync(filePath, content, 'utf-8');

    // 读取或初始化 manifest；创作端知识库只保留用户文档
    const previousManifest = readManifestRaw(workingDir);
    const manifest = liveSession
      ? readManifest(workingDir) ?? { version: 1, items: [] }
      : syncBuiltinKnowledge(workingDir);

    const now = new Date().toISOString();
    const newItem: KnowledgeItem = {
      id: generateDocId(),
      title: title.trim(),
      source: 'user',
      description: (description || '').trim() || title.trim(),
      fileName,
      addedAt: now,
      updatedAt: now,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
    };

    manifest.items.push(newItem);
    if (liveSession) {
      const operations: WorkspaceMutationOperation[] = [
        {
          type: 'put_text',
          path: `knowledge/${fileName}`,
          content,
          expectedAbsent: true,
        },
        {
          type: 'put_text',
          path: 'knowledge/manifest.json',
          content: JSON.stringify(manifest, null, 2),
          ...(previousManifest === null
            ? { expectedAbsent: true }
            : { expectedHash: hashText(previousManifest) }),
        },
      ];
      await commitWorkspaceMutation({
        mutationId: crypto.randomUUID(),
        projectId: liveSession.projectId,
        workspaceId: liveSession.workspaceId,
        sessionId: liveSession.sessionId,
        baseRevision: 0,
        actor: 'author-site',
        reason: 'create_knowledge_document',
        operations,
      });
    } else {
      writeManifest(workingDir, manifest);
    }
    createKnowledgeVersion(versionProjectId, workingDir, newItem.id, `创建知识文档 ${newItem.title}`);

    return NextResponse.json({ success: true, data: newItem }, { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceAuthorityClientError) return createMutationErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'CREATE_FAILED', message } },
      { status: 500 }
    );
  }
}
