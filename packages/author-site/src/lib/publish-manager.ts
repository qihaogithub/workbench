import path from 'path';
import fs from 'fs';
import { compileCode } from '@/lib/compiler';
import {
  readProjectMeta,
  writeProjectMeta,
  listDemoPages,
  getDemoDirPath,
  getProjectConfigSchema,
  getProjectPath,
  projectExists,
  getDataDir,
} from '@/lib/fs-utils';
import { type PreviewSize, extractPreviewSize } from '@/lib/preview-size';
import type { Project, DemoPageMeta, DemoFolderMeta } from '@opencode-workbench/shared';

const PUBLISHED_DIR = path.join(getDataDir(), 'published');

export interface PublishedDemoPage {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  compiledJsPath: string;
  schemaPath?: string;
  previewSize?: PreviewSize;
}

export interface PublishedProject {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  publishedVersion: string;
  publishedAt: number;
  demoPages: PublishedDemoPage[];
  demoFolders: DemoFolderMeta[];
  projectConfigSchema?: string;
}

export interface ProjectsIndex {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    publishedAt: number;
    publishedVersion: string;
    demoCount: number;
  }>;
  generatedAt: number;
}

export interface PublishResult {
  projectId: string;
  publishedVersion: string;
  publishedAt: number;
  demoCount: number;
  duration: number;
}

export function getPublishedDir(): string {
  return PUBLISHED_DIR;
}

export async function publishProject(projectId: string): Promise<PublishResult> {
  const startTime = Date.now();

  if (!projectExists(projectId)) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  const project = readProjectMeta(projectId);
  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  const workspacePath = path.join(getProjectPath(projectId), 'workspace');
  const demoPages = listDemoPages(workspacePath);

  if (demoPages.length === 0) {
    throw new Error('NO_CONTENT_TO_PUBLISH');
  }

  const publishedProjectDir = path.join(PUBLISHED_DIR, projectId);
  fs.mkdirSync(publishedProjectDir, { recursive: true });
  fs.mkdirSync(path.join(publishedProjectDir, 'demos'), { recursive: true });

  const publishedDemoPages: PublishedDemoPage[] = [];

  for (const page of demoPages) {
    const demoDir = getDemoDirPath(workspacePath, page.id);
    const codePath = path.join(demoDir, 'index.tsx');
    const schemaPath = path.join(demoDir, 'config.schema.json');

    if (!fs.existsSync(codePath)) continue;

    const tsxSource = fs.readFileSync(codePath, 'utf-8');
    const compileResult = compileCode(tsxSource, project.lockedDependencies);

    const demoPublishDir = path.join(publishedProjectDir, 'demos', page.id);
    fs.mkdirSync(demoPublishDir, { recursive: true });

    fs.writeFileSync(
      path.join(demoPublishDir, 'compiled.js'),
      compileResult.compiledCode,
    );

    let previewSize: PreviewSize | undefined;
    if (fs.existsSync(schemaPath)) {
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
      fs.writeFileSync(path.join(demoPublishDir, 'schema.json'), schemaContent);
      previewSize = extractPreviewSize(schemaContent);
    }

    publishedDemoPages.push({
      id: page.id,
      name: page.name,
      order: page.order,
      parentId: page.parentId,
      compiledJsPath: `demos/${page.id}/compiled.js`,
      schemaPath: fs.existsSync(schemaPath) ? `demos/${page.id}/schema.json` : undefined,
      previewSize,
    });
  }

  if (publishedDemoPages.length === 0) {
    throw new Error('NO_CONTENT_TO_PUBLISH');
  }

  const projectConfigSchema = getProjectConfigSchema(workspacePath);
  if (projectConfigSchema) {
    fs.writeFileSync(
      path.join(publishedProjectDir, 'config-schema.json'),
      projectConfigSchema,
    );
  }

  if (project.thumbnail) {
    const thumbnailSrc = path.join(getProjectPath(projectId), project.thumbnail);
    if (fs.existsSync(thumbnailSrc)) {
      fs.copyFileSync(thumbnailSrc, path.join(publishedProjectDir, 'thumbnail.png'));
    }
  }

  const currentVersion = project.versions.length > 0
    ? project.versions[project.versions.length - 1].versionId
    : 'v0';

  const publishedProject: PublishedProject = {
    id: project.id,
    name: project.name,
    description: project.description,
    thumbnail: `/data/${projectId}/thumbnail.png`,
    publishedVersion: currentVersion,
    publishedAt: Date.now(),
    demoPages: publishedDemoPages,
    demoFolders: project.demoFolders,
    projectConfigSchema: projectConfigSchema ?? undefined,
  };

  fs.writeFileSync(
    path.join(publishedProjectDir, 'project.json'),
    JSON.stringify(publishedProject, null, 2),
  );

  project.publishedVersion = currentVersion;
  project.publishedAt = Date.now();
  writeProjectMeta(projectId, project);

  regenerateProjectsIndex();

  return {
    projectId,
    publishedVersion: currentVersion,
    publishedAt: project.publishedAt,
    demoCount: publishedDemoPages.length,
    duration: Date.now() - startTime,
  };
}

export function regenerateProjectsIndex(): void {
  const projects: ProjectsIndex['projects'] = [];

  if (!fs.existsSync(PUBLISHED_DIR)) return;

  for (const dirName of fs.readdirSync(PUBLISHED_DIR)) {
    const projectJsonPath = path.join(PUBLISHED_DIR, dirName, 'project.json');
    if (!fs.existsSync(projectJsonPath)) continue;

    try {
      const data = JSON.parse(fs.readFileSync(projectJsonPath, 'utf-8'));
      projects.push({
        id: data.id,
        name: data.name,
        description: data.description,
        thumbnail: data.thumbnail,
        publishedAt: data.publishedAt,
        publishedVersion: data.publishedVersion,
        demoCount: data.demoPages?.length ?? 0,
      });
    } catch {
      continue;
    }
  }

  projects.sort((a, b) => b.publishedAt - a.publishedAt);

  const index: ProjectsIndex = {
    projects,
    generatedAt: Date.now(),
  };

  fs.writeFileSync(
    path.join(PUBLISHED_DIR, 'projects-index.json'),
    JSON.stringify(index, null, 2),
  );
}

export function getPublishStatus(projectId: string): {
  projectId: string;
  publishedVersion: string | null;
  publishedAt: number | null;
  currentVersion: string | null;
  hasUnpublishedChanges: boolean;
  status: 'never_published' | 'published' | 'unpublished_changes';
} {
  const project = readProjectMeta(projectId);
  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }

  const currentVersion = project.versions.length > 0
    ? project.versions[project.versions.length - 1].versionId
    : undefined;

  const status = !project.publishedVersion
    ? 'never_published'
    : project.publishedVersion === currentVersion
      ? 'published'
      : 'unpublished_changes';

  return {
    projectId: project.id,
    publishedVersion: project.publishedVersion ?? null,
    publishedAt: project.publishedAt ?? null,
    currentVersion: currentVersion ?? null,
    hasUnpublishedChanges: status === 'unpublished_changes',
    status,
  };
}
