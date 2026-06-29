// maintained-by: h5-test
import { expect, type APIResponse, type Page, test } from '@playwright/test';
import * as crypto from 'crypto';

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const E2E_USER = process.env.E2E_USER ?? 'qihao';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '130015';

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type DemoMeta = {
  id: string;
  name: string;
};

type SessionCreateResult = {
  sessionId: string;
  workspaceId?: string | null;
};

type DemoPageMeta = {
  id: string;
  name: string;
};

type SessionFilesResult = {
  demos: Record<string, { code: string; schema: string }>;
  demoPages: DemoPageMeta[];
};

type SaveSessionResult = {
  sessionId: string;
  version?: string;
  savedAt?: number;
};

const CORE_FLOW_CODE = `import React from 'react';

interface CoreFlowRegressionProps {
  title: string;
  description: string;
  enabled: boolean;
}

export default function CoreFlowRegression({
  title,
  description,
  enabled,
}: CoreFlowRegressionProps) {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-slate-950">
      <p className="text-sm font-medium text-emerald-700">core-flow-regression</p>
      <h1 className="mt-3 text-3xl font-bold">{title}</h1>
      <p className="mt-4 text-base text-slate-600">{description}</p>
      <span className="mt-6 inline-flex rounded-md bg-slate-950 px-3 py-2 text-sm text-white">
        {enabled ? '已启用' : '未启用'}
      </span>
    </main>
  );
}
`;

const CORE_FLOW_SCHEMA = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: '核心流程回归配置',
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: '标题',
        default: '核心流程回归',
      },
      description: {
        type: 'string',
        title: '描述',
        default: '用于验证创作端新建、编辑、保存和读取链路。',
      },
      enabled: {
        type: 'boolean',
        title: '启用状态',
        default: true,
      },
    },
    required: ['title', 'description'],
  },
  null,
  2,
);

async function parseApiResponse<T>(response: APIResponse): Promise<ApiSuccess<T>> {
  const body = (await response.json()) as ApiResponse<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return body as ApiSuccess<T>;
}

async function loginIfNeeded(page: Page): Promise<void> {
  if (!page.url().includes('/login')) return;

  await page.locator('#username').fill(E2E_USER);
  await page.locator('#password').fill(E2E_PASSWORD);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/login') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /^登录$/ }).click();

  const loginResponse = await loginResponsePromise;
  await parseApiResponse(loginResponse);
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

async function openHome(page: Page): Promise<void> {
  await page.goto(E2E_BASE_URL, { waitUntil: 'domcontentloaded' });
  await loginIfNeeded(page);
  await page.waitForLoadState('networkidle');
}

async function createProjectFromUi(
  page: Page,
  projectName: string,
  onCreated?: (project: DemoMeta) => void,
): Promise<DemoMeta> {
  const newProjectButton = page.getByRole('button', {
    name: /添加空白项目|新建 Demo|添加项目|新建项目/,
  });
  await expect(newProjectButton).toBeVisible();
  await newProjectButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#project-name').fill(projectName);

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/demos') &&
      response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: /创建|创建项目/ }).click();

  const createResponse = await createResponsePromise;
  const createBody = await parseApiResponse<DemoMeta>(createResponse);
  expect(createBody.data.name).toBe(projectName);
  onCreated?.(createBody.data);

  await page.waitForURL(
    (url) =>
      url.pathname === `/demo/${createBody.data.id}/edit` ||
      url.pathname.startsWith('/login'),
    { timeout: 30000 },
  );
  await loginIfNeeded(page);

  await page.waitForURL(
    (url) => url.pathname === `/demo/${createBody.data.id}/edit`,
    { timeout: 30000 },
  );
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole('button', { name: /同步并发布|创建版本并发布/ })).toBeVisible({
    timeout: 30000,
  });

  return createBody.data;
}

async function createSession(page: Page, projectId: string): Promise<SessionCreateResult> {
  const response = await page.request.post('/api/sessions', {
    data: { demoId: projectId, forceNew: true },
  });
  const body = await parseApiResponse<SessionCreateResult>(response);
  expect(body.data.sessionId).toMatch(/^session-/);
  return body.data;
}

async function getSessionFiles(page: Page, sessionId: string): Promise<SessionFilesResult> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files`);
  const body = await parseApiResponse<SessionFilesResult>(response);
  return body.data;
}

async function createDemoPage(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<DemoPageMeta> {
  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: {
      sessionId,
      name: '首页',
    },
  });
  const body = await parseApiResponse<DemoPageMeta>(response);
  expect(body.data.id).toBeTruthy();
  return body.data;
}

async function updateSessionPage(
  page: Page,
  sessionId: string,
  pageId: string,
): Promise<void> {
  const response = await page.request.put(`/api/sessions/${sessionId}/files/${pageId}`, {
    data: {
      code: CORE_FLOW_CODE,
      schema: CORE_FLOW_SCHEMA,
    },
  });
  await parseApiResponse<null>(response);
}

async function saveSession(page: Page, sessionId: string): Promise<SaveSessionResult> {
  const response = await page.request.post(`/api/sessions/${sessionId}/save`, {
    data: { note: '创作端核心流程回归' },
  });
  const body = await parseApiResponse<SaveSessionResult>(response);
  expect(body.data.sessionId).toBe(sessionId);
  expect(body.data.version).toBeTruthy();
  return body.data;
}

async function deleteProject(page: Page, projectId: string): Promise<void> {
  const response = await page.request.delete(`/api/demos/${projectId}`);
  await parseApiResponse<null>(response);
}

test.describe('创作端核心流程回归', () => {
  test('新建项目、写入页面文件、保存版本、重新读取并清理', async ({ page }) => {
    test.setTimeout(120000);

    const projectName = `核心流程回归-${crypto.randomBytes(4).toString('hex')}`;
    let projectId: string | undefined;

    try {
      await openHome(page);

      const project = await createProjectFromUi(page, projectName, (createdProject) => {
        projectId = createdProject.id;
      });

      const editSession = await createSession(page, project.id);
      const filesBeforeSave = await getSessionFiles(page, editSession.sessionId);
      const targetPage =
        filesBeforeSave.demoPages[0] ??
        (await createDemoPage(page, project.id, editSession.sessionId));

      await updateSessionPage(page, editSession.sessionId, targetPage.id);
      const filesAfterUpdate = await getSessionFiles(page, editSession.sessionId);
      expect(filesAfterUpdate.demos[targetPage.id]?.code).toContain('CoreFlowRegression');
      expect(filesAfterUpdate.demos[targetPage.id]?.schema).toContain('核心流程回归配置');

      await saveSession(page, editSession.sessionId);

      const persistedSession = await createSession(page, project.id);
      const persistedFiles = await getSessionFiles(page, persistedSession.sessionId);
      expect(persistedFiles.demos[targetPage.id]?.code).toContain('core-flow-regression');
      expect(persistedFiles.demos[targetPage.id]?.schema).toContain('核心流程回归配置');

      await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('heading', { name: projectName })).toBeVisible({
        timeout: 30000,
      });
      await expect(page.getByRole('button', { name: /同步并发布|创建版本并发布/ })).toBeVisible({
        timeout: 30000,
      });
    } finally {
      if (projectId) {
        await deleteProject(page, projectId);
      }
    }
  });
});
