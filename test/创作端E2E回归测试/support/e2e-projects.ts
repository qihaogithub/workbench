import type { APIRequestContext, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const E2E_PROJECT_CATEGORY = '__e2e__';
export const E2E_PROJECT_STALE_MS = 24 * 60 * 60 * 1000;

export type E2EProjectMeta = {
  id: string;
  name: string;
  category?: string;
  createdAt?: number;
  updatedAt?: number;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

type E2ERunState = {
  runId: string;
  baseURL: string;
  startedAt: number;
  registryPath: string;
};

type E2EProjectRegistry = {
  runId: string;
  projects: E2EProjectMeta[];
};

export const outputRoot = path.join(__dirname, '..', 'test-outputs');
export const runStatePath = path.join(outputRoot, 'e2e-run.json');

function ensureOutputRoot(): void {
  fs.mkdirSync(outputRoot, { recursive: true });
}

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function registryPathForRun(runId: string): string {
  return path.join(outputRoot, `e2e-projects-${runId}.json`);
}

export function createE2ERunState(baseURL: string): E2ERunState {
  ensureOutputRoot();
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:.]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  const runId = `${timestamp}-${random}`;
  const state: E2ERunState = {
    runId,
    baseURL,
    startedAt: now.getTime(),
    registryPath: registryPathForRun(runId),
  };

  writeJsonFile(runStatePath, state);
  writeJsonFile(state.registryPath, { runId, projects: [] } satisfies E2EProjectRegistry);

  return state;
}

export function getE2ERunState(): E2ERunState {
  const state = readJsonFile<E2ERunState>(runStatePath);
  if (!state) {
    throw new Error(`E2E run state not found: ${runStatePath}`);
  }
  return state;
}

export function readE2EProjectRegistry(
  registryPath = getE2ERunState().registryPath,
): E2EProjectRegistry {
  return (
    readJsonFile<E2EProjectRegistry>(registryPath) ?? {
      runId: getE2ERunState().runId,
      projects: [],
    }
  );
}

export function registerE2EProject(project: E2EProjectMeta): void {
  const state = getE2ERunState();
  const registry = readE2EProjectRegistry(state.registryPath);
  const projects = registry.projects.filter((item) => item.id !== project.id);

  projects.push({
    id: project.id,
    name: project.name,
    category: project.category,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  });

  writeJsonFile(state.registryPath, {
    runId: state.runId,
    projects,
  } satisfies E2EProjectRegistry);
}

export function e2eProjectName(caseName: string): string {
  const state = getE2ERunState();
  const normalizedCaseName = caseName.trim().replace(/\s+/g, ' ');
  return `E2E:${state.runId}:${normalizedCaseName || '未命名用例'}`;
}

async function parseApiResponse<T>(response: { json(): Promise<unknown> }): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(`API failed: ${JSON.stringify(body)}`);
  }
  return body.data;
}

export async function createE2EProject(
  page: Page,
  caseName: string,
): Promise<E2EProjectMeta> {
  const response = await page.request.post('/api/demos', {
    data: {
      name: e2eProjectName(caseName),
      category: E2E_PROJECT_CATEGORY,
    },
  });
  const project = await parseApiResponse<E2EProjectMeta>(response);
  registerE2EProject(project);
  return project;
}

export async function ensureE2EProjectCategory(
  request: APIRequestContext,
  project: E2EProjectMeta,
): Promise<E2EProjectMeta> {
  if (project.category === E2E_PROJECT_CATEGORY) {
    registerE2EProject(project);
    return project;
  }

  const response = await request.patch(`/api/demos/${project.id}`, {
    data: { category: E2E_PROJECT_CATEGORY },
  });
  const updated = await parseApiResponse<{ id: string; name?: string; category?: string }>(
    response,
  );
  const nextProject = {
    ...project,
    name: updated.name ?? project.name,
    category: updated.category ?? E2E_PROJECT_CATEGORY,
  };
  registerE2EProject(nextProject);
  return nextProject;
}

export async function deleteE2EProject(
  request: APIRequestContext,
  projectId: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await request.delete(`/api/demos/${projectId}`);
  const status = response.status();
  const body = await response.text().catch(() => '');
  return {
    ok: response.ok() || status === 404,
    status,
    body,
  };
}

export function isStaleE2EProject(project: E2EProjectMeta, now = Date.now()): boolean {
  return (
    project.category === E2E_PROJECT_CATEGORY &&
    typeof project.createdAt === 'number' &&
    project.createdAt < now - E2E_PROJECT_STALE_MS
  );
}

export async function listProjects(request: APIRequestContext): Promise<E2EProjectMeta[]> {
  const response = await request.get('/api/demos');
  return parseApiResponse<E2EProjectMeta[]>(response);
}
