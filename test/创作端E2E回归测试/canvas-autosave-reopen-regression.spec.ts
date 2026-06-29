// maintained-by: h5-test
import { expect, type APIResponse, type Page, test } from '@playwright/test';
import * as crypto from 'crypto';

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

type ApiResult<T> = ApiSuccess<T> | ApiFailure;

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
  order?: number;
  parentId?: string | null;
};

type SessionFilesResult = {
  demos: Record<string, { code: string; schema: string }>;
  demoPages: DemoPageMeta[];
  demoFolders?: DemoFolderMeta[];
  workspacePath: string;
};

type DemoFolderMeta = {
  id: string;
  name: string;
  order: number;
  parentId?: string | null;
};

type KnowledgeItem = {
  id: string;
  title: string;
  description: string;
  fileName: string;
};

type WorkspaceFileResult = {
  path: string;
  content: string;
};

type CanvasPageLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
};

type CanvasFreeNode = {
  id: string;
  kind: 'document' | 'image' | 'text';
  title: string;
  text?: string;
  layout: CanvasPageLayout;
};

type CanvasState = {
  pages: Record<string, CanvasPageLayout>;
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  nodes?: Record<string, CanvasFreeNode>;
  layers?: {
    annotations?: {
      nodes?: Record<string, CanvasFreeNode>;
    };
  };
};

type CanvasLayoutResult = {
  state: CanvasState | null;
  updatedAt?: number;
};

type AutosaveProjectContext = {
  project: DemoMeta;
  sessionId: string;
};

async function parseApiResponse<T>(response: APIResponse): Promise<ApiSuccess<T>> {
  const body = (await response.json()) as ApiResult<T>;
  const maybeRequest =
    'request' in response && typeof response.request === 'function'
      ? response.request()
      : null;
  const diagnostic = JSON.stringify(
    {
      method: maybeRequest?.method(),
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

async function openHome(page: Page): Promise<void> {
  await loginE2EUser(page, {
    baseURL: E2E_BASE_URL,
    username: E2E_USER,
    password: E2E_PASSWORD,
  });
  await page.goto(E2E_BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
}

function waitForEditSession(page: Page, projectId?: string): Promise<APIResponse> {
  return page.waitForResponse(async (response) => {
    if (!response.url().endsWith('/api/sessions')) return false;
    if (response.request().method() !== 'POST') return false;
    if (!projectId) return true;

    try {
      const postData = response.request().postDataJSON() as { demoId?: string };
      return postData.demoId === projectId;
    } catch {
      return false;
    }
  });
}

async function createAutosaveProject(
  page: Page,
  caseName: string,
): Promise<AutosaveProjectContext> {
  const project = await createE2EProject(page, caseName);
  const response = await page.request.post('/api/sessions', {
    data: { demoId: project.id, forceNew: true },
  });
  const sessionBody = await parseApiResponse<SessionCreateResult>(response);

  return {
    project,
    sessionId: sessionBody.data.sessionId,
  };
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
  name = '首页',
  parentId?: string | null,
): Promise<DemoPageMeta> {
  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: {
      sessionId,
      name,
      ...(parentId !== undefined ? { parentId } : {}),
    },
  });
  const body = await parseApiResponse<DemoPageMeta>(response);
  expect(body.data.id).toBeTruthy();
  return body.data;
}

async function saveSession(page: Page, sessionId: string): Promise<void> {
  const response = await page.request.post(`/api/sessions/${sessionId}/save`, {
    data: { note: '画布退出恢复回归测试准备页面' },
  });
  await parseApiResponse<unknown>(response);
}

async function ensureProjectHasCanvasPage(
  page: Page,
  project: DemoMeta,
  sessionId: string,
): Promise<string> {
  const files = await getSessionFiles(page, sessionId);
  if (files.demoPages.length > 0) return sessionId;

  await createDemoPage(page, project.id, sessionId);
  await saveSession(page, sessionId);

  const sessionAfterPageSetupPromise = waitForEditSession(page, project.id);
  await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
    timeout: 30000,
  });

  const sessionAfterPageSetupBody = await parseApiResponse<SessionCreateResult>(
    await sessionAfterPageSetupPromise,
  );
  const nextSessionId = sessionAfterPageSetupBody.data.sessionId;
  const filesAfterPageSetup = await getSessionFiles(page, nextSessionId);
  expect(
    filesAfterPageSetup.demoPages.length,
    '测试项目至少应包含一个可在画布中移动的页面',
  ).toBeGreaterThan(0);

  return nextSessionId;
}

async function getDemoPageFiles(
  page: Page,
  sessionId: string,
  demoId: string,
): Promise<{ code: string; schema: string }> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files/${demoId}`);
  const body = await parseApiResponse<{ code: string; schema: string }>(response);
  return body.data;
}

async function updateDemoPageCode(
  page: Page,
  sessionId: string,
  demoId: string,
  marker: string,
): Promise<void> {
  const files = await getDemoPageFiles(page, sessionId, demoId);
  const nextCode = `${files.code}\n\n// autosave-regression-code: ${marker}\n`;
  const response = await page.request.put(`/api/sessions/${sessionId}/files/${demoId}`, {
    data: { code: nextCode },
  });
  await parseApiResponse<null>(response);
}

async function createDemoFolder(
  page: Page,
  projectId: string,
  sessionId: string,
  name: string,
): Promise<DemoFolderMeta> {
  const response = await page.request.post(`/api/projects/${projectId}/folders`, {
    data: {
      sessionId,
      name,
      parentId: null,
    },
  });
  const body = await parseApiResponse<DemoFolderMeta>(response);
  expect(body.data.id).toBeTruthy();
  return body.data;
}

async function reorderPagesAndFolders(
  page: Page,
  projectId: string,
  sessionId: string,
  pages: Array<{ id: string; order: number; parentId: string | null }>,
  folders: Array<{ id: string; order: number; parentId: string | null }>,
): Promise<void> {
  const response = await page.request.patch(
    `/api/projects/${projectId}/demo-pages/reorder`,
    {
      data: {
        sessionId,
        pages,
        folders,
      },
    },
  );
  await parseApiResponse<null>(response);
}

async function getWorkspaceFile(
  page: Page,
  sessionId: string,
  filePath: string,
): Promise<WorkspaceFileResult> {
  const response = await page.request.get(
    `/api/sessions/${sessionId}/workspace/files/${filePath}`,
  );
  const body = await parseApiResponse<WorkspaceFileResult>(response);
  return body.data;
}

async function putWorkspaceFile(
  page: Page,
  sessionId: string,
  filePath: string,
  content: string,
): Promise<void> {
  const response = await page.request.put(
    `/api/sessions/${sessionId}/workspace/files/${filePath}`,
    { data: { content } },
  );
  await parseApiResponse<unknown>(response);
}

async function updateMemoryFile(
  page: Page,
  sessionId: string,
  marker: string,
): Promise<void> {
  const memory = await getWorkspaceFile(page, sessionId, 'memory.md');
  const nextContent = `${memory.content.trim()}\n\n- autosave-regression-memory: ${marker}\n`;
  await putWorkspaceFile(page, sessionId, 'memory.md', nextContent);
}

async function createKnowledgeDocument(
  page: Page,
  workingDir: string,
  marker: string,
): Promise<KnowledgeItem> {
  const title = `自动保存知识库-${marker}`;
  const response = await page.request.post(
    `/api/knowledge?workingDir=${encodeURIComponent(workingDir)}`,
    {
      data: {
        title,
        description: `自动保存回归知识库文档 ${marker}`,
        content: `# ${title}\n\nknowledge-marker: ${marker}\n`,
      },
    },
  );
  const body = await parseApiResponse<KnowledgeItem>(response);
  expect(body.data.fileName).toMatch(/\.md$/);
  return body.data;
}

async function getKnowledgeDocuments(
  page: Page,
  workingDir: string,
): Promise<KnowledgeItem[]> {
  const response = await page.request.get(
    `/api/knowledge?workingDir=${encodeURIComponent(workingDir)}`,
  );
  const body = await parseApiResponse<KnowledgeItem[]>(response);
  return body.data;
}

async function getKnowledgeContent(
  page: Page,
  workingDir: string,
  fileName: string,
): Promise<string> {
  const response = await page.request.get(
    `/api/knowledge/content?workingDir=${encodeURIComponent(workingDir)}&fileName=${encodeURIComponent(fileName)}`,
  );
  const body = await parseApiResponse<{ content: string }>(response);
  return body.data.content;
}

async function assertExtendedAutosaveContentPersisted(
  page: Page,
  sessionId: string,
  expected: {
    codePageId: string;
    codeMarker: string;
    firstPageIdAfterReorder: string;
    folderName: string;
    memoryMarker: string;
    knowledgeTitle: string;
    knowledgeMarker: string;
  },
): Promise<void> {
  const files = await getSessionFiles(page, sessionId);

  expect(
    files.demos[expected.codePageId]?.code,
    '页面代码修改应在重新打开后保留',
  ).toContain(`autosave-regression-code: ${expected.codeMarker}`);

  expect(
    files.demoPages[0]?.id,
    `页面列表顺序应在重新打开后保留，当前页面列表: ${JSON.stringify(files.demoPages)}`,
  ).toBe(expected.firstPageIdAfterReorder);

  expect(
    files.demoFolders?.some((folder) => folder.name === expected.folderName),
    `新增文件夹应在重新打开后保留，当前文件夹: ${JSON.stringify(files.demoFolders ?? [])}`,
  ).toBe(true);

  const memory = await getWorkspaceFile(page, sessionId, 'memory.md');
  expect(memory.content, 'AI 记忆文件修改应在重新打开后保留').toContain(
    `autosave-regression-memory: ${expected.memoryMarker}`,
  );

  const knowledgeItems = await getKnowledgeDocuments(page, files.workspacePath);
  const knowledgeItem = knowledgeItems.find(
    (item) => item.title === expected.knowledgeTitle,
  );
  expect(
    knowledgeItem,
    `知识库文档应在重新打开后保留，当前知识库: ${JSON.stringify(knowledgeItems)}`,
  ).toBeTruthy();

  const knowledgeContent = await getKnowledgeContent(
    page,
    files.workspacePath,
    knowledgeItem!.fileName,
  );
  expect(knowledgeContent, '知识库正文修改应在重新打开后保留').toContain(
    `knowledge-marker: ${expected.knowledgeMarker}`,
  );
}

async function getCanvasLayout(
  page: Page,
  sessionId: string,
): Promise<CanvasState | null> {
  const response = await page.request.get(`/api/sessions/${sessionId}/canvas-layout`);
  const body = await parseApiResponse<CanvasLayoutResult>(response);
  return body.data.state;
}

function waitForCanvasLayoutSave(
  page: Page,
  timeout = 15000,
): Promise<APIResponse | null> {
  return page
    .waitForResponse(
      (response) =>
        /\/api\/sessions\/[^/]+\/canvas-layout(?:\?|$)/.test(response.url()) &&
        response.request().method() === 'POST',
      { timeout },
    )
    .catch(() => null);
}

async function waitForCanvasLayoutState(
  page: Page,
  sessionId: string,
  expected: {
    movedPageId: string;
    markerText: string;
  },
  timeout = 30000,
): Promise<CanvasState | null> {
  const deadline = Date.now() + timeout;
  let latestState: CanvasState | null = null;

  while (Date.now() < deadline) {
    latestState = await getCanvasLayout(page, sessionId);
    if (canvasStateContainsExpectedChange(latestState, expected)) {
      return latestState;
    }
    await page.waitForTimeout(500);
  }

  return latestState;
}

function getSessionIdFromCanvasLayoutUrl(url: string): string | null {
  return /\/api\/sessions\/([^/]+)\/canvas-layout(?:\?|$)/.exec(url)?.[1] ?? null;
}

function summarizeCanvasState(state: CanvasState | null): string {
  if (!state) return 'null';
  return JSON.stringify({
    pageIds: Object.keys(state.pages),
    nodes: getCanvasNodes(state).map((node) => ({
      id: node.id,
      kind: node.kind,
      text: node.text,
      layout: node.layout,
    })),
  });
}

function canvasStateContainsExpectedChange(
  state: CanvasState | null,
  expected: {
    movedPageId: string;
    markerText: string;
  },
): boolean {
  if (!state) return false;
  const pageLayout = state.pages[expected.movedPageId];
  return Boolean(
    pageLayout &&
      pageLayout.x > 100 &&
      pageLayout.y > 100 &&
      getCanvasNodes(state).some(
        (node) => node.kind === 'text' && node.text === expected.markerText,
      ),
  );
}

async function switchToCanvas(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^画布$/ }).click();
  await expect(page.locator('[data-canvas-root="true"]')).toBeVisible({
    timeout: 30000,
  });
}

async function dragFirstCanvasPage(page: Page): Promise<string> {
  await page.getByRole('button', { name: '选择工具' }).click();

  const canvasRoot = page.locator('[data-canvas-root="true"]');
  const pageItem = canvasRoot.locator('[data-page-id]').first();
  await expect(pageItem).toBeVisible({ timeout: 30000 });
  const pageId = await pageItem.getAttribute('data-page-id');
  expect(pageId).toBeTruthy();

  const box = await pageItem.boundingBox();
  expect(box).toBeTruthy();
  if (!box) throw new Error('未找到画布页面位置');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, {
    steps: 6,
  });
  await page.mouse.up();

  await expect(pageItem).toHaveCSS('left', /[1-9]\d{2,}px/, { timeout: 5000 });

  return pageId!;
}

async function addTextNode(page: Page, text: string): Promise<void> {
  const canvasRoot = page.locator('[data-canvas-root="true"]');
  const box = await canvasRoot.boundingBox();
  expect(box).toBeTruthy();
  if (!box) throw new Error('未找到画布区域');

  const candidatePoints = [
    { x: box.x + 120, y: box.y + 260 },
    { x: box.x + box.width - 120, y: box.y + 320 },
    { x: box.x + 160, y: box.y + box.height - 180 },
    { x: box.x + box.width - 180, y: box.y + 180 },
  ];
  const pageBoxes = await canvasRoot.locator('[data-page-id]').evaluateAll((items) =>
    items.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    }),
  );
  const blankPoints = candidatePoints.filter(
    (point) =>
      !pageBoxes.some(
        (pageBox) =>
          point.x >= pageBox.left - 24 &&
          point.x <= pageBox.right + 24 &&
          point.y >= pageBox.top - 24 &&
          point.y <= pageBox.bottom + 24,
      ),
  );
  const points = blankPoints.length > 0 ? blankPoints : candidatePoints;

  for (const [index, point] of points.entries()) {
    await page.getByRole('button', { name: '添加文字' }).click();
    await page.mouse.click(point.x, point.y);
    const timeout = index === candidatePoints.length - 1 ? 5000 : 1500;
    const appeared = await page
      .getByRole('textbox', { name: '编辑文字' })
      .last()
      .waitFor({ state: 'visible', timeout })
      .then(() => true)
      .catch(() => false);
    if (appeared) break;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const editableTextArea = page.getByRole('textbox', { name: '编辑文字' }).last();
    try {
      await expect(editableTextArea).toBeVisible({ timeout: 3000 });
      await editableTextArea.fill(text, { timeout: 5000 });
      await expect(editableTextArea).toHaveValue(text, { timeout: 3000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.getByRole('button', { name: '添加文字' }).click();
      const retryPoint = points[attempt % points.length];
      await page.mouse.click(retryPoint.x, retryPoint.y);
    }
  }
}

async function exitEditorToHomeAfterAutosaveFlush(
  page: Page,
  pendingCanvasSaveResponse: Promise<APIResponse | null>,
  expected: {
    movedPageId: string;
    markerText: string;
  },
): Promise<string> {
  const canvasSaveResponsePromise = waitForCanvasLayoutSave(page, 10000);

  await page.getByTitle('返回首页').click();

  const canvasSaveResponse = await Promise.race([
    pendingCanvasSaveResponse,
    canvasSaveResponsePromise,
  ]);
  if (canvasSaveResponse) {
    const saveBody = await parseApiResponse<CanvasLayoutResult>(canvasSaveResponse);
    const savedSessionId = getSessionIdFromCanvasLayoutUrl(canvasSaveResponse.url());
    expect(savedSessionId, '画布布局保存 URL 应包含 sessionId').toBeTruthy();

    const persistedState =
      canvasStateContainsExpectedChange(saveBody.data.state, expected)
        ? saveBody.data.state
        : await waitForCanvasLayoutState(page, savedSessionId!, expected);
    expect(
      canvasStateContainsExpectedChange(persistedState, expected),
      [
        '画布布局保存后应可从后端读回本次页面移动和文本节点',
        `保存响应状态: ${summarizeCanvasState(saveBody.data.state)}`,
        `后端状态: ${summarizeCanvasState(persistedState)}`,
      ].join('\n'),
    ).toBe(true);

    await expect(page).toHaveURL(
      (url) => url.origin === E2E_BASE_URL && url.pathname === '/',
      { timeout: 30000 },
    );
    return savedSessionId!;
  } else {
    throw new Error('画布改动后没有捕获到自动保存或退出 flush 的 canvas-layout 请求');
  }
}

function getCanvasNodes(state: CanvasState): CanvasFreeNode[] {
  return [
    ...Object.values(state.nodes ?? {}),
    ...Object.values(state.layers?.annotations?.nodes ?? {}),
  ];
}

async function assertCanvasLayoutPersisted(
  page: Page,
  sessionId: string,
  expected: {
    movedPageId: string;
    markerText: string;
  },
): Promise<void> {
  const state = await getCanvasLayout(page, sessionId);

  expect(state, '重新打开项目后应读取到已保存的画布布局').not.toBeNull();
  expect(
    state?.pages[expected.movedPageId]?.x,
    '页面横向移动位置应在重新打开后保留',
  ).toBeGreaterThan(100);
  expect(
    state?.pages[expected.movedPageId]?.y,
    '页面纵向移动位置应在重新打开后保留',
  ).toBeGreaterThan(100);
  expect(
    getCanvasNodes(state!).some(
      (node) => node.kind === 'text' && node.text === expected.markerText,
    ),
    `新增文本节点应在重新打开后保留，当前后端画布状态: ${summarizeCanvasState(state)}`,
  ).toBe(true);
}

test.describe('画布自动保存与重新打开回归', () => {
  test.describe.configure({ timeout: 150000 });

  test('移动页面、编辑工作区内容后直接退出，重新打开应恢复自动保存改动', async ({ page }) => {
    const markerText = `exit-reopen-text-${crypto.randomBytes(3).toString('hex')}`;
    const codeMarker = crypto.randomBytes(3).toString('hex');
    const memoryMarker = crypto.randomBytes(3).toString('hex');
    const knowledgeMarker = crypto.randomBytes(3).toString('hex');
    const folderName = `自动保存文件夹-${crypto.randomBytes(3).toString('hex')}`;

    await openHome(page);

    const { project, sessionId } = await createAutosaveProject(page, '画布退出恢复回归');
    const editSessionId = await ensureProjectHasCanvasPage(page, project, sessionId);
    const filesBeforeEdits = await getSessionFiles(page, editSessionId);
    const firstPage = filesBeforeEdits.demoPages[0];
    expect(firstPage, '测试项目应有第一个页面').toBeTruthy();

    const secondPage = await createDemoPage(
      page,
      project.id,
      editSessionId,
      '自动保存顺序页',
    );
    await updateDemoPageCode(page, editSessionId, firstPage.id, codeMarker);
    const folder = await createDemoFolder(page, project.id, editSessionId, folderName);
    await reorderPagesAndFolders(
      page,
      project.id,
      editSessionId,
      [
        { id: secondPage.id, order: 0, parentId: null },
        { id: firstPage.id, order: 1, parentId: null },
      ],
      [{ id: folder.id, order: 0, parentId: null }],
    );
    await updateMemoryFile(page, editSessionId, memoryMarker);
    const knowledgeItem = await createKnowledgeDocument(
      page,
      filesBeforeEdits.workspacePath,
      knowledgeMarker,
    );
    await saveSession(page, editSessionId);

    const canvasSessionPromise = waitForEditSession(page, project.id);
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });
    await parseApiResponse<SessionCreateResult>(await canvasSessionPromise);

    await switchToCanvas(page);
    const canvasSaveResponsePromise = waitForCanvasLayoutSave(page);
    const movedPageId = await dragFirstCanvasPage(page);
    await addTextNode(page, markerText);

    await exitEditorToHomeAfterAutosaveFlush(page, canvasSaveResponsePromise, {
      movedPageId,
      markerText,
    });

    const reopenedSessionPromise = waitForEditSession(page, project.id);
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByRole('heading', { name: project.name })).toBeVisible({
      timeout: 30000,
    });

    const reopenedSessionBody = await parseApiResponse<SessionCreateResult>(
      await reopenedSessionPromise,
    );
    await assertCanvasLayoutPersisted(
      page,
      reopenedSessionBody.data.sessionId,
      { movedPageId, markerText },
    );
    await assertExtendedAutosaveContentPersisted(
      page,
      reopenedSessionBody.data.sessionId,
      {
        codePageId: firstPage.id,
        codeMarker,
        firstPageIdAfterReorder: secondPage.id,
        folderName,
        memoryMarker,
        knowledgeTitle: knowledgeItem.title,
        knowledgeMarker,
      },
    );
  });
});
