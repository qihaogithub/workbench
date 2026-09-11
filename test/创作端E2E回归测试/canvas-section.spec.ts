// maintained-by: h5-test
import {
  expect,
  type APIResponse,
  type Page,
  type Response,
  test,
} from "@playwright/test";

import { createE2EProject } from "./support/e2e-projects";
import {
  E2E_BASE_URL,
  E2E_USER,
  getE2EPassword,
} from "./support/e2e-config";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error?: { message?: string } };
type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type Project = { id: string; name: string };
type Session = { sessionId: string };
type DemoPage = { id: string; name: string };
type CanvasSection = {
  id: string;
  title: string;
  children: Array<{ kind: string; id: string }>;
};
type CanvasState = {
  pages: Record<string, unknown>;
  nodes?: Record<string, unknown>;
  sections?: Record<string, CanvasSection>;
};
type SessionFiles = { demoPages: DemoPage[] };

async function parseApiResponse<T>(
  response: APIResponse | Response,
): Promise<ApiSuccess<T>> {
  const body = (await response.json()) as ApiResult<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return body as ApiSuccess<T>;
}

async function login(page: Page): Promise<void> {
  await parseApiResponse<unknown>(
    await page.request.post("/api/auth/login", {
      data: { username: E2E_USER, password: getE2EPassword() },
    }),
  );
}

async function createSession(page: Page, projectId: string): Promise<string> {
  const response = await page.request.post("/api/sessions", {
    data: { demoId: projectId, forceNew: true },
  });
  return (await parseApiResponse<Session>(response)).data.sessionId;
}

async function createPage(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<DemoPage> {
  const response = await page.request.post(`/api/projects/${projectId}/demos`, {
    data: { sessionId, name: "Section 成员页面" },
  });
  return (await parseApiResponse<DemoPage>(response)).data;
}

async function waitForEditorSession(
  page: Page,
  projectId: string,
): Promise<Response> {
  return page.waitForResponse((response) => {
    if (
      !response.url().endsWith("/api/sessions") ||
      response.request().method() !== "POST"
    )
      return false;
    try {
      return (
        (response.request().postDataJSON() as { demoId?: string }).demoId ===
        projectId
      );
    } catch {
      return false;
    }
  });
}

async function getCanvasState(
  page: Page,
  sessionId: string,
): Promise<CanvasState | null> {
  const response = await page.request.get(
    `/api/sessions/${sessionId}/canvas-layout`,
  );
  return (await parseApiResponse<{ state: CanvasState | null }>(response)).data
    .state;
}

async function getSessionFiles(
  page: Page,
  sessionId: string,
): Promise<SessionFiles> {
  const response = await page.request.get(`/api/sessions/${sessionId}/files`);
  return (await parseApiResponse<SessionFiles>(response)).data;
}

async function waitForSection(
  page: Page,
  sessionId: string,
  predicate: (section: CanvasSection) => boolean,
): Promise<CanvasSection> {
  let latest: CanvasState | null = null;
  await expect
    .poll(
      async () => {
        latest = await getCanvasState(page, sessionId);
        return Object.values(latest?.sections ?? {}).find(predicate)?.id ?? "";
      },
      { timeout: 30000 },
    )
    .not.toBe("");
  return Object.values(latest?.sections ?? {}).find(predicate)!;
}

async function waitForSectionRemoval(
  page: Page,
  sessionId: string,
): Promise<CanvasState | null> {
  let latest: CanvasState | null = null;
  await expect
    .poll(
      async () => {
        latest = await getCanvasState(page, sessionId);
        return Object.keys(latest?.sections ?? {}).length;
      },
      { timeout: 30000 },
    )
    .toBe(0);
  return latest;
}

test.describe("画布 Section", () => {
  test("Option/Alt 拖拽复制页面时保留原页面并创建真实副本", async ({
    page,
  }) => {
    await login(page);
    const project: Project = await createE2EProject(
      page,
      "画布 Alt 拖拽复制回归",
    );
    const setupSessionId = await createSession(page, project.id);
    const sourcePage = await createPage(page, project.id, setupSessionId);

    const editorSessionPromise = waitForEditorSession(page, project.id);
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible(
      {
        timeout: 30000,
      },
    );
    const editorSessionId = (
      await parseApiResponse<Session>(await editorSessionPromise)
    ).data.sessionId;
    await page.getByRole("button", { name: /^画布$/ }).click();

    const source = page
      .locator('[data-canvas-root="true"]')
      .locator(`[data-page-id="${sourcePage.id}"]`);
    await expect(source).toBeVisible({ timeout: 30000 });
    const box = await source.boundingBox();
    expect(box).toBeTruthy();
    if (!box) throw new Error("未找到待复制页面的位置");

    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 80,
      box.y + box.height / 2 + 60,
      {
        steps: 6,
      },
    );
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect
      .poll(
        async () =>
          (await getSessionFiles(page, editorSessionId)).demoPages.length,
        { timeout: 30000 },
      )
      .toBe(2);
    const files = await getSessionFiles(page, editorSessionId);
    expect(
      files.demoPages.some((candidate) => candidate.id === sourcePage.id),
    ).toBe(true);
  });

  test("框选后自动收纳、越界释放与删除分区会保留成员", async ({ page }) => {
    await login(page);
    const project: Project = await createE2EProject(page, "画布 Section 回归");
    await createSession(page, project.id);

    const editorSessionPromise = waitForEditorSession(page, project.id);
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible(
      { timeout: 30000 },
    );
    const editorSessionId = (
      await parseApiResponse<Session>(await editorSessionPromise)
    ).data.sessionId;
    await page.getByRole("button", { name: /^画布$/ }).click();

    const canvas = page.locator('[data-canvas-root="true"]');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    if (!canvasBox) throw new Error("未找到画布位置");
    await page.getByRole("button", { name: "添加文字" }).click();
    await page.mouse.click(canvasBox.x + 48, canvasBox.y + 48);
    const member = canvas.locator("[data-canvas-node-id]");
    await expect(member).toHaveCount(1);
    const memberId = await member.getAttribute("data-canvas-node-id");
    expect(memberId).toBeTruthy();
    if (!memberId) throw new Error("未找到 Section 成员节点 ID");
    const memberBox = await member.boundingBox();
    expect(memberBox).toBeTruthy();
    if (!memberBox) throw new Error("未找到 Section 成员页面的位置");

    await page.getByRole("button", { name: "Section" }).click();
    // The canvas can be zoomed to 300%; use a screen-space margin that still
    // exceeds the Section minimum size after viewport-coordinate conversion.
    const sectionMargin = 140;
    await page.mouse.move(memberBox.x - sectionMargin, memberBox.y - sectionMargin);
    await page.mouse.down();
    await page.mouse.move(
      memberBox.x + memberBox.width + sectionMargin,
      memberBox.y + memberBox.height + sectionMargin,
      { steps: 6 },
    );
    await page.mouse.up();

    await expect(
      page.getByRole("dialog", { name: "确认收纳 Section 成员" }),
    ).toHaveCount(0);

    const section = canvas.locator("[data-canvas-section-id]");
    await expect(section).toHaveCount(1);
    const titleInput = section.getByRole("textbox", { name: "Section 标题" });
    await expect(titleInput).toBeFocused();
    await titleInput.fill("登录流程");
    await titleInput.press("Enter");
    await expect(
      section.getByRole("button", {
        name: /选择 Section: 登录流程，1 个成员/,
      }),
    ).toBeVisible();

    const persisted = await waitForSection(
      page,
      editorSessionId,
      (candidate) => candidate.title === "登录流程",
    );
    expect(persisted.children).toEqual([{ kind: "node", id: memberId }]);

    const sectionTitle = section.getByRole("button", {
      name: /选择 Section: 登录流程，1 个成员/,
    });
    const memberBeforeMove = await member.boundingBox();
    const titleBox = await sectionTitle.boundingBox();
    expect(memberBeforeMove).toBeTruthy();
    expect(titleBox).toBeTruthy();
    if (!memberBeforeMove || !titleBox) throw new Error("未找到拖动 Section 所需的位置");
    await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(titleBox.x + titleBox.width / 2 + 60, titleBox.y + titleBox.height / 2 + 40, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => (await member.boundingBox())?.x ?? 0).toBeCloseTo(
      memberBeforeMove.x + 60,
      0,
    );
    await expect.poll(async () => (await member.boundingBox())?.y ?? 0).toBeCloseTo(
      memberBeforeMove.y + 40,
      0,
    );

    await sectionTitle.click();
    const resizeHandle = section.getByRole("presentation");
    const resizeBox = await resizeHandle.boundingBox();
    expect(resizeBox).toBeTruthy();
    if (!resizeBox) throw new Error("未找到 Section 缩放手柄");
    await page.mouse.move(
      resizeBox.x + resizeBox.width / 2,
      resizeBox.y + resizeBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(resizeBox.x - 48, resizeBox.y - 48, { steps: 4 });
    await page.mouse.up();

    const released = await waitForSection(
      page,
      editorSessionId,
      (candidate) => candidate.title === "登录流程" && candidate.children.length === 0,
    );
    expect(released.children).toEqual([]);

    await page.keyboard.press("Delete");
    await expect(section).toHaveCount(0);
    await expect(canvas.locator(`[data-canvas-node-id="${memberId}"]`)).toBeVisible();

    const afterDelete = await waitForSectionRemoval(page, editorSessionId);
    expect(afterDelete?.sections ?? {}).toEqual({});
    expect(afterDelete?.nodes?.[memberId]).toBeTruthy();
  });
});
