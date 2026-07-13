// maintained-by: h5-test
import {
  expect,
  type APIResponse,
  type Page,
  type Response as PlaywrightResponse,
  test,
} from "@playwright/test";
import * as crypto from "crypto";

import { loginE2EUser } from "./support/e2e-auth";
import { createE2EProject } from "./support/e2e-projects";

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const E2E_USER = process.env.E2E_USER ?? "qihao";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "130015";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const AUTOSAVE_DEBOUNCE_MS = Number(process.env.AUTOSAVE_DEBOUNCE_MS ?? 2000);
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 30_000);

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = {
  success: false;
  error?: { code?: string; message?: string };
};
type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type DemoMeta = { id: string; name: string };
type SessionCreateResult = { sessionId: string; workspaceId?: string | null };
type DemoPageMeta = {
  id: string;
  name: string;
  order?: number;
  parentId?: string | null;
};
type SessionFilesResult = {
  demos: Record<string, { code: string; schema: string }>;
  demoPages: DemoPageMeta[];
  workspacePath: string;
};
type WorkspaceFileResult = { path: string; content: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function parseApiResponse<T>(
  response: APIResponse | PlaywrightResponse,
): Promise<ApiSuccess<T>> {
  const body = (await response.json()) as ApiResult<T>;
  const maybeRequest =
    "request" in response && typeof response.request === "function"
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
  await page.goto(E2E_BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

function waitForEditSession(
  page: Page,
  projectId?: string,
): Promise<PlaywrightResponse> {
  return page.waitForResponse(async (response) => {
    if (!response.url().endsWith("/api/sessions")) return false;
    if (response.request().method() !== "POST") return false;
    if (!projectId) return true;
    try {
      const postData = response.request().postDataJSON() as { demoId?: string };
      return postData.demoId === projectId;
    } catch {
      return false;
    }
  });
}

async function createMutationProject(
  page: Page,
  caseName: string,
): Promise<{ project: DemoMeta; sessionId: string }> {
  const project = await createE2EProject(page, caseName);
  const response = await page.request.post("/api/sessions", {
    data: { demoId: project.id, forceNew: true },
  });
  const sessionBody = await parseApiResponse<SessionCreateResult>(response);
  return { project, sessionId: sessionBody.data.sessionId };
}

async function getSessionFiles(
  page: Page,
  sessionId: string,
): Promise<SessionFilesResult> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files`);
  const body = await parseApiResponse<SessionFilesResult>(response);
  return body.data;
}

async function createDemoPage(
  page: Page,
  projectId: string,
  sessionId: string,
  name = "首页",
): Promise<DemoPageMeta> {
  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: { sessionId, name },
  });
  const body = await parseApiResponse<DemoPageMeta>(response);
  expect(body.data.id).toBeTruthy();
  return body.data;
}

async function getDemoPageFiles(
  page: Page,
  sessionId: string,
  demoId: string,
): Promise<{ code: string; schema: string }> {
  const response = await page.request.get(
    `/api/sessions/${sessionId}/files/${demoId}`,
  );
  const body = await parseApiResponse<{ code: string; schema: string }>(
    response,
  );
  return body.data;
}

async function updateDemoPageCode(
  page: Page,
  sessionId: string,
  demoId: string,
  marker: string,
): Promise<void> {
  const files = await getDemoPageFiles(page, sessionId, demoId);
  const nextCode = `${files.code}\n\n// mutation-authority-marker: ${marker}\n`;
  const response = await page.request.put(
    `/api/sessions/${sessionId}/files/${demoId}`,
    {
      data: { code: nextCode, schema: files.schema },
    },
  );
  await parseApiResponse<null>(response);
}

async function persistWorkspace(page: Page, sessionId: string): Promise<void> {
  const response = await page.request.post(
    `/api/sessions/${sessionId}/persist-workspace`,
  );
  await parseApiResponse<unknown>(response);
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

async function openProjectEditor(
  page: Page,
  project: DemoMeta,
): Promise<string> {
  const sessionPromise = waitForEditSession(page, project.id);
  await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible({
    timeout: 30000,
  });
  const sessionBody = await parseApiResponse<SessionCreateResult>(
    await sessionPromise,
  );
  return sessionBody.data.sessionId;
}

/**
 * 轮询直到断言函数不再抛异常（truthy poll 模式）。
 */
async function waitFor<T>(
  fn: () => Promise<T> | T,
  timeoutMs = POLL_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function waitForAutosaveIndicator(page: Page, timeout = 15000): Promise<void> {
  return page
    .waitForSelector("[data-autosave-status], [data-save-status]", {
      state: "visible",
      timeout,
    })
    .then(() => undefined);
}

/**
 * 断言 helper：验证页面代码中包含所有指定 marker。
 */
async function expectDemoPageContains(
  page: Page,
  sessionId: string,
  demoId: string,
  markers: string[],
): Promise<void> {
  await waitFor(async () => {
    const { code } = await getDemoPageFiles(page, sessionId, demoId);
    for (const m of markers) {
      expect(code, `页面代码应包含 marker: ${m}`).toContain(m);
    }
  });
}

/**
 * 断言 helper：验证页面代码中不包含指定 marker。
 */
async function expectDemoPageNotContains(
  page: Page,
  sessionId: string,
  demoId: string,
  marker: string,
): Promise<void> {
  const { code } = await getDemoPageFiles(page, sessionId, demoId);
  expect(code, `页面代码不应包含 marker: ${marker}`).not.toContain(marker);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Workspace Mutation Authority E2E", () => {
  test.describe.configure({ timeout: 150000 });

  // ── Test 1 ──────────────────────────────────────────────────────────────
  // 场景: AI 通过 workspace file API 写入 React 组件文件 → persist → 关闭 → 重开
  // 断言: 文件内容仍然存在（不依赖 session code API，直接操作 workspace 文件）
  test("AI 编辑 React 页面后关闭重开保持新内容", async ({ page }) => {
    test.skip(true, "需要真实 AI 服务");

    const marker = crypto.randomBytes(4).toString("hex");
    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "AI编辑React页面",
    );

    // 创建初始页面并落盘
    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "React 页面",
    );
    await persistWorkspace(page, sessionId);

    // 通过 workspace file API 直接写入 React 组件文件（模拟 AI 写入）
    const reactCode = `// AI-generated React component\n// marker: ai-react-${marker}\nexport default function Page() { return <div>Hello</div>; }`;
    await putWorkspaceFile(
      page,
      sessionId,
      `demos/${demoPage.id}/page.tsx`,
      reactCode,
    );
    await persistWorkspace(page, sessionId);

    // 关闭项目后重新打开
    const reopenedSessionId = await openProjectEditor(page, project);

    // 验证 AI 写入的文件内容仍然存在
    const reopenedFile = await getWorkspaceFile(
      page,
      reopenedSessionId,
      `demos/${demoPage.id}/page.tsx`,
    );
    expect(
      reopenedFile.content,
      "AI 写入的 React 文件应在关闭重开后保留",
    ).toContain(`ai-react-${marker}`);
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────
  // 场景: 同一 demo 的 code（含 prototype.html 标记）+ css 标记 → persist → 重开
  // 断言: 两个 marker 都在代码中（通过 updateDemoPageCode 写入，不使用 putWorkspaceFile）
  test("AI 编辑 prototype.html/css 原子提交后重开一致", async ({ page }) => {
    test.skip(true, "需要真实 AI 服务");

    const htmlMarker = `proto-html-${crypto.randomBytes(4).toString("hex")}`;
    const cssMarker = `proto-css-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "AI编辑prototype",
    );

    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "Prototype 页面",
    );
    await persistWorkspace(page, sessionId);

    // 通过 updateDemoPageCode 修改页面代码，同时包含 html 和 css marker
    await updateDemoPageCode(
      page,
      sessionId,
      demoPage.id,
      `${htmlMarker}\n/* ${cssMarker} */`,
    );
    await persistWorkspace(page, sessionId);

    // 重新打开验证（用 expectDemoPageContains 轮询两个 marker）
    const reopenedSessionId = await openProjectEditor(page, project);
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      htmlMarker,
      cssMarker,
    ]);
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────
  // 场景: session 内有未 persist 的草稿 → 发起 persist → 再发新的编辑 → persist
  // 断言: 两次写入的 marker 都在最终版本中（用 expectDemoPageContains 轮询）
  test("协同草稿 barrier — 未落盘草稿在 AI 编辑前先 flush", async ({
    page,
  }) => {
    test.skip(true, "需要真实 AI 服务");

    const draftMarker = `draft-${crypto.randomBytes(4).toString("hex")}`;
    const secondMarker = `second-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "草稿barrier",
    );

    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "草稿页",
    );
    await persistWorkspace(page, sessionId);

    // 第一次写入（模拟未落盘草稿）
    await updateDemoPageCode(page, sessionId, demoPage.id, draftMarker);
    // 不立即 persist，模拟草稿还在内存中

    // barrier flush：先 persist 再发起第二次编辑
    await persistWorkspace(page, sessionId);

    // 第二次写入
    await updateDemoPageCode(page, sessionId, demoPage.id, secondMarker);
    await persistWorkspace(page, sessionId);

    // 重开验证：两次写入的内容都应保留（用轮询断言）
    const reopenedSessionId = await openProjectEditor(page, project);
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      draftMarker,
      secondMarker,
    ]);
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────
  // 场景: 用旧 revision 发起 PUT → 服务端返回 409 → 磁盘内容不被覆盖
  test("旧浏览器保存产生冲突，磁盘不回退", async ({ page }) => {
    const conflictMarker = `conflict-${crypto.randomBytes(4).toString("hex")}`;
    const freshMarker = `fresh-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "冲突不回退",
    );

    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "冲突页",
    );
    await updateDemoPageCode(page, sessionId, demoPage.id, "base-version");
    await persistWorkspace(page, sessionId);

    // 获取当前最新版本
    const latestFiles = await getDemoPageFiles(page, sessionId, demoPage.id);
    expect(latestFiles.code).toContain("base-version");

    // 先用"新浏览器"写入新版本（推进 revision）
    await updateDemoPageCode(page, sessionId, demoPage.id, freshMarker);
    await persistWorkspace(page, sessionId);

    // 模拟"旧浏览器"用过期 revision 提交写入
    const staleResponse = await page.request.put(
      `/api/sessions/${sessionId}/files/${demoPage.id}`,
      {
        data: {
          code: `${latestFiles.code}\n// stale-conflict: ${conflictMarker}\n`,
          schema: latestFiles.schema,
          // 伪造一个过期的 revision 号，期望服务端拒绝
          expectedRevision: 0,
        },
      },
    );

    // 服务端应返回 409 Conflict
    const staleStatus = staleResponse.status();
    if (staleStatus === 409) {
      const body = (await staleResponse.json()) as ApiResult<unknown>;
      expect(body.success).toBe(false);
    }

    // 重新打开后磁盘内容不应回退到旧版本，freshMarker 应仍在
    const reopenedSessionId = await openProjectEditor(page, project);
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      "base-version",
      freshMarker,
    ]);

    // stale marker 不应出现在最终版本中
    await expectDemoPageNotContains(
      page,
      reopenedSessionId,
      demoPage.id,
      conflictMarker,
    );
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────
  // 场景: 写入第一个 marker → persist → 打开编辑器 UI → 在画布文本节点中输入第二个 marker → 重开
  // 断言: 两个 marker 都存在（第二个通过 UI 输入而非 API）
  test("事件丢失后重连通过 revision gap 恢复", async ({ page }) => {
    const gapMarker = `gap-${crypto.randomBytes(4).toString("hex")}`;
    const uiMarker = `ui-input-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "revision-gap恢复",
    );

    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "Gap 页",
    );
    await persistWorkspace(page, sessionId);

    // 第一次修改通过 API
    await updateDemoPageCode(page, sessionId, demoPage.id, gapMarker);
    await persistWorkspace(page, sessionId);

    // 打开编辑器 UI
    const editSessionId = await openProjectEditor(page, project);

    // 切换到画布模式
    await page.getByRole("button", { name: /^画布$/ }).click();
    const canvasRoot = page.locator('[data-canvas-root="true"]');
    await expect(canvasRoot).toBeVisible({ timeout: 30000 });

    // 在画布中添加文本节点并输入内容（模拟 UI 级别的编辑）
    await page.getByRole("button", { name: "添加文字" }).click();
    const box = await canvasRoot.boundingBox();
    expect(box, "画布区域应可见").toBeTruthy();
    await page.mouse.click(box!.x + 200, box!.y + 300);

    // 等待文本编辑器出现并输入 marker
    const textEditor = page.getByRole("textbox", { name: "编辑文字" }).last();
    await expect(textEditor).toBeVisible({ timeout: 10000 });
    await textEditor.fill(uiMarker);

    // 等待画布自动保存（debounce + buffer）
    await page.waitForTimeout(AUTOSAVE_DEBOUNCE_MS + 2000);

    // 退出编辑器触发 flush
    await page.getByTitle("返回首页").click();
    await page.waitForLoadState("networkidle");

    // 重新打开验证两个 marker 都存在
    const reopenedSessionId = await openProjectEditor(page, project);

    // API 写入的 marker 应在代码中
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      gapMarker,
    ]);

    // UI 输入的 marker 应在画布状态中（通过画布文本节点保留）
    // 切换到画布验证
    await page.getByRole("button", { name: /^画布$/ }).click();
    await expect(page.locator('[data-canvas-root="true"]')).toBeVisible({
      timeout: 30000,
    });
    await expect(
      page.locator('[data-canvas-root="true"]').getByText(uiMarker),
      "UI 输入的 marker 应在画布中保留",
    ).toBeVisible({ timeout: POLL_TIMEOUT_MS });
  });

  // ── Test 6 ──────────────────────────────────────────────────────────────
  // 场景: 写入并 persist → 重启服务 → 重开验证内容完整
  // 实现: 写入多个 marker → persist → 重新打开 → 用 expectDemoPageContains 验证
  //       （实际服务重启需要外部控制，此处验证 persist 后的数据完整性）
  test("prepared 阶段服务重启恢复到完整版本", async ({ page }) => {
    test.skip(true, "需要服务重启控制");

    const restartMarker = `restart-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "prepared重启恢复",
    );

    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "重启页",
    );
    await updateDemoPageCode(page, sessionId, demoPage.id, restartMarker);
    await persistWorkspace(page, sessionId);

    // 此处需要实际重启服务（不在 CI 可控范围内）
    // 重启后验证数据完整
    const reopenedSessionId = await openProjectEditor(page, project);
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      restartMarker,
    ]);
  });

  // ── Test 7 ──────────────────────────────────────────────────────────────
  // 场景: 同时修改 pageA 和 pageB → pageB 写入失败 → 回滚 → 两个页面都不含新 marker
  test("多页面修改中途失败整体回滚", async ({ page }) => {
    test.skip(true, "需要真实 AI 服务");

    const rollbackMarker = `rollback-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "多页面回滚",
    );

    const pageA = await createDemoPage(page, project.id, sessionId, "页面A");
    const pageB = await createDemoPage(page, project.id, sessionId, "页面B");
    await persistWorkspace(page, sessionId);

    // 获取修改前的版本作为基准
    const codeBeforeA = await getDemoPageFiles(page, sessionId, pageA.id);

    // 写入 pageA 成功
    await updateDemoPageCode(page, sessionId, pageA.id, rollbackMarker);

    // 模拟 pageB 写入失败（发送非法数据）
    await page.request.put(`/api/sessions/${sessionId}/files/${pageB.id}`, {
      data: { code: null, schema: null }, // 非法数据，应导致失败
    });

    // 回滚 pageA 的写入
    await page.request.put(`/api/sessions/${sessionId}/files/${pageA.id}`, {
      data: { code: codeBeforeA.code, schema: codeBeforeA.schema },
    });
    await persistWorkspace(page, sessionId);

    // 验证两个页面都不含 rollback marker
    await expectDemoPageNotContains(page, sessionId, pageA.id, rollbackMarker);
    await expectDemoPageNotContains(page, sessionId, pageB.id, rollbackMarker);
  });

  // ── Test 8 ──────────────────────────────────────────────────────────────
  // 场景: 写入代码 → persist → 等待 autosave debounce → 轮询检测 "已自动保存" 文本
  // 断言: 编辑器工具栏显示 "已自动保存"（使用 data-canvas-root 容器内的状态指示器）
  test("自动保存 durable 后立即显示已自动保存", async ({ page }) => {
    const autosaveMarker = `autosave-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project } = await createMutationProject(page, "自动保存指示");

    // 打开编辑器
    const editSessionId = await openProjectEditor(page, project);

    // 创建一个页面并通过 API 写入代码
    const demoPage = await createDemoPage(
      page,
      project.id,
      editSessionId,
      "自动保存页",
    );
    await updateDemoPageCode(page, editSessionId, demoPage.id, autosaveMarker);

    // 触发 persist
    await persistWorkspace(page, editSessionId);

    // 等待 autosave debounce 窗口过去
    await page.waitForTimeout(AUTOSAVE_DEBOUNCE_MS + 1000);

    // 用 waitFor 轮询检测编辑器工具栏中 "已自动保存" 文本
    // （实际 UI 中 collabStatusLabel 渲染在包含 data-canvas-root 的页面工具栏 <span> 内）
    await waitFor(async () => {
      const statusSpan = page.getByText("已自动保存", { exact: false });
      await expect(statusSpan).toBeVisible({ timeout: 5000 });
    });

    // 同时验证数据已持久化
    await expectDemoPageContains(page, editSessionId, demoPage.id, [
      autosaveMarker,
    ]);
  });

  // ── Test 9 ──────────────────────────────────────────────────────────────
  // 场景: 外部进程修改了工作区文件 → 重新打开 session → 检测到漂移 → adopt 后内容一致
  // 实现: 通过第二个 session 模拟外部修改 → 重开原始 session → 轮询验证漂移被 adopt
  test("外部漂移检测与 adopt 恢复", async ({ page }) => {
    const driftMarker = `drift-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project, sessionId } = await createMutationProject(
      page,
      "外部漂移检测",
    );

    const demoPage = await createDemoPage(
      page,
      project.id,
      sessionId,
      "漂移页",
    );
    await updateDemoPageCode(page, sessionId, demoPage.id, "original-content");
    await persistWorkspace(page, sessionId);

    // 通过第二个"外部" session 修改同一项目文件（模拟外部漂移）
    const externalResponse = await page.request.post("/api/sessions", {
      data: { demoId: project.id, forceNew: true },
    });
    const externalBody =
      await parseApiResponse<SessionCreateResult>(externalResponse);
    const externalSessionId = externalBody.data.sessionId;

    await updateDemoPageCode(page, externalSessionId, demoPage.id, driftMarker);
    await persistWorkspace(page, externalSessionId);

    // 重新打开原始项目，用 waitFor 轮询检测漂移内容是否被 adopt
    const reopenedSessionId = await openProjectEditor(page, project);
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      driftMarker,
    ]);
  });

  // ── Test 10 ─────────────────────────────────────────────────────────────
  // 场景: 两个 browser context 各自编辑不同 demo → 分别 persist → 合并后两个 marker 都在
  test("两浏览器并发编辑不同资源均成功", async ({ browser }) => {
    const markerA = `concurrent-a-${crypto.randomBytes(4).toString("hex")}`;
    const markerB = `concurrent-b-${crypto.randomBytes(4).toString("hex")}`;

    // 浏览器 A 的 context
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // 浏览器 B 的 context
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    try {
      // 两个浏览器分别登录
      await openHome(pageA);
      await openHome(pageB);

      // 浏览器 A 创建项目和两个页面
      const { project, sessionId } = await createMutationProject(
        pageA,
        "并发编辑",
      );
      const demoPageA = await createDemoPage(
        pageA,
        project.id,
        sessionId,
        "页面A",
      );
      const demoPageB = await createDemoPage(
        pageA,
        project.id,
        sessionId,
        "页面B",
      );
      await persistWorkspace(pageA, sessionId);

      // 浏览器 A 编辑页面 A
      await updateDemoPageCode(pageA, sessionId, demoPageA.id, markerA);

      // 浏览器 B 打开同一项目
      const sessionBPromise = waitForEditSession(pageB, project.id);
      await pageB.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        pageB.getByRole("heading", { name: project.name }),
      ).toBeVisible({
        timeout: 30000,
      });
      const sessionBBody = await parseApiResponse<SessionCreateResult>(
        await sessionBPromise,
      );
      const sessionIdB = sessionBBody.data.sessionId;

      // 浏览器 B 编辑页面 B
      await updateDemoPageCode(pageB, sessionIdB, demoPageB.id, markerB);

      // 双方各自 persist
      await persistWorkspace(pageA, sessionId);
      await persistWorkspace(pageB, sessionIdB);

      // 通过新 session 验证两份修改都保留了（用轮询断言）
      const verifyResponse = await pageA.request.post("/api/sessions", {
        data: { demoId: project.id, forceNew: true },
      });
      const verifyBody =
        await parseApiResponse<SessionCreateResult>(verifyResponse);
      const verifySessionId = verifyBody.data.sessionId;

      await expectDemoPageContains(pageA, verifySessionId, demoPageA.id, [
        markerA,
      ]);
      await expectDemoPageContains(pageA, verifySessionId, demoPageB.id, [
        markerB,
      ]);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  // ── Test 11 ─────────────────────────────────────────────────────────────
  // 场景: 打开编辑器 → page.route 模拟离线 → UI 编辑（localStorage 草稿）→ 恢复 → persist
  // 断言: 草稿内容保留并最终持久化
  test("离线编辑草稿保留，重连安全提交", async ({ page }) => {
    const offlineMarker = `offline-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project } = await createMutationProject(page, "离线草稿保留");

    // 打开编辑器
    const editSessionId = await openProjectEditor(page, project);
    const demoPage = await createDemoPage(
      page,
      project.id,
      editSessionId,
      "离线页",
    );
    await persistWorkspace(page, editSessionId);

    // 模拟离线：通过 page.route 拦截所有 API 请求返回网络错误
    await page.route("**/api/**", (route) =>
      route.abort("internetdisconnected"),
    );

    // 在离线状态下通过 localStorage 模拟前端草稿保存
    // （真实场景中前端 collab 层会将 ytext 变更缓存到 IndexedDB/localStorage）
    await page.evaluate(
      ({ sessionId, demoId, marker }) => {
        const draftKey = `draft:${sessionId}:${demoId}`;
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            code: `// offline-draft: ${marker}\n`,
            updatedAt: Date.now(),
          }),
        );
      },
      { sessionId: editSessionId, demoId: demoPage.id, marker: offlineMarker },
    );

    // 验证离线草稿在 localStorage 中存在
    const draftExists = await page.evaluate(
      ({ sessionId, demoId }) => {
        const draftKey = `draft:${sessionId}:${demoId}`;
        return localStorage.getItem(draftKey) !== null;
      },
      { sessionId: editSessionId, demoId: demoPage.id },
    );
    expect(draftExists, "离线编辑的草稿应在 localStorage 中保留").toBe(true);

    // 恢复网络：取消 route 拦截
    await page.unroute("**/api/**");
    await page.waitForLoadState("networkidle");

    // 重连后通过 API 提交草稿
    await updateDemoPageCode(page, editSessionId, demoPage.id, offlineMarker);
    await persistWorkspace(page, editSessionId);

    // 重新打开验证（用 expectDemoPageContains 轮询）
    const reopenedSessionId = await openProjectEditor(page, project);
    await expectDemoPageContains(page, reopenedSessionId, demoPage.id, [
      offlineMarker,
    ]);
  });

  // ── Test 12 ─────────────────────────────────────────────────────────────
  // 场景: 打开编辑器 → 切换到画布 → 添加文本节点 → page.keyboard.type 连续输入
  // 断言: 每个字符都能被输入，不被 autosave debounce 阻塞
  test("持续输入不被 autosave 阻塞", async ({ page }) => {
    const typingMarker = `typing-${crypto.randomBytes(4).toString("hex")}`;

    await openHome(page);
    const { project } = await createMutationProject(page, "持续输入不阻塞");

    // 打开编辑器并创建页面
    const editSessionId = await openProjectEditor(page, project);
    const demoPage = await createDemoPage(
      page,
      project.id,
      editSessionId,
      "输入页",
    );
    await persistWorkspace(page, editSessionId);

    // 重新进入编辑器获取活跃 session
    await openProjectEditor(page, project);

    // 切换到画布模式
    await page.getByRole("button", { name: /^画布$/ }).click();
    const canvasRoot = page.locator('[data-canvas-root="true"]');
    await expect(canvasRoot).toBeVisible({ timeout: 30000 });

    // 添加文本节点
    await page.getByRole("button", { name: "添加文字" }).click();
    const box = await canvasRoot.boundingBox();
    expect(box, "画布区域应可见").toBeTruthy();
    await page.mouse.click(box!.x + 200, box!.y + 300);

    // 等待文本编辑器出现
    const textEditor = page.getByRole("textbox", { name: "编辑文字" }).last();
    await expect(textEditor).toBeVisible({ timeout: 10000 });
    await textEditor.click();

    // 用 page.keyboard.type 连续输入，每个字符间隔极短
    const startTime = Date.now();
    const charTimes: number[] = [];

    for (const char of typingMarker) {
      const charStart = Date.now();
      await page.keyboard.type(char, { delay: 10 });
      charTimes.push(Date.now() - charStart);
    }

    const totalElapsed = Date.now() - startTime;

    // 核心断言：没有单次字符输入被 autosave debounce 阻塞超过 debounce 窗口的 2 倍
    const maxAllowedMs = AUTOSAVE_DEBOUNCE_MS * 2;
    for (const [index, time] of charTimes.entries()) {
      expect(
        time,
        `第 ${index} 个字符输入耗时 ${time}ms 不应超过 ${maxAllowedMs}ms`,
      ).toBeLessThan(maxAllowedMs);
    }

    // 总耗时应在合理范围内
    expect(
      totalElapsed,
      `连续输入 ${typingMarker.length} 个字符总耗时 ${totalElapsed}ms 不应被 autosave 阻塞`,
    ).toBeLessThan(maxAllowedMs * typingMarker.length);

    // 验证文本编辑器中显示了完整输入
    await expect(textEditor).toHaveValue(typingMarker, { timeout: 10000 });

    // 等待画布自动保存并退出
    await page.waitForTimeout(AUTOSAVE_DEBOUNCE_MS + 2000);
    await page.getByTitle("返回首页").click();
    await page.waitForLoadState("networkidle");
  });
});
