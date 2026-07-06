// maintained-by: h5-test
import { expect, type APIResponse, type Browser, type Page, test } from '@playwright/test';

import { loginE2EUser } from './support/e2e-auth';
import { createE2EProject } from './support/e2e-projects';

const E2E_BASE_URL = process.env.E2E_OPENPENCIL_AUTHOR_BASE_URL ?? 'http://127.0.0.1:3212';
const E2E_USER = process.env.E2E_USER ?? 'qihao';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '130015';
const DEFAULT_COLLABORATION_STRESS_ITERATIONS = 10;
const COLLABORATION_STRESS_ITERATIONS = readPositiveIntegerEnv(
  'E2E_OPENPENCIL_COLLABORATION_STRESS_ITERATIONS',
  DEFAULT_COLLABORATION_STRESS_ITERATIONS,
);
const COLLABORATION_STRESS_TIMEOUT_MS =
  300000 +
  Math.max(0, COLLABORATION_STRESS_ITERATIONS - DEFAULT_COLLABORATION_STRESS_ITERATIONS) * 15000;

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

type SketchSceneDocument = {
  version: number;
  pageSize: {
    width: number;
    height: number;
  };
  nodes: Array<{
    id: string;
    type: string;
    name?: string;
    text?: string;
  }>;
};

type SessionFilesResult = {
  demos: Record<string, { sketchScene?: string; sketchMeta?: Record<string, unknown> }>;
  demoPages: DemoPageMeta[];
};

type OpenPencilDebugState = {
  pageId?: string;
  exportedScene?: SketchSceneDocument | null;
  dirtyNotifyCount: number;
  dirtyPostCount: number;
  lastDirtyNodeCount: number | null;
  lastPatchOperationCount?: number | null;
  lastHostPostType: string | null;
  lastHostPostError: string | null;
};

type CollaboratorWindow = {
  context: Awaited<ReturnType<Browser['newContext']>>;
  page: Page;
};

type CapturedSpikeMessage = {
  origin: string;
  type?: string;
  source?: string;
  pageId?: string;
  dirty?: boolean;
  nodeCount?: number;
  patchOperations?: unknown[];
  patchOperationCount?: number;
};

type BrowserApiResponse = {
  ok: boolean;
  status: number;
  text: string;
};

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) return fallback;
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < 1) return fallback;
  return parsedValue;
}

async function parseApiResponse<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  return parseApiResponseText({ ok: response.ok(), status: response.status(), text });
}

function parseApiResponseText<T>(response: BrowserApiResponse): T {
  let body: ApiEnvelope<T>;
  try {
    body = JSON.parse(response.text) as ApiEnvelope<T>;
  } catch {
    throw new Error(`API returned non-JSON ${response.status}: ${response.text.slice(0, 240)}`);
  }
  expect(response.ok, JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return (body as ApiSuccess<T>).data;
}

async function browserApiJson<T>(
  page: Page,
  path: string,
  options: { method?: string; data?: unknown } = {},
): Promise<T> {
  const response = await page.evaluate(
    async ({ requestPath, requestOptions }) => {
      const headers: Record<string, string> = {};
      const init: RequestInit = {
        method: requestOptions.method ?? 'GET',
        credentials: 'include',
        headers,
      };
      if (requestOptions.data !== undefined) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(requestOptions.data);
      }
      const apiResponse = await fetch(requestPath, init);
      return {
        ok: apiResponse.ok,
        status: apiResponse.status,
        text: await apiResponse.text(),
      };
    },
    { requestPath: path, requestOptions: options },
  );
  return parseApiResponseText<T>(response);
}

async function retryApi<T>(label: string, action: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt === 5) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${label} failed after retries: ${String(lastError)}`);
}

async function openHomeAs(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  const authToken = await loginE2EUser(page, {
    baseURL: E2E_BASE_URL,
    username: credentials.username,
    password: credentials.password,
  });
  await page.goto(`${E2E_BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((token) => {
    document.cookie = `auth_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
  }, authToken);
  const visibleCookie = await page.evaluate(() => document.cookie);
  expect(visibleCookie).toContain('auth_token=');
}

async function openHome(page: Page): Promise<void> {
  await openHomeAs(page, { username: E2E_USER, password: E2E_PASSWORD });
}

async function registerE2EUser(
  page: Page,
  credentials: { username: string; password: string },
): Promise<void> {
  const response = await page.request.post(`${E2E_BASE_URL}/api/auth/register`, {
    data: credentials,
  });
  if (response.status() === 409) return;
  const text = await response.text();
  expect(response.ok(), text).toBe(true);
  parseApiResponseText<{ user: { id: string; username: string } }>({
    ok: response.ok(),
    status: response.status(),
    text,
  });
}

function createE2EUsername(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
}

async function openCollaboratorWindow(
  browser: Browser,
  credentials?: { username: string; password: string },
): Promise<CollaboratorWindow> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  if (credentials) {
    await openHomeAs(page, credentials);
  } else {
    await openHome(page);
  }
  return { context, page };
}

async function createSession(
  page: Page,
  projectId: string,
): Promise<SessionCreateResult> {
  return retryApi('create session', async () => {
    return browserApiJson<SessionCreateResult>(page, '/api/sessions', {
      method: 'POST',
      data: { demoId: projectId, forceNew: true },
    });
  });
}

async function createSketchPage(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<DemoPageMeta> {
  return retryApi('create sketch page', async () => {
    const created = await browserApiJson<DemoPageMeta>(page, `/api/projects/${projectId}/demos`, {
      method: 'POST',
      data: {
        sessionId,
        name: 'OpenPencil 集成回归页',
        runtimeType: 'sketch-scene',
      },
    });
    expect(created.runtimeType).toBe('sketch-scene');
    return created;
  });
}

async function getSessionFiles(
  page: Page,
  sessionId: string,
): Promise<SessionFilesResult> {
  return retryApi('get session files', async () => {
    return browserApiJson<SessionFilesResult>(page, `/api/sessions/${sessionId}/files`);
  });
}

async function persistSessionWorkspace(page: Page, sessionId: string): Promise<void> {
  await retryApi('persist session workspace', async () => {
    await browserApiJson<unknown>(page, `/api/sessions/${sessionId}/persist-workspace`, {
      method: 'POST',
    });
  });
}

async function updateSessionSketchScene(
  page: Page,
  sessionId: string,
  pageId: string,
  scene: SketchSceneDocument,
): Promise<void> {
  await retryApi('update session sketch scene', async () => {
    await browserApiJson<unknown>(page, `/api/sessions/${sessionId}/files/${pageId}`, {
      method: 'PUT',
      data: {
        sketchScene: JSON.stringify(scene, null, 2),
      },
    });
  });
}

async function setProjectSketchEditorEngine(
  page: Page,
  projectId: string,
  engine: 'native' | 'openpencil',
): Promise<void> {
  await retryApi(`set ${engine} sketch editor preference`, async () => {
    await browserApiJson<{ id: string; authoringPreferences?: { sketchEditorEngine?: string } }>(
      page,
      `/api/demos/${projectId}`,
      {
        method: 'PATCH',
        data: {
          authoringPreferences: {
            sketchEditorEngine: engine,
          },
        },
      },
    );
  });
}

async function waitForProjectVisible(page: Page, projectId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        try {
          const response = await page.request.get('/api/demos');
          const projects = await parseApiResponse<Array<{ id: string }>>(response);
          return projects.some((project) => project.id === projectId);
        } catch {
          return false;
        }
      },
      { timeout: 30000 },
    )
    .toBe(true);
}

async function readOpenPencilDebug(page: Page): Promise<OpenPencilDebugState> {
  const frameElement = await page
    .locator('iframe[title="手绘编辑器"]')
    .elementHandle();
  const frame = await frameElement?.contentFrame();
  if (!frame) throw new Error('OpenPencil iframe is unavailable');

  return frame.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const debug = scope.__OPENPENCIL_SPIKE_DEBUG__?.();
    if (!debug) throw new Error('OpenPencil debug hook is unavailable');
    return debug;
  });
}

async function waitForExportedNodeCount(page: Page, minNodeCount: number): Promise<void> {
  const frameElement = await page
    .locator('iframe[title="手绘编辑器"]')
    .elementHandle();
  const frame = await frameElement?.contentFrame();
  if (!frame) throw new Error('OpenPencil iframe is unavailable');

  await frame.waitForFunction((expected) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return Array.isArray(nodes) && nodes.length >= expected;
  }, minNodeCount);
}

function sceneWithNodeText(
  scene: SketchSceneDocument,
  nodeId: string,
  text: string,
): SketchSceneDocument {
  return {
    ...scene,
    nodes: scene.nodes.map((node) => (node.id === nodeId ? { ...node, text } : node)),
  };
}

test.describe('OpenPencil 创作端接入回归', () => {
  test('通过 iframe 进入手绘编辑态、产生 draft 并显式保存到 session workspace', async ({ page }) => {
    test.setTimeout(120000);

    await openHome(page);

    const project = await createE2EProject(page, 'OpenPencil 创作端接入回归');
    await waitForProjectVisible(page, project.id);
    const session = await createSession(page, project.id);
    const sketchPage = await createSketchPage(page, project.id, session.sessionId);
    const initialFiles = await getSessionFiles(page, session.sessionId);
    const initialSceneText = initialFiles.demos[sketchPage.id]?.sketchScene;
    expect(initialSceneText).toBeTruthy();
    const initialScene = JSON.parse(initialSceneText ?? '{}') as SketchSceneDocument;
    const initialNodeCount = initialScene.nodes.length;

    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);

    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.getByText('手绘编辑器: loaded')).toBeVisible({
      timeout: 30000,
    });

    await page.evaluate(() => {
      const scope = window as typeof window & {
        __OPENPENCIL_CAPTURED_MESSAGES__?: CapturedSpikeMessage[];
        __OPENPENCIL_CAPTURE_INSTALLED__?: boolean;
      };
      scope.__OPENPENCIL_CAPTURED_MESSAGES__ = [];
      if (scope.__OPENPENCIL_CAPTURE_INSTALLED__) return;
      scope.__OPENPENCIL_CAPTURE_INSTALLED__ = true;
      window.addEventListener('message', (event: MessageEvent<CapturedSpikeMessage>) => {
        if (event.data?.source !== 'openpencil-spike') return;
        scope.__OPENPENCIL_CAPTURED_MESSAGES__?.push({
          origin: event.origin,
          type: event.data.type,
          source: event.data.source,
          pageId: event.data.pageId,
          dirty: event.data.dirty,
          nodeCount: event.data.nodeCount,
          patchOperationCount: event.data.patchOperations?.length,
        });
      });
    });

    const openPencilFrame = page.frameLocator('iframe[title="手绘编辑器"]');
    await expect(openPencilFrame.getByRole('button', { name: 'Duplicate' })).toBeVisible();

    const loadedDebug = await readOpenPencilDebug(page);
    expect(loadedDebug.pageId).toBe(sketchPage.id);
    expect(loadedDebug.exportedScene?.nodes.length).toBe(initialNodeCount);

    await openPencilFrame.getByRole('button', { name: 'Duplicate' }).click();
    await waitForExportedNodeCount(page, initialNodeCount + 1);
    await expect
      .poll(async () => {
        const messages = await page.evaluate(() => {
          const scope = window as typeof window & {
            __OPENPENCIL_CAPTURED_MESSAGES__?: CapturedSpikeMessage[];
          };
          return scope.__OPENPENCIL_CAPTURED_MESSAGES__ ?? [];
        });
        const debug = await readOpenPencilDebug(page);
        return JSON.stringify({ messages, debug });
      })
      .toContain('openpencil-spike/dirty-state');
    await expect(page.getByText(/手绘编辑器: dirty .* draft/)).toBeVisible();

    const dirtyDebug = await readOpenPencilDebug(page);
    const copiedNodeId = dirtyDebug.exportedScene?.nodes
      .map((node) => node.id)
      .find((id) => id.endsWith('-copy-1'));
    expect(copiedNodeId).toBeTruthy();

    const fileSaveResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/sessions/${session.sessionId}/files/${sketchPage.id}`) &&
        response.request().method() === 'PUT',
    );
    const persistResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/sessions/${session.sessionId}/persist-workspace`) &&
        response.request().method() === 'POST',
    );

    await page.getByRole('button', { name: '保存手绘' }).click();
    const saveResponse = await fileSaveResponse;
    expect(saveResponse.ok()).toBe(true);
    const saveRequestBody = saveResponse.request().postDataJSON() as {
      sketchScene?: string;
      sketchPatch?: { operations?: unknown[] };
      diagnosticContext?: { editorSessionId?: string; traceId?: string };
    };
    expect(saveRequestBody.sketchPatch?.operations?.length).toBeGreaterThan(0);
    expect(saveRequestBody.sketchScene).toBeUndefined();
    expect(saveRequestBody.diagnosticContext?.editorSessionId).toMatch(/^editor-/);
    expect(saveRequestBody.diagnosticContext?.traceId).toMatch(/^openpencil-save-/);
    await expect.poll(async () => (await persistResponse).ok()).toBe(true);
    await expect(page.getByText('手绘编辑器: loaded · saved')).toBeVisible();

    const savedFiles = await getSessionFiles(page, session.sessionId);
    const savedScene = JSON.parse(
      savedFiles.demos[sketchPage.id]?.sketchScene ?? '{}',
    ) as SketchSceneDocument;
    expect(savedScene.nodes.map((node) => node.id)).toContain(copiedNodeId);
    expect(savedScene.nodes).toHaveLength(initialNodeCount + 1);

    await setProjectSketchEditorEngine(page, project.id, 'native');
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);
    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.locator('iframe[title="手绘编辑器"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'text' })).toBeVisible();
    await expect(page.getByLabel('Sketch scene').getByText('手绘页面', { exact: true })).toHaveCount(2);
  });

  test('同一手绘页面可用 native 保存后再用 OpenPencil 打开', async ({ page }) => {
    test.setTimeout(120000);

    await openHome(page);

    const project = await createE2EProject(page, '手绘双引擎互开回归');
    await waitForProjectVisible(page, project.id);
    const session = await createSession(page, project.id);
    const sketchPage = await createSketchPage(page, project.id, session.sessionId);

    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);
    await persistSessionWorkspace(page, session.sessionId);

    await setProjectSketchEditorEngine(page, project.id, 'native');
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);

    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.getByRole('button', { name: 'text' })).toBeVisible();
    await page.getByRole('button', { name: 'text' }).click();
    await page.locator('[data-sketch-stage]').click({ position: { x: 420, y: 220 } });
    await page.getByPlaceholder('对象文本').fill('跨引擎 native 文本');
    await expect(page.getByLabel('Sketch scene').getByText('跨引擎 native 文本')).toBeVisible();

    const persistResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/sessions/${session.sessionId}/persist-workspace`) &&
        response.request().method() === 'POST',
    );
    await expect.poll(async () => (await persistResponse).ok(), { timeout: 30000 }).toBe(true);

    const nativeSavedFiles = await getSessionFiles(page, session.sessionId);
    const nativeSavedScene = JSON.parse(
      nativeSavedFiles.demos[sketchPage.id]?.sketchScene ?? '{}',
    ) as SketchSceneDocument;
    expect(nativeSavedScene.nodes.some((node) => node.text === '跨引擎 native 文本')).toBe(true);

    await setProjectSketchEditorEngine(page, project.id, 'openpencil');
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);
    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.getByText('手绘编辑器: loaded')).toBeVisible({
      timeout: 30000,
    });

    const openPencilDebug = await readOpenPencilDebug(page);
    expect(openPencilDebug.pageId).toBe(sketchPage.id);
    expect(
      openPencilDebug.exportedScene?.nodes.some(
        (node) => node.text === '跨引擎 native 文本',
      ),
    ).toBe(true);
  });

  test('OpenPencil 旧基线保存遇到协同侧更新后提示冲突并可加载最新手工处理', async ({ page }) => {
    test.setTimeout(240000);

    await openHome(page);

    const project = await createE2EProject(page, 'OpenPencil 协同冲突回归');
    await waitForProjectVisible(page, project.id);
    const session = await createSession(page, project.id);
    const sketchPage = await createSketchPage(page, project.id, session.sessionId);
    const initialFiles = await getSessionFiles(page, session.sessionId);
    const initialSceneText = initialFiles.demos[sketchPage.id]?.sketchScene;
    expect(initialSceneText).toBeTruthy();
    const initialScene = JSON.parse(initialSceneText ?? '{}') as SketchSceneDocument;
    const initialNodeCount = initialScene.nodes.length;

    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);

    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.getByText('手绘编辑器: loaded')).toBeVisible({
      timeout: 30000,
    });

    const openPencilFrame = page.frameLocator('iframe[title="手绘编辑器"]');
    await expect(openPencilFrame.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await page.getByRole('button', { name: 'sticky:note ROUNDED_RECTANGLE' }).click();
    await openPencilFrame.getByRole('button', { name: 'Duplicate' }).click();
    await waitForExportedNodeCount(page, initialNodeCount + 1);
    await expect(page.getByText(/手绘编辑器: dirty .* patch/)).toBeVisible();

    const dirtyDebug = await readOpenPencilDebug(page);
    const copiedNodeId = dirtyDebug.exportedScene?.nodes
      .map((node) => node.id)
      .find((id) => id.endsWith('-copy-1'));
    expect(copiedNodeId).toBeTruthy();

    const collaboratorScene = sceneWithNodeText(initialScene, 'title', '协同侧已保存标题');
    let collaboratorInjected = false;
    await page.route(`**/api/sessions/${session.sessionId}/files/${sketchPage.id}`, async (route) => {
      const request = route.request();
      if (
        !collaboratorInjected &&
        request.method() === 'PUT' &&
        request.postData()?.includes('"sketchPatch"')
      ) {
        collaboratorInjected = true;
        await updateSessionSketchScene(
          page,
          session.sessionId,
          sketchPage.id,
          collaboratorScene,
        );
      }
      await route.continue();
    });

    const failedSaveResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/sessions/${session.sessionId}/files/${sketchPage.id}`) &&
        response.request().method() === 'PUT' &&
        response.status() === 409,
    );
    await page.getByRole('button', { name: '保存手绘' }).click();
    await failedSaveResponse;
    await page.unroute(`**/api/sessions/${session.sessionId}/files/${sketchPage.id}`);
    expect(collaboratorInjected).toBe(true);

    await expect(page.getByText('手绘保存失败')).toBeVisible();
    await expect(
      page.getByText('手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存。'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '合并本次手绘改动' })).toBeEnabled();

    await page.getByRole('button', { name: '合并本次手绘改动' }).click();
    await expect(page.getByText('自动合并摘要')).toBeVisible();
    await expect(
      page.getByText('本次手绘改动无法自动合并到最新内容，请查看冲突摘要后加载最新内容重新编辑。'),
    ).toBeVisible();
    await expect(page.getByText('受影响图层：')).toContainText(copiedNodeId);
    await expect(page.getByText('#4 reorder')).toBeVisible();
    await expect(page.getByText('原因：目标图层不存在')).toBeVisible();
    await expect(page.getByText('已不存在：')).toContainText(copiedNodeId);
    await expect(page.getByText(`图层：note, ${copiedNodeId}, title`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '加载最新并手工处理' })).toBeEnabled();

    const reloadLatestResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/sessions/${session.sessionId}/files/${sketchPage.id}`) &&
        response.request().method() === 'GET' &&
        response.ok(),
    );
    await page.getByRole('button', { name: '加载最新并手工处理' }).click();
    await reloadLatestResponse;
    await expect(page.getByText('手绘编辑器: loaded')).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.getByText('已加载最新手绘内容。请按下列冲突参考在画布中手工重做需要保留的改动。'),
    ).toBeVisible();
    await expect(page.getByText('手工处理参考')).toBeVisible();
    await expect(page.getByText('#4 reorder')).toBeVisible();
    await expect(page.getByText('原因：目标图层不存在')).toBeVisible();
    await expect(page.getByText(`图层：note, ${copiedNodeId}, title`, { exact: true })).toBeVisible();

    const latestFiles = await getSessionFiles(page, session.sessionId);
    const latestScene = JSON.parse(
      latestFiles.demos[sketchPage.id]?.sketchScene ?? '{}',
    ) as SketchSceneDocument;
    expect(latestScene.nodes.map((node) => node.id)).not.toContain(copiedNodeId);
    expect(latestScene.nodes.some((node) => node.text === '协同侧已保存标题')).toBe(true);
    expect(latestScene.nodes).toHaveLength(initialNodeCount);

    const reloadedDebug = await readOpenPencilDebug(page);
    expect(reloadedDebug.exportedScene?.nodes.map((node) => node.id)).not.toContain(copiedNodeId);
    expect(
      reloadedDebug.exportedScene?.nodes.some((node) => node.text === '协同侧已保存标题'),
    ).toBe(true);
  });

  test('OpenPencil 多账号多浏览器连续协同更新后旧窗口保存保持冲突恢复', async ({ page, browser }) => {
    test.setTimeout(COLLABORATION_STRESS_TIMEOUT_MS);
    const latestCollaboratorTitle = `多账号协同侧标题 ${COLLABORATION_STRESS_ITERATIONS}`;

    await openHome(page);

    const project = await createE2EProject(page, 'OpenPencil 多窗口协同压力回归');
    await waitForProjectVisible(page, project.id);
    const session = await createSession(page, project.id);
    const sketchPage = await createSketchPage(page, project.id, session.sessionId);
    const initialFiles = await getSessionFiles(page, session.sessionId);
    const initialSceneText = initialFiles.demos[sketchPage.id]?.sketchScene;
    expect(initialSceneText).toBeTruthy();
    const initialScene = JSON.parse(initialSceneText ?? '{}') as SketchSceneDocument;
    const initialNodeCount = initialScene.nodes.length;

    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByLabel('选择预览对象')).toHaveValue(`page:${sketchPage.id}`);
    await page.getByRole('button', { name: '手绘编辑' }).click();
    await expect(page.getByText('手绘编辑器: loaded')).toBeVisible({
      timeout: 30000,
    });

    const openPencilFrame = page.frameLocator('iframe[title="手绘编辑器"]');
    await expect(openPencilFrame.getByRole('button', { name: 'Duplicate' })).toBeVisible();
    await page.getByRole('button', { name: 'sticky:note ROUNDED_RECTANGLE' }).click();
    await openPencilFrame.getByRole('button', { name: 'Duplicate' }).click();
    await waitForExportedNodeCount(page, initialNodeCount + 1);
    await expect(page.getByText(/手绘编辑器: dirty .* patch/)).toBeVisible();

    const dirtyDebug = await readOpenPencilDebug(page);
    const copiedNodeId = dirtyDebug.exportedScene?.nodes
      .map((node) => node.id)
      .find((id) => id.endsWith('-copy-1'));
    expect(copiedNodeId).toBeTruthy();

    const collaboratorCredentials = {
      username: createE2EUsername('e2ec'),
      password: 'openpencil123',
    };
    const collaboratorSetup = await browser.newContext({ baseURL: E2E_BASE_URL });
    const collaboratorSetupPage = await collaboratorSetup.newPage();
    await registerE2EUser(collaboratorSetupPage, collaboratorCredentials);
    await collaboratorSetup.close();

    const collaborator = await openCollaboratorWindow(browser, collaboratorCredentials);
    try {
      const collaboratorSession = await createSession(collaborator.page, project.id);

      for (let index = 1; index <= COLLABORATION_STRESS_ITERATIONS; index += 1) {
        await updateSessionSketchScene(
          collaborator.page,
          collaboratorSession.sessionId,
          sketchPage.id,
          sceneWithNodeText(initialScene, 'title', `多账号协同侧标题 ${index}`),
        );
      }

      const failedSaveResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/sessions/${session.sessionId}/files/${sketchPage.id}`) &&
          response.request().method() === 'PUT' &&
          response.status() === 409,
      );
      await page.getByRole('button', { name: '保存手绘' }).click();
      await failedSaveResponse;

      await expect(page.getByText('手绘保存失败')).toBeVisible();
      await expect(
        page.getByText('手绘内容已被其他协同或保存更新，请重新加载手绘页面后再保存。'),
      ).toBeVisible();

      await page.getByRole('button', { name: '合并本次手绘改动' }).click();
      await expect(page.getByText('自动合并摘要')).toBeVisible();
      await expect(page.getByText('受影响图层：')).toContainText(copiedNodeId);
      await expect(page.getByText('#4 reorder')).toBeVisible();
      await expect(page.getByText('原因：目标图层不存在')).toBeVisible();
      await expect(page.getByText('已不存在：')).toContainText(copiedNodeId);
      await expect(page.getByText(`图层：note, ${copiedNodeId}, title`, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '加载最新并手工处理' })).toBeEnabled();

      const reloadLatestResponse = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/sessions/${session.sessionId}/files/${sketchPage.id}`) &&
          response.request().method() === 'GET' &&
          response.ok(),
      );
      await page.getByRole('button', { name: '加载最新并手工处理' }).click();
      await reloadLatestResponse;
      await expect(page.getByText('手绘编辑器: loaded')).toBeVisible({
        timeout: 30000,
      });
      await expect(
        page.getByText('已加载最新手绘内容。请按下列冲突参考在画布中手工重做需要保留的改动。'),
      ).toBeVisible();
      await expect(page.getByText('手工处理参考')).toBeVisible();
      await expect(page.getByText('#4 reorder')).toBeVisible();
      await expect(page.getByText('原因：目标图层不存在')).toBeVisible();
      await expect(page.getByText(`图层：note, ${copiedNodeId}, title`, { exact: true })).toBeVisible();

      const latestFiles = await getSessionFiles(page, session.sessionId);
      const latestScene = JSON.parse(
        latestFiles.demos[sketchPage.id]?.sketchScene ?? '{}',
      ) as SketchSceneDocument;
      expect(latestScene.nodes.map((node) => node.id)).not.toContain(copiedNodeId);
      expect(latestScene.nodes.some((node) => node.text === latestCollaboratorTitle)).toBe(true);
      expect(latestScene.nodes).toHaveLength(initialNodeCount);

      const reloadedDebug = await readOpenPencilDebug(page);
      expect(reloadedDebug.exportedScene?.nodes.map((node) => node.id)).not.toContain(copiedNodeId);
      expect(
        reloadedDebug.exportedScene?.nodes.some((node) => node.text === latestCollaboratorTitle),
      ).toBe(true);
    } finally {
      await collaborator.context.close();
    }
  });
});
