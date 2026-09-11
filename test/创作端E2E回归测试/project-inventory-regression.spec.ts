import { expect, type APIResponse, type Page, test } from "@playwright/test";

import { loginE2EUser } from "./support/e2e-auth";
import { E2E_BASE_URL, getE2ELoginCredentials } from "./support/e2e-config";
import { createE2EProject } from "./support/e2e-projects";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; error?: { code?: string; message?: string } };
type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

type SessionCreateResult = {
  sessionId: string;
  workspaceId?: string | null;
};

type SessionFilesResult = {
  demoPages: Array<{ id: string; name: string }>;
};

type DemoPage = { id: string; name: string };

type InventoryEntry = {
  canonicalUri: string;
  generationState: string;
  human?: { summary?: string | null };
};

type InventoryPayload = {
  entries: InventoryEntry[];
  overrides: { entries?: Record<string, { summary?: string | null }> };
  hash: string | null;
  projectionState: "ready" | "stale" | "unavailable";
  generationActivity: "active" | "idle" | "failed" | "unavailable";
};

const SEED_CODE = `import React from "react";

export default function InventoryRegression() {
  return <main><h1>Inventory regression</h1></main>;
}
`;

const SEED_SCHEMA = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "项目清单回归配置",
  type: "object",
  properties: {
    title: { type: "string", title: "标题", default: "清单回归" },
  },
});

async function parseApiResponse<T>(response: APIResponse): Promise<ApiSuccess<T>> {
  const body = (await response.json()) as ApiResponse<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return body as ApiSuccess<T>;
}

async function openHome(page: Page): Promise<void> {
  await loginE2EUser(page, getE2ELoginCredentials());
  await page.goto(E2E_BASE_URL, { waitUntil: "domcontentloaded" });
}

async function createSession(page: Page, projectId: string): Promise<SessionCreateResult> {
  const response = await page.request.post("/api/sessions", {
    data: { demoId: projectId, forceNew: true },
  });
  const body = await parseApiResponse<SessionCreateResult>(response);
  expect(body.data.sessionId).toMatch(/^session-/);
  expect(body.data.workspaceId).toBeTruthy();
  return body.data;
}

async function seedPage(page: Page, projectId: string, session: SessionCreateResult): Promise<void> {
  const filesResponse = await page.request.get(`/api/sessions/${session.sessionId}/files`);
  const files = await parseApiResponse<SessionFilesResult>(filesResponse);
  let target: DemoPage | undefined = files.data.demoPages[0];
  if (!target) {
    const createResponse = await page.request.post(`/api/projects/${projectId}/demos`, {
      data: { sessionId: session.sessionId, name: "首页" },
    });
    const created = await parseApiResponse<DemoPage>(createResponse);
    target = created.data;
  }
  expect(target.id).toBeTruthy();

  const updateResponse = await page.request.put(
    `/api/sessions/${session.sessionId}/files/${target.id}`,
    { data: { code: SEED_CODE, schema: SEED_SCHEMA } },
  );
  await parseApiResponse<null>(updateResponse);

  const saveResponse = await page.request.post(`/api/sessions/${session.sessionId}/save`, {
    data: { note: "项目清单 E2E 回归" },
  });
  await parseApiResponse<unknown>(saveResponse);

  const publishResponse = await page.request.post(`/api/projects/${projectId}/publish`, {
    data: {
      sessionId: session.sessionId,
      workspaceId: session.workspaceId,
      imageOptions: { skip: true },
    },
  });
  await parseApiResponse<unknown>(publishResponse);
}

async function readInventory(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<InventoryPayload> {
  const response = await page.request.get(
    `/api/projects/${projectId}/inventory/overrides?sessionId=${encodeURIComponent(sessionId)}`,
  );
  const body = await parseApiResponse<InventoryPayload>(response);
  return body.data;
}

async function waitForGenerationTerminal(
  page: Page,
  projectId: string,
  sessionId: string,
): Promise<InventoryPayload> {
  let latest = await readInventory(page, projectId, sessionId);
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const active = latest.entries.filter((entry) => (
      entry.generationState === "pending" || entry.generationState === "running"
    ));
    if (active.length === 0 && latest.generationActivity !== "active") return latest;
    await page.waitForTimeout(1_000);
    latest = await readInventory(page, projectId, sessionId);
  }
  throw new Error(`项目清单生成未进入终态：${latest.entries.map((entry) => `${entry.canonicalUri}:${entry.generationState}`).join(", ")}`);
}

test.describe("项目清单自动保存与语义生成回归", () => {
  test("发布后后台生成、自动回读、人工覆盖与 CAS 冲突", async ({ page }) => {
    test.setTimeout(180_000);
    await openHome(page);

    const project = await createE2EProject(page, "项目清单自动保存与语义生成");
    const session = await createSession(page, project.id);
    await seedPage(page, project.id, session);

    const reconcileResponse = await page.request.post(
      `/api/projects/${project.id}/inventory/reconcile?sessionId=${encodeURIComponent(session.sessionId)}`,
    );
    const reconcile = await parseApiResponse<{ generationId: number; queued: number }>(reconcileResponse);
    expect(reconcile.data.generationId).toBeGreaterThan(0);
    expect(reconcile.data.queued).toBeGreaterThan(0);

    const terminal = await waitForGenerationTerminal(page, project.id, session.sessionId);
    expect(terminal.entries.length).toBeGreaterThan(0);
    expect(terminal.entries.every((entry) => ["ready", "failed", "not_required"].includes(entry.generationState))).toBe(true);
    expect(terminal.projectionState).toBe("ready");
    expect(["idle", "failed"]).toContain(terminal.generationActivity);

    const authResponse = page.waitForResponse((response) => (
      response.url().endsWith("/api/auth/me") && response.status() === 200
    ));
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, { waitUntil: "domcontentloaded" });
    await authResponse;
    await page.getByRole("button", { name: "文档" }).click();
    const inventoryResponsePromise = page.waitForResponse((response) => (
      response.url().includes(`/api/projects/${project.id}/inventory/overrides`)
      && response.status() === 200
    ));
    await page.getByText("项目清单", { exact: true }).first().click();
    const inventoryResponse = await inventoryResponsePromise;
    const inventoryBody = await inventoryResponse.json() as ApiResponse<InventoryPayload>;
    expect(inventoryBody.success).toBe(true);
    if (inventoryBody.success) expect(inventoryBody.data.entries.length).toBeGreaterThan(0);
    const inventory = page.getByTestId("project-inventory-view");
    await expect(inventory).toBeVisible({ timeout: 30_000 });
    await expect(inventory.getByRole("heading", { name: "项目清单", exact: true })).toBeVisible();
    await expect(inventory.getByRole("button", { name: "刷新项目清单" })).toBeVisible();
    await expect(inventory.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);

    const editButton = inventory.getByRole("button", { name: /编辑简介/ }).first();
    await expect(editButton).toBeVisible({ timeout: 30_000 });
    await editButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const firstSaveResponsePromise = page.waitForResponse((response) => (
      response.url().includes(`/api/projects/${project.id}/inventory/overrides`)
      && response.request().method() === "PUT"
      && response.status() === 200
    ));
    await dialog.locator("#inventory-summary").fill("首次自动保存的人工简介");
    const firstSaveResponse = await firstSaveResponsePromise;
    const editorSessionId = new URL(firstSaveResponse.url()).searchParams.get("sessionId");
    expect(editorSessionId).toBeTruthy();

    const afterSave = await readInventory(page, project.id, editorSessionId!);
    const editedUri = Object.keys(afterSave.overrides.entries ?? {})[0];
    expect(editedUri).toBeTruthy();
    expect(afterSave.overrides.entries?.[editedUri!]?.summary).toBe("首次自动保存的人工简介");

    await dialog.getByRole("button", { name: "关闭" }).click({ force: true });
    await expect(dialog).toBeHidden();
    const remote = { [editedUri!]: { summary: "远端同时修改的简介" } };
    const remoteResponse = await page.request.put(
      `/api/projects/${project.id}/inventory/overrides?sessionId=${encodeURIComponent(editorSessionId!)}`,
      { data: { entries: remote, expectedHash: afterSave.hash } },
    );
    await parseApiResponse<unknown>(remoteResponse);

    await inventory.getByRole("button", { name: /编辑简介/ }).first().click();
    await page.getByRole("dialog").locator("#inventory-summary").fill("本地同时修改的简介");
    await expect(inventory.getByRole("status")).toContainText("文档版本冲突", { timeout: 15_000 });
    await expect(page.getByRole("alert")).toContainText("字段同时被修改");
    await expect(inventory.getByRole("button", { name: "重试保存" })).toBeVisible();
    await expect(page.getByRole("dialog").locator("#inventory-summary")).toHaveValue("本地同时修改的简介");
    await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click({ force: true });
    await expect(page.getByRole("dialog")).toBeHidden();
    await inventory.getByRole("button", { name: "放弃修改" }).click();
  });

  test("零文档项目取消行内新建不落盘，有效标题只创建一次", async ({ page }) => {
    test.setTimeout(120_000);
    await openHome(page);
    const project = await createE2EProject(page, "知识文档行内草稿回归");
    const session = await createSession(page, project.id);
    await page.goto(`${E2E_BASE_URL}/demo/${project.id}/edit`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "文档" }).click();

    await page.getByRole("button", { name: "新建或上传文档" }).click();
    await page.getByText("新建", { exact: true }).click();
    await page.getByLabel("新文档标题").press("Escape");
    const emptyResponse = await page.request.get(`/api/projects/${project.id}/documents?sessionId=${encodeURIComponent(session.sessionId)}`);
    const empty = await parseApiResponse<{ items: unknown[]; issues: unknown[] }>(emptyResponse);
    expect(empty.data).toEqual({ items: [], issues: [] });

    await page.getByRole("button", { name: "新建或上传文档" }).click();
    await page.getByText("新建", { exact: true }).click();
    await page.getByLabel("新文档标题").fill("唯一文档");
    await page.getByLabel("新文档标题").press("Enter");
    await expect(page.getByText("唯一文档", { exact: true })).toBeVisible();
    const createdResponse = await page.request.get(`/api/projects/${project.id}/documents?sessionId=${encodeURIComponent(session.sessionId)}`);
    const created = await parseApiResponse<{ items: Array<{ title: string }>; issues: unknown[] }>(createdResponse);
    expect(created.data.items.map((item) => item.title)).toEqual(["唯一文档"]);
    expect(created.data.issues).toEqual([]);
  });
});
