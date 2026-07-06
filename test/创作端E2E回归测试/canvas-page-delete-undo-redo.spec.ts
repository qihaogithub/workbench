// maintained-by: h5-test
import {
  expect,
  type APIResponse,
  type Page,
  type Response as PlaywrightResponse,
  test,
} from '@playwright/test';

import { createE2EProject } from './support/e2e-projects';

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

type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type DemoMeta = {
  id: string;
  name: string;
};

type SessionCreateResult = {
  sessionId: string;
};

type DemoPageMeta = {
  id: string;
  name: string;
  order?: number;
};

type SessionFilesResult = {
  demos: Record<string, { code: string; schema: string }>;
  demoPages: DemoPageMeta[];
};

async function parseApiResponse<T>(
  response: APIResponse | PlaywrightResponse,
): Promise<ApiSuccess<T>> {
  const body = (await response.json()) as ApiResult<T>;
  const diagnostic = JSON.stringify(
    {
      method:
        'request' in response && typeof response.request === 'function'
          ? response.request().method()
          : undefined,
      url: response.url(),
      status: response.status(),
      body,
    },
    null,
    2,
  );
  expect(response.ok(), diagnostic).toBeTruthy();
  expect(body.success, diagnostic).toBe(true);
  return body as ApiSuccess<T>;
}

async function loginForApiAndEditor(page: Page): Promise<void> {
  const response = await page.request.post('/api/auth/login', {
    data: {
      username: E2E_USER,
      password: E2E_PASSWORD,
    },
  });
  await parseApiResponse<unknown>(response);
}

function waitForEditSession(page: Page, projectId: string): Promise<PlaywrightResponse> {
  return page.waitForResponse(async (response) => {
    if (!response.url().endsWith('/api/sessions')) return false;
    if (response.request().method() !== 'POST') return false;

    try {
      const postData = response.request().postDataJSON() as { demoId?: string };
      return postData.demoId === projectId;
    } catch {
      return false;
    }
  });
}

async function createSession(page: Page, projectId: string): Promise<string> {
  const response = await page.request.post('/api/sessions', {
    data: { demoId: projectId, forceNew: true },
  });
  const body = await parseApiResponse<SessionCreateResult>(response);
  return body.data.sessionId;
}

async function createDemoPage(
  page: Page,
  projectId: string,
  sessionId: string,
  name: string,
): Promise<DemoPageMeta> {
  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: { sessionId, name },
  });
  const body = await parseApiResponse<DemoPageMeta>(response);
  expect(body.data.id).toBeTruthy();
  return body.data;
}

async function persistWorkspace(page: Page, sessionId: string): Promise<void> {
  const response = await page.request.post(`/api/sessions/${sessionId}/persist-workspace`);
  await parseApiResponse<unknown>(response);
}

async function getSessionFiles(page: Page, sessionId: string): Promise<SessionFilesResult> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files`);
  const body = await parseApiResponse<SessionFilesResult>(response);
  return body.data;
}

async function createCanvasDeleteProject(
  page: Page,
): Promise<{
  project: DemoMeta;
  keepPage: DemoPageMeta;
  targetPage: DemoPageMeta;
}> {
  const project = await createE2EProject(page, '画布删除撤回重做回归');
  const setupSessionId = await createSession(page, project.id);
  const keepPage = await createDemoPage(page, project.id, setupSessionId, '保留页面');
  const targetPage = await createDemoPage(page, project.id, setupSessionId, '画布待删除页面');
  await persistWorkspace(page, setupSessionId);

  return { project, keepPage, targetPage };
}

async function openEditorCanvas(
  page: Page,
  project: DemoMeta,
): Promise<string> {
  const editSessionPromise = waitForEditSession(page, project.id);
  await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
    timeout: 30000,
  });
  const sessionBody = await parseApiResponse<SessionCreateResult>(
    await editSessionPromise,
  );

  await page.getByRole('button', { name: /^画布$/ }).click();
  await expect(page.locator('[data-canvas-root="true"]')).toBeVisible({
    timeout: 30000,
  });

  return sessionBody.data.sessionId;
}

test.describe('画布页面删除与撤回重做', () => {
  test('选中画布页面后 Delete 删除，撤回恢复，重做再次删除并持久化', async ({ page }) => {
    await loginForApiAndEditor(page);
    const { project, keepPage, targetPage } = await createCanvasDeleteProject(page);
    const editSessionId = await openEditorCanvas(page, project);

    const canvasRoot = page.locator('[data-canvas-root="true"]');
    const targetCanvasPage = canvasRoot.locator(`[data-page-id="${targetPage.id}"]`);
    const keepCanvasPage = canvasRoot.locator(`[data-page-id="${keepPage.id}"]`);
    await expect(targetCanvasPage).toBeVisible({ timeout: 30000 });
    await expect(keepCanvasPage).toBeVisible({ timeout: 30000 });

    await targetCanvasPage.click();
    page.once('dialog', (dialog) => dialog.accept());
    const deleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${project.id}/demos/${targetPage.id}`) &&
        response.request().method() === 'DELETE',
    );
    await page.keyboard.press('Delete');
    await parseApiResponse<unknown>(await deleteResponsePromise);
    await expect(targetCanvasPage).toHaveCount(0);

    const filesAfterDelete = await getSessionFiles(page, editSessionId);
    expect(filesAfterDelete.demoPages.some((item) => item.id === targetPage.id)).toBe(
      false,
    );

    const restoreResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${project.id}/demos/${targetPage.id}`) &&
        response.request().method() === 'POST',
    );
    await page.getByTitle('撤回 (Cmd/Ctrl+Z)').click();
    await parseApiResponse<DemoPageMeta>(await restoreResponsePromise);
    await expect(canvasRoot.locator(`[data-page-id="${targetPage.id}"]`)).toBeVisible({
      timeout: 10000,
    });

    const filesAfterUndo = await getSessionFiles(page, editSessionId);
    expect(filesAfterUndo.demoPages.some((item) => item.id === targetPage.id)).toBe(
      true,
    );

    page.once('dialog', (dialog) => dialog.accept());
    const redoDeleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/projects/${project.id}/demos/${targetPage.id}`) &&
        response.request().method() === 'DELETE',
    );
    await page.getByTitle('重做 (Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y)').click();
    await parseApiResponse<unknown>(await redoDeleteResponsePromise);
    await expect(canvasRoot.locator(`[data-page-id="${targetPage.id}"]`)).toHaveCount(0);
    await expect(keepCanvasPage).toBeVisible();

    await persistWorkspace(page, editSessionId);
    const reopenedSessionId = await createSession(page, project.id);
    const reopenedFiles = await getSessionFiles(page, reopenedSessionId);
    expect(
      reopenedFiles.demoPages.some((item) => item.id === targetPage.id),
      `持久化后新 session 不应包含已重做删除的页面，当前页面: ${JSON.stringify(
        reopenedFiles.demoPages,
      )}`,
    ).toBe(false);
    expect(reopenedFiles.demoPages.some((item) => item.id === keepPage.id)).toBe(true);
    expect(reopenedFiles.demos[targetPage.id]).toBeUndefined();
  });
});
