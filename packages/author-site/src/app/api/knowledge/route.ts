import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

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
  if (!fs.existsSync(knowledgeDir)) {
    fs.mkdirSync(knowledgeDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(knowledgeDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
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
    const manifest = readManifest(workingDir);
    const items = manifest?.items || [];
    return NextResponse.json({ success: true, data: items });
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
  if (!workingDir) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_REQUEST', message: 'workingDir 必填' } },
      { status: 400 }
    );
  }

  try {
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
    if (!fs.existsSync(knowledgeDir)) {
      fs.mkdirSync(knowledgeDir, { recursive: true });
    }

    // 生成安全文件名
    const baseName = sanitizeFileName(title.trim());
    const fileName = generateUniqueFileName(workingDir, baseName);
    const filePath = path.join(knowledgeDir, fileName);

    // 写入 .md 文件
    fs.writeFileSync(filePath, content, 'utf-8');

    // 读取或初始化 manifest
    const manifest = readManifest(workingDir) || { version: 1, items: [] };

    const now = new Date().toISOString();
    const stats = fs.statSync(filePath);
    const newItem: KnowledgeItem = {
      id: generateDocId(),
      title: title.trim(),
      source: 'user',
      description: (description || '').trim() || title.trim(),
      fileName,
      addedAt: now,
      updatedAt: now,
      sizeBytes: stats.size,
    };

    manifest.items.push(newItem);
    writeManifest(workingDir, manifest);

    return NextResponse.json({ success: true, data: newItem }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: { code: 'CREATE_FAILED', message } },
      { status: 500 }
    );
  }
}
