import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  projectExists,
  readProjectMeta,
  writeProjectMeta,
  createApiSuccess,
  createApiError,
} from '@/lib/fs-utils';

const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function ensureThumbnailsDir(): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

function deleteExistingCover(projectId: string): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) return;

  const files = fs.readdirSync(THUMBNAILS_DIR);
  for (const file of files) {
    if (file.startsWith(`${projectId}_cover.`)) {
      fs.unlinkSync(path.join(THUMBNAILS_DIR, file));
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;

    if (!projectExists(projectId)) {
      return NextResponse.json(
        createApiError('PROJECT_NOT_FOUND', '项目不存在'),
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', '请选择要上传的图片文件'),
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        createApiError('INVALID_FILE_TYPE', '仅支持 JPG、PNG、WebP 格式的图片'),
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        createApiError('FILE_TOO_LARGE', '图片大小不能超过 5MB'),
        { status: 400 }
      );
    }

    const ext = file.type === 'image/jpeg' ? 'jpg'
      : file.type === 'image/png' ? 'png'
      : 'webp';

    ensureThumbnailsDir();
    deleteExistingCover(projectId);

    const filename = `${projectId}_cover.${ext}`;
    const filePath = path.join(THUMBNAILS_DIR, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    const thumbnailPath = `/thumbnails/${filename}`;

    const project = readProjectMeta(projectId);
    if (project) {
      project.thumbnail = thumbnailPath;
      project.updatedAt = Date.now();
      writeProjectMeta(projectId, project);
    }

    return NextResponse.json(createApiSuccess({ thumbnail: thumbnailPath }));
  } catch (error) {
    console.error('Error uploading cover:', error);
    return NextResponse.json(
      createApiError('COVER_UPLOAD_FAILED', '封面图上传失败'),
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: projectId } = params;

    if (!projectExists(projectId)) {
      return NextResponse.json(
        createApiError('PROJECT_NOT_FOUND', '项目不存在'),
        { status: 404 }
      );
    }

    deleteExistingCover(projectId);

    const autoThumbnailPath = path.join(THUMBNAILS_DIR, `${projectId}.png`);
    const hasAutoThumbnail = fs.existsSync(autoThumbnailPath);

    const project = readProjectMeta(projectId);
    if (project) {
      project.thumbnail = hasAutoThumbnail ? `/thumbnails/${projectId}.png` : undefined;
      project.updatedAt = Date.now();
      writeProjectMeta(projectId, project);
    }

    return NextResponse.json(
      createApiSuccess({ thumbnail: project?.thumbnail || null })
    );
  } catch (error) {
    console.error('Error deleting cover:', error);
    return NextResponse.json(
      createApiError('FILE_WRITE_ERROR', '删除封面图失败'),
      { status: 500 }
    );
  }
}
