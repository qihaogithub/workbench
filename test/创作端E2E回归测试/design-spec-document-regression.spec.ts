// maintained-by: h5-test
import {
  expect,
  test,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import { loginE2EUser } from "./support/e2e-auth";
import { createE2EProject } from "./support/e2e-projects";

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4200";
const E2E_USER = process.env.E2E_USER ?? "qihao";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "130015";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error?: { message?: string } };
type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type SessionBootstrap = {
  sessionId: string;
  workspacePath: string;
};

type DesignSpecMeta = {
  id: string;
  title: string;
};

type DesignSpecDoc = DesignSpecMeta & {
  entries: Array<{ id: string; title: string; markdown: string }>;
};

async function parseApiResponse<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as ApiResult<T>;
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
  await page.goto(E2E_BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
}

async function createSession(
  page: Page,
  projectId: string,
): Promise<SessionBootstrap> {
  return parseApiResponse<SessionBootstrap>(
    await page.request.post("/api/sessions", {
      data: { demoId: projectId, forceNew: true },
    }),
  );
}

async function getDesignSpec(
  page: Page,
  workspacePath: string,
  sessionId: string,
  projectId: string,
  docId: string,
): Promise<DesignSpecDoc> {
  return parseApiResponse<DesignSpecDoc>(
    await page.request.get(
      `/api/design-specs/${docId}?workingDir=${encodeURIComponent(workspacePath)}&sessionId=${encodeURIComponent(sessionId)}&projectId=${encodeURIComponent(projectId)}`,
    ),
  );
}

async function getInputByValue(page: Page, value: string): Promise<Locator> {
  const inputs = page.locator("input");
  let index = -1;
  await expect
    .poll(
      async () => {
        index = await inputs.evaluateAll(
          (elements, expectedValue) =>
            elements.findIndex(
              (element) =>
                (element as HTMLInputElement).value === expectedValue,
            ),
          value,
        );
        return index;
      },
      { message: `找不到值为「${value}」的输入框`, timeout: 30000 },
    )
    .toBeGreaterThanOrEqual(0);
  return inputs.nth(index);
}

test.describe("创作端设计规范文档稳定性", () => {
  test("创建、切换、页面规范编辑和自动保存不会回跳", async ({ page }) => {
    test.setTimeout(180000);
    let nativePromptShown = false;
    page.on("dialog", async (dialog) => {
      nativePromptShown = dialog.type() === "prompt" || nativePromptShown;
      await dialog.dismiss();
    });

    await openHome(page);
    const project = await createE2EProject(page, "设计规范文档稳定性");
    const session = await createSession(page, project.id);

    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible(
      {
        timeout: 30000,
      },
    );
    await expect(page.getByRole("button", { name: "发布" })).toBeVisible({
      timeout: 30000,
    });

    await page.getByRole("button", { name: "文档", exact: true }).click();
    await expect(page.getByText("设计规范", { exact: true })).toBeVisible({
      timeout: 30000,
    });

    const createDesignSpec = async (title: string): Promise<DesignSpecMeta> => {
      await page.getByTitle("新建设计规范文档").click();
      const nameInput = page.getByRole("textbox", { name: "文档标题" });
      await expect(nameInput).toBeVisible();
      await nameInput.fill(title);
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/design-specs?") &&
          response.request().method() === "POST",
      );
      await nameInput.press("Enter");
      const created = await parseApiResponse<DesignSpecMeta>(
        await responsePromise,
      );
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      return created;
    };

    const firstDoc = await createDesignSpec("弹窗挑战成功设计规范");
    await page.getByTitle("新建设计规范文档").click();
    const cancelledNameInput = page.getByRole("textbox", { name: "文档标题" });
    await expect(cancelledNameInput).toHaveValue("设计规范 1");
    await cancelledNameInput.press("Escape");
    await expect(cancelledNameInput).not.toBeVisible();

    const secondDoc = await createDesignSpec("总规范");
    const firstRow = page.getByTestId(`design-spec-document-${firstDoc.id}`);
    const secondRow = page.getByTestId(`design-spec-document-${secondDoc.id}`);
    await firstRow.click();
    await expect(firstRow).toHaveClass(/bg-accent/);
    await secondRow.click();
    await expect(secondRow).toHaveClass(/bg-accent/);

    await page.getByTitle("新建页面规范").click();
    const entryNameInput = page.getByRole("textbox", { name: "规范名称" });
    await expect(entryNameInput).toHaveValue("新页面规范 1");
    await entryNameInput.fill("主图尺寸规范");
    await entryNameInput.press("Enter");
    const entryTitleInput = await getInputByValue(page, "主图尺寸规范");
    await expect(entryTitleInput).toBeVisible();
    await page.getByRole("button", { name: "展开主图尺寸规范" }).click();

    const markdownEditor = page.locator(".ProseMirror").last();
    await expect(markdownEditor).toBeVisible();
    const savePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/design-specs/${secondDoc.id}`) &&
        response.request().method() === "PUT",
      { timeout: 30000 },
    );
    await markdownEditor.fill(
      "主图尺寸：375x260px；使用 PNG 或 WebP，主体内容保持安全边距。",
    );
    await savePromise;

    await expect
      .poll(
        async () => {
          const latest = await getDesignSpec(
            page,
            session.workspacePath,
            session.sessionId,
            project.id,
            secondDoc.id,
          );
          return latest.entries.some(
            (entry) =>
              entry.title === "主图尺寸规范" &&
              entry.markdown.includes("375x260px"),
          );
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await expect(secondRow).toHaveClass(/bg-accent/);
    await expect(entryTitleInput).toHaveValue("主图尺寸规范");
    expect(nativePromptShown).toBe(false);

    const persisted = await getDesignSpec(
      page,
      session.workspacePath,
      session.sessionId,
      project.id,
      secondDoc.id,
    );
    expect(persisted.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "主图尺寸规范",
          markdown: expect.stringContaining("375x260px"),
        }),
      ]),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "文档", exact: true }).click();
    await expect(
      page.getByTestId(`design-spec-document-${secondDoc.id}`),
    ).toHaveClass(/bg-accent/, { timeout: 30000 });
    await expect(await getInputByValue(page, "主图尺寸规范")).toBeVisible({
      timeout: 30000,
    });
    expect(firstDoc.id).not.toBe(secondDoc.id);
  });
});
