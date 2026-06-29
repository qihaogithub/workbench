// maintained-by: h5-test
import { expect, type APIResponse, type Page, test } from '@playwright/test';

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const USERNAME = process.env.E2E_USER ?? process.env.E2E_USERNAME ?? 'qihao';
const PASSWORD = process.env.E2E_PASSWORD ?? '130015';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

type DemoPageMeta = {
  id: string;
  name: string;
  order: number;
};

type SessionInfo = {
  sessionId: string;
};

type ProjectInfo = {
  id: string;
  name: string;
};

type SessionFiles = {
  demoPages: DemoPageMeta[];
  demos: Record<string, { code: string; schema: string }>;
  projectConfigSchema?: string | null;
};

type ProjectConfig = {
  schema: string | null;
  exists: boolean;
};

const sharedConfigSchema = JSON.stringify({
  type: 'object',
  properties: {
    sharedTitle: {
      type: 'string',
      title: 'Shared Title E2E',
      default: 'shared-default-e2e',
    },
  },
});

const conflictingProjectSchema = JSON.stringify({
  type: 'object',
  properties: {
    pageTitle: {
      type: 'string',
      title: 'Conflicting Page Title E2E',
      default: 'conflict-e2e',
    },
  },
});

function pageConfigSchema(fieldName: 'pageTitle' | 'pageCta', title: string, defaultValue: string): string {
  return JSON.stringify({
    type: 'object',
    properties: {
      [fieldName]: {
        type: 'string',
        title,
        default: defaultValue,
      },
    },
  });
}

function demoPageCode(pageLabel: string): string {
  return `
import React from 'react';

type Props = {
  sharedTitle?: string;
  pageTitle?: string;
  pageCta?: string;
};

export default function ConfigRegressionPage(props: Props) {
  return (
    <main style={{ minHeight: '100vh', padding: 24, fontFamily: 'Arial, sans-serif' }}>
      <h1>{props.sharedTitle ?? 'missing-shared-e2e'}</h1>
      <p data-testid="page-label">${pageLabel}</p>
      <p>{props.pageTitle ?? 'missing-page-title-e2e'}</p>
      <button type="button">{props.pageCta ?? 'missing-page-cta-e2e'}</button>
    </main>
  );
}
`.trim();
}

async function parseApiResponse<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.success || body.data === undefined) {
    throw new Error(`API failed: ${JSON.stringify(body)}`);
  }
  return body.data;
}

async function loginIfNeeded(page: Page): Promise<void> {
  if (page.url() === 'about:blank') {
    await page.goto(E2E_BASE_URL, { waitUntil: 'domcontentloaded' });
  }
  if (!page.url().includes('/login')) {
    return;
  }

  await page.waitForLoadState('networkidle');
  await page.locator('#username').fill(USERNAME);
  await page.locator('#password').fill(PASSWORD);

  const loginResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST',
    { timeout: 15000 },
  );
  await page.getByRole('button', { name: /^登录$/ }).click();

  const loginResponse = await loginResponsePromise;
  await parseApiResponse(loginResponse);
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

async function createProjectFromUi(page: Page, projectName: string): Promise<ProjectInfo> {
  const newProjectButton = page.getByRole('button', {
    name: /添加空白项目|新建 Demo|添加项目|新建项目/,
  });
  await expect(newProjectButton).toBeVisible();
  await newProjectButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#project-name').fill(projectName);

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/demos') && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: /创建|创建项目/ }).click();

  const response = await responsePromise;
  const project = await parseApiResponse<ProjectInfo>(response);

  await page.waitForURL(
    (url) => url.pathname === `/demo/${project.id}/edit` || url.pathname.startsWith('/login'),
    { timeout: 30000 },
  );
  await loginIfNeeded(page);
  await page.waitForURL((url) => url.pathname === `/demo/${project.id}/edit`, { timeout: 30000 });
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible({ timeout: 30000 });

  return project;
}

async function createSession(page: Page, projectId: string): Promise<SessionInfo> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/sessions`, {
    data: { demoId: projectId, forceNew: true },
  });
  return parseApiResponse<SessionInfo>(response);
}

async function getSessionFiles(page: Page, sessionId: string): Promise<SessionFiles> {
  const response = await page.request.get(`${E2E_BASE_URL}/api/sessions/${sessionId}/files`);
  return parseApiResponse<SessionFiles>(response);
}

async function createDemoPage(page: Page, projectId: string, sessionId: string, name: string): Promise<DemoPageMeta> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/projects/${projectId}/demos`, {
    data: { sessionId, name },
  });
  return parseApiResponse<DemoPageMeta>(response);
}

async function updateSessionPage(
  page: Page,
  sessionId: string,
  pageId: string,
  payload: { code: string; schema: string },
): Promise<void> {
  const response = await page.request.put(`${E2E_BASE_URL}/api/sessions/${sessionId}/files/${pageId}`, {
    data: payload,
  });
  expect(response.ok()).toBeTruthy();
}

async function updateProjectConfigSchema(page: Page, projectId: string, sessionId: string, schema: string): Promise<APIResponse> {
  return page.request.put(`${E2E_BASE_URL}/api/projects/${projectId}/config`, {
    data: { sessionId, schema },
  });
}

async function getProjectConfig(page: Page, projectId: string): Promise<ProjectConfig> {
  const response = await page.request.get(`${E2E_BASE_URL}/api/projects/${projectId}/config`);
  return parseApiResponse<ProjectConfig>(response);
}

async function saveSession(page: Page, sessionId: string): Promise<void> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/sessions/${sessionId}/save`, {
    data: { note: '配置功能 E2E 回归保存' },
  });
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
}

async function deleteProject(page: Page, projectId: string): Promise<void> {
  try {
    const response = await page.request.delete(`${E2E_BASE_URL}/api/demos/${projectId}`, {
      timeout: 15000,
    });
    expect([200, 404]).toContain(response.status());
  } catch (error) {
    console.warn(`配置功能 E2E 清理项目失败，需后续清理 ${projectId}:`, error);
  }
}

async function ensureTwoPages(page: Page, projectId: string, sessionId: string): Promise<[DemoPageMeta, DemoPageMeta]> {
  const files = await getSessionFiles(page, sessionId);
  const pages = [...files.demoPages].sort((a, b) => a.order - b.order);

  while (pages.length < 2) {
    const next = await createDemoPage(page, projectId, sessionId, `配置页 ${pages.length + 1}`);
    pages.push(next);
  }

  return [pages[0], pages[1]];
}

async function seedConfigPages(page: Page, sessionId: string, firstPage: DemoPageMeta, secondPage: DemoPageMeta): Promise<void> {
  await updateSessionPage(page, sessionId, firstPage.id, {
    code: demoPageCode('page-one-runtime-e2e'),
    schema: pageConfigSchema('pageTitle', 'Page One Title E2E', 'page-one-default-e2e'),
  });

  await updateSessionPage(page, sessionId, secondPage.id, {
    code: demoPageCode('page-two-runtime-e2e'),
    schema: pageConfigSchema('pageCta', 'Page Two CTA E2E', 'page-two-default-e2e'),
  });
}

async function switchToCanvas(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^画布$/ }).click();
  await expect(page.locator('[data-canvas-root="true"]')).toBeVisible({ timeout: 20000 });
}

async function clickCanvasBlank(page: Page): Promise<void> {
  const canvasRoot = page.locator('[data-canvas-root="true"]');
  await expect(canvasRoot).toBeVisible();
  const box = await canvasRoot.boundingBox();
  if (!box) {
    throw new Error('Canvas root has no bounding box');
  }
  await page.mouse.click(box.x + box.width - 24, box.y + box.height - 24);
}

async function selectPreviewPage(page: Page, pageName: string): Promise<void> {
  const trigger = page.getByRole('combobox').filter({ hasText: /配置页/ }).last();
  await expect(trigger).toBeVisible({ timeout: 30000 });
  await trigger.click();
  const option = page.getByRole('option', { name: pageName, exact: true });
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
  await expect(trigger).toContainText(pageName, {
    timeout: 30000,
  });
}

test.describe('创作端配置功能回归', () => {
  test.describe.configure({ timeout: 180000 });

  test('覆盖项目级配置、页面级配置、画布选中联动、空白选择和 schema 冲突', async ({ page }) => {
    const projectName = `配置功能回归-${Date.now()}`;
    let project: ProjectInfo | undefined;

    await loginIfNeeded(page);

    try {
      await page.goto(E2E_BASE_URL, { waitUntil: 'networkidle' });

      project = await createProjectFromUi(page, projectName);
      const initialSession = await createSession(page, project.id);

      const [firstPage, secondPage] = await ensureTwoPages(page, project.id, initialSession.sessionId);
      await seedConfigPages(page, initialSession.sessionId, firstPage, secondPage);

      const conflictResponse = await updateProjectConfigSchema(page, project.id, initialSession.sessionId, conflictingProjectSchema);
      expect(conflictResponse.status()).toBe(400);
      const conflictBody = (await conflictResponse.json()) as ApiEnvelope<unknown>;
      expect(conflictBody.success).toBe(false);
      expect(conflictBody.error?.code).toBe('SCHEMA_CONFLICT');

      const projectConfigResponse = await updateProjectConfigSchema(page, project.id, initialSession.sessionId, sharedConfigSchema);
      expect(projectConfigResponse.ok()).toBeTruthy();
      await saveSession(page, initialSession.sessionId);

      const persistedProjectConfig = await getProjectConfig(page, project.id);
      expect(persistedProjectConfig.exists).toBe(true);
      expect(persistedProjectConfig.schema).toContain('Shared Title E2E');

      const reopenedSession = await createSession(page, project.id);
      await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, { waitUntil: 'domcontentloaded' });
      const reopenedFiles = await getSessionFiles(page, reopenedSession.sessionId);
      expect(reopenedFiles.projectConfigSchema).toContain('Shared Title E2E');
      expect(reopenedFiles.demos[firstPage.id].schema).toContain('Page One Title E2E');
      expect(reopenedFiles.demos[secondPage.id].schema).toContain('Page Two CTA E2E');

      await expect(page.getByText('Shared Title E2E')).toBeVisible({ timeout: 30000 });
      await selectPreviewPage(page, secondPage.name);
      await expect(page.getByText('Page Two CTA E2E')).toBeVisible({ timeout: 30000 });

      const sharedTitleInput = page.getByPlaceholder('请输入Shared Title E2E');
      const pageTitleInput = page.getByPlaceholder('请输入Page Two CTA E2E');
      await sharedTitleInput.fill('shared-updated-e2e', { timeout: 5000 });
      await pageTitleInput.fill('page-two-updated-e2e', { timeout: 5000 });
      await expect(sharedTitleInput).toHaveValue('shared-updated-e2e');
      await expect(pageTitleInput).toHaveValue('page-two-updated-e2e');

      await switchToCanvas(page);
      await clickCanvasBlank(page);
      await expect(page.getByRole('button', { name: firstPage.name }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: secondPage.name }).first()).toBeVisible();
      await expect(page.getByText('Page One Title E2E')).toBeHidden();
      await expect(page.getByText('Page Two CTA E2E')).toBeHidden();

      const canvasRoot = page.locator('[data-canvas-root="true"]');
      await canvasRoot.locator(`[data-page-id="${firstPage.id}"]`).click();
      await expect(page.getByText('Shared Title E2E')).toBeVisible();
      await expect(page.getByText('Page One Title E2E')).toBeVisible();
      await expect(page.getByText('Page Two CTA E2E')).toBeHidden();

      await canvasRoot.locator(`[data-page-id="${secondPage.id}"]`).click();
      await expect(page.getByText('Shared Title E2E')).toBeVisible();
      await expect(page.getByText('Page Two CTA E2E')).toBeVisible();
      await expect(page.getByText('Page One Title E2E')).toBeHidden();

      await clickCanvasBlank(page);
      await expect(page.getByRole('button', { name: firstPage.name }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: secondPage.name }).first()).toBeVisible();
      await expect(page.getByText('Page One Title E2E')).toBeHidden();
      await expect(page.getByText('Page Two CTA E2E')).toBeHidden();
    } finally {
      if (project) {
        await deleteProject(page, project.id);
      }
    }
  });
});
