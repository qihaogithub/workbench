// maintained-by: h5-test
import { expect, type APIResponse, type Page, test } from '@playwright/test';

import { loginE2EUser } from './support/e2e-auth';
import { getOrCreateSharedE2EProject } from './support/e2e-projects';

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const E2E_USER = process.env.E2E_USER ?? 'qihao';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '130015';
const SHARED_SUITE_NAME = '共享项目回归';

type ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error?: { code?: string; message?: string } };

type SessionInfo = {
  sessionId: string;
};

type DemoPageMeta = {
  id: string;
  name: string;
  order: number;
};

type SessionFiles = {
  demoPages: DemoPageMeta[];
  demos: Record<string, { code: string; schema: string }>;
};

async function parseApiResponse<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return (body as { success: true; data: T }).data;
}

async function openHome(page: Page): Promise<void> {
  await loginE2EUser(page, {
    baseURL: E2E_BASE_URL,
    username: E2E_USER,
    password: E2E_PASSWORD,
  });
  await page.goto(E2E_BASE_URL, { waitUntil: 'domcontentloaded' });
}

async function createSession(page: Page, projectId: string): Promise<SessionInfo> {
  const response = await page.request.post('/api/sessions', {
    data: { demoId: projectId, forceNew: true },
  });
  return parseApiResponse<SessionInfo>(response);
}

async function getSessionFiles(page: Page, sessionId: string): Promise<SessionFiles> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files`);
  return parseApiResponse<SessionFiles>(response);
}

async function ensureTargetPage(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<DemoPageMeta> {
  const files = await getSessionFiles(page, sessionId);
  const existing = [...files.demoPages].sort((a, b) => a.order - b.order)[0];
  if (existing) return existing;

  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: { sessionId, name: '共享回归页' },
  });
  return parseApiResponse<DemoPageMeta>(response);
}

function codeWithMarker(marker: string): string {
  return `
import React from 'react';

export default function SharedProjectRegressionPage() {
  return (
    <main data-testid="shared-project-regression" style={{ padding: 24 }}>
      <h1>共享项目回归</h1>
      <p>${marker}</p>
    </main>
  );
}
`.trim();
}

const SHARED_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    marker: {
      type: 'string',
      title: '共享项目标记',
      default: 'shared-regression',
    },
  },
});

async function updateSessionPage(
  page: Page,
  sessionId: string,
  pageId: string,
  marker: string,
): Promise<void> {
  const response = await page.request.put(`/api/sessions/${sessionId}/files/${pageId}`, {
    data: {
      code: codeWithMarker(marker),
      schema: SHARED_SCHEMA,
    },
  });
  await parseApiResponse<null>(response);
}

async function saveSession(page: Page, sessionId: string): Promise<void> {
  const response = await page.request.post(`/api/sessions/${sessionId}/save`, {
    data: { note: '共享项目回归保存' },
  });
  await parseApiResponse<unknown>(response);
}

test.describe.serial('创作端共享项目回归', () => {
  test.describe.configure({ timeout: 120000 });

  test('在专门共享项目中写入第一条回归标记', async ({ page }) => {
    await openHome(page);
    const project = await getOrCreateSharedE2EProject(page, SHARED_SUITE_NAME);
    const session = await createSession(page, project.id);
    const targetPage = await ensureTargetPage(page, project.id, session.sessionId);

    await updateSessionPage(
      page,
      session.sessionId,
      targetPage.id,
      'shared-regression-marker-one',
    );
    await saveSession(page, session.sessionId);

    const files = await getSessionFiles(page, session.sessionId);
    expect(files.demos[targetPage.id]?.code).toContain('shared-regression-marker-one');
  });

  test('后续回归继续编辑同一个共享项目', async ({ page }) => {
    await openHome(page);
    const project = await getOrCreateSharedE2EProject(page, SHARED_SUITE_NAME);
    const session = await createSession(page, project.id);
    const filesBefore = await getSessionFiles(page, session.sessionId);
    const targetPage = await ensureTargetPage(page, project.id, session.sessionId);

    expect(filesBefore.demos[targetPage.id]?.code).toContain(
      'shared-regression-marker-one',
    );

    await updateSessionPage(
      page,
      session.sessionId,
      targetPage.id,
      'shared-regression-marker-two',
    );
    await saveSession(page, session.sessionId);

    const filesAfter = await getSessionFiles(page, session.sessionId);
    expect(filesAfter.demos[targetPage.id]?.code).toContain(
      'shared-regression-marker-two',
    );
  });
});
