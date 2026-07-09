import * as path from 'path';
import * as fs from 'fs';

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

let _projectsDir: string | null = null;

function getProjectsDir(): string {
  if (!_projectsDir) {
    const dataDir = process.env.DATA_DIR
      ? path.resolve(process.env.DATA_DIR)
      : path.join(findProjectRoot(process.cwd()), 'data');
    _projectsDir = path.join(dataDir, 'projects');
  }
  return _projectsDir;
}

export interface ProjectImage {
  id: string;
  filename: string;
  url: string;
  size: number;
  format: string;
  createdAt: number;
  createdBy: 'user' | 'ai' | 'figma';
  contentHash?: string;
  mimeType?: string;
  originalUrl?: string;
  sourceType?: 'browser_blob' | 'upload' | 'session_asset' | 'workspace_asset' | 'r2_worker' | 'remote_url';
}

export interface ProjectImageManifest {
  images: ProjectImage[];
}

function getManifestPath(projectId: string): string {
  return path.join(getProjectsDir(), projectId, 'images.json');
}

function readManifest(projectId: string): ProjectImageManifest {
  const manifestPath = getManifestPath(projectId);
  if (!fs.existsSync(manifestPath)) {
    return { images: [] };
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { images: [] };
  }
}

function writeManifest(projectId: string, manifest: ProjectImageManifest): void {
  const manifestPath = getManifestPath(projectId);
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function getProjectImages(projectId: string): ProjectImage[] {
  const manifest = readManifest(projectId);
  return manifest.images;
}

export function getImageByHash(projectId: string, hash: string): ProjectImage | undefined {
  const images = getProjectImages(projectId);
  return images.find((img) => img.id === hash);
}

export function addProjectImage(projectId: string, image: ProjectImage): void {
  const manifest = readManifest(projectId);

  const existingIndex = manifest.images.findIndex((img) => img.id === image.id);
  if (existingIndex >= 0) {
    manifest.images[existingIndex] = image;
  } else {
    manifest.images.push(image);
  }

  writeManifest(projectId, manifest);
}

export function removeProjectImage(projectId: string, imageId: string): boolean {
  const manifest = readManifest(projectId);
  const index = manifest.images.findIndex((img) => img.id === imageId);
  if (index < 0) {
    return false;
  }
  manifest.images.splice(index, 1);
  writeManifest(projectId, manifest);
  return true;
}
