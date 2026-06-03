import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { getSessionWorkspacePath } from '@/lib/fs-utils';

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: { sessionId: string; path: string[] } },
) {
  const { sessionId, path: pathSegments } = params;

  if (!sessionId || !pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const workspacePath = getSessionWorkspacePath(sessionId);
  if (!workspacePath) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const relativePath = pathSegments.join('/');

  if (relativePath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  const filePath = path.resolve(workspacePath, relativePath);

  if (!filePath.startsWith(path.resolve(workspacePath))) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return NextResponse.json({ error: 'Cannot serve directory' }, { status: 400 });
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
