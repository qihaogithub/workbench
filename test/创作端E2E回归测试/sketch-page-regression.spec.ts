// maintained-by: h5-test
import { expect, type APIResponse, type Page, test } from '@playwright/test';

import { loginE2EUser } from './support/e2e-auth';
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

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

type SessionCreateResult = {
  sessionId: string;
};

type DemoPageMeta = {
  id: string;
  name: string;
  runtimeType?: string;
};

type SessionFilesResult = {
  demos: Record<string, { sketchScene?: string; sketchMeta?: Record<string, unknown> }>;
  demoPages: DemoPageMeta[];
};

async function parseApiResponse<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return (body as ApiSuccess<T>).data;
}

async function openHome(page: Page): Promise<void> {
  await loginE2EUser(page, {
    baseURL: E2E_BASE_URL,
    username: E2E_USER,
    password: E2E_PASSWORD,
  });
  await page.goto(E2E_BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
}

async function createSession(page: Page, projectId: string): Promise<SessionCreateResult> {
  const response = await page.request.post('/api/sessions', {
    data: { demoId: projectId, forceNew: true },
  });
  return parseApiResponse<SessionCreateResult>(response);
}

async function createSketchPage(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<DemoPageMeta> {
  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: {
      sessionId,
      name: '草图烟测页',
      runtimeType: 'sketch-scene',
    },
  });
  const created = await parseApiResponse<DemoPageMeta>(response);
  expect(created.runtimeType).toBe('sketch-scene');
  return created;
}

async function getSessionFiles(page: Page, sessionId: string): Promise<SessionFilesResult> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files`);
  return parseApiResponse<SessionFilesResult>(response);
}

test.describe('手绘页面回归', () => {
  test('创建手绘页面、进入编辑并添加文本', async ({ page }) => {
    test.setTimeout(120000);

    await openHome(page);

    const project = await createE2EProject(page, '手绘页面回归');
    const session = await createSession(page, project.id);
    const sketchPage = await createSketchPage(page, project.id, session.sessionId);
    const initialFiles = await getSessionFiles(page, session.sessionId);

    expect(initialFiles.demoPages.find((item) => item.id === sketchPage.id)?.runtimeType).toBe('sketch-scene');
    expect(initialFiles.demos[sketchPage.id]?.sketchScene).toContain('手绘页面');

    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });

    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);
    await expect(page.getByLabel('Sketch scene').getByText('手绘页面', { exact: true })).toBeVisible({
      timeout: 30000,
    });

    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.getByRole('button', { name: '选择', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'text' })).toBeVisible();
    await expect(page.getByText('选择一个对象')).toBeVisible();

    await page.getByRole('button', { name: 'text' }).click();
    await page.locator('[data-sketch-stage]').click({ position: { x: 420, y: 220 } });
    await page.getByPlaceholder('对象文本').fill('手绘烟测文本');

    await expect(page.getByLabel('Sketch scene').getByText('手绘烟测文本')).toBeVisible();
  });
});
