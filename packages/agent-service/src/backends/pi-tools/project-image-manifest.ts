import * as fs from 'fs';
import * as path from 'path';

import type { AgentConfig } from '../../core/types';

export interface ProjectImageEntry {
  id: string;
  filename: string;
  url: string;
  size: number;
  format: string;
  createdAt: number;
  createdBy: 'user' | 'ai' | 'figma' | 'system';
  contentHash?: string;
  mimeType?: string;
  originalUrl?: string;
  sourceType?: 'browser_blob' | 'upload' | 'session_asset' | 'workspace_asset' | 'r2_worker' | 'remote_url';
}

export interface ProjectImageManifest {
  images: ProjectImageEntry[];
}

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

let projectsDirCache: string | null = null;

function getProjectsDir(): string {
  if (!projectsDirCache) {
    const dataDir = path.resolve(
      process.env.DATA_DIR || path.join(findProjectRoot(process.cwd()), 'data'),
    );
    projectsDirCache = path.join(dataDir, 'projects');
  }
  return projectsDirCache;
}

function hasProjectMetadata(projectId: string): boolean {
  return fs.existsSync(path.join(getProjectsDir(), projectId, 'project.json'));
}

function readWorkspaceMetaProjectId(workingDir: string): string | null {
  const metaPath = path.join(path.resolve(workingDir), '.workspace.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    const raw = fs.readFileSync(metaPath, 'utf-8');
    const parsed = JSON.parse(raw) as { projectId?: unknown; demoId?: unknown };
    const projectId = typeof parsed.projectId === 'string' ? parsed.projectId.trim() : '';
    if (projectId && hasProjectMetadata(projectId)) return projectId;

    const legacyDemoId = typeof parsed.demoId === 'string' ? parsed.demoId.trim() : '';
    if (legacyDemoId && hasProjectMetadata(legacyDemoId)) return legacyDemoId;
  } catch {
    return null;
  }

  return null;
}

function inferProjectIdFromPath(workingDir: string): string | null {
  const resolved = path.resolve(workingDir);
  const parts = resolved.split(path.sep);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (parts[index] !== 'projects') continue;
    const candidate = parts[index + 1];
    if (candidate && hasProjectMetadata(candidate)) return candidate;
  }
  return null;
}

export function resolveProjectImageManifestProjectId(config: AgentConfig): string | null {
  const explicitProjectId = config.projectId?.trim();
  if (explicitProjectId) return explicitProjectId;

  const workingDir = config.workingDir?.trim();
  if (workingDir) {
    const workspaceProjectId = readWorkspaceMetaProjectId(workingDir);
    if (workspaceProjectId) return workspaceProjectId;

    const pathProjectId = inferProjectIdFromPath(workingDir);
    if (pathProjectId) return pathProjectId;
  }

  const legacyDemoId = config.demoId?.trim();
  if (legacyDemoId && hasProjectMetadata(legacyDemoId)) return legacyDemoId;

  return null;
}

export function getProjectImageManifestPath(projectId: string): string {
  return path.join(getProjectsDir(), projectId, 'images.json');
}

export function getProjectImageManifestDataDir(): string {
  return path.dirname(getProjectsDir());
}

export function readProjectImageManifest(projectId: string): ProjectImageManifest {
  const manifestPath = getProjectImageManifestPath(projectId);
  if (!fs.existsSync(manifestPath)) {
    return { images: [] };
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw) as ProjectImageManifest;
  } catch {
    return { images: [] };
  }
}

export function addProjectImageManifestEntry(
  projectId: string,
  entry: ProjectImageEntry,
): void {
  const manifestPath = getProjectImageManifestPath(projectId);
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const manifest = readProjectImageManifest(projectId);
  const existingIndex = manifest.images.findIndex((img) => img.id === entry.id);
  if (existingIndex >= 0) {
    manifest.images[existingIndex] = entry;
  } else {
    manifest.images.push(entry);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function findProjectImageManifestEntry(
  projectId: string,
  assetId: string,
): ProjectImageEntry | undefined {
  const normalized = assetId.startsWith('asset_') ? assetId.slice('asset_'.length) : assetId;
  return readProjectImageManifest(projectId).images.find((image) =>
    image.id === normalized ||
    image.contentHash === normalized ||
    image.contentHash?.startsWith(normalized) === true,
  );
}
