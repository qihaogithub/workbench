import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { getDataDir } from '@/lib/paths';

const IMAGES_DIR = path.join(getDataDir(), 'images');

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: pathSegments } = await params;

  if (!pathSegments || pathSegments.length === 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const relativePath = pathSegments.join('/');

  if (relativePath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
  }

  const filePath = path.resolve(IMAGES_DIR, relativePath);

  if (!filePath.startsWith(IMAGES_DIR)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return NextResponse.json({ error: 'Not a file' }, { status: 400 });
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
