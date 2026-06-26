import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { syncBuiltinKnowledge } from '@/lib/knowledge/builtin-documents';

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

// PUT - 更新知识文档（仅 source: "user"）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params;
  const workingDir = request.nextUrl.searchParams.get('workingDir');
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    syncBuiltinKnowledge(workingDir);
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

    // 更新 .md 文件内容
    if (content !== undefined && typeof content === 'string') {
      const filePath = path.join(workingDir, 'knowledge', item.fileName);
      fs.writeFileSync(filePath, content, 'utf-8');
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
    const filePath = path.join(workingDir, 'knowledge', item.fileName);
    if (fs.existsSync(filePath)) {
      manifest.items[itemIndex].sizeBytes = fs.statSync(filePath).size;
    }

    writeManifest(workingDir, manifest);

    return NextResponse.json({ success: true, data: manifest.items[itemIndex] });
  } catch (error) {
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
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
    syncBuiltinKnowledge(workingDir);
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
    const filePath = path.join(workingDir, 'knowledge', item.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // 从 manifest 中移除
    manifest.items.splice(itemIndex, 1);
    writeManifest(workingDir, manifest);

    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'DELETE_FAILED', message } },
      { status: 500 }
    );
  }
}
