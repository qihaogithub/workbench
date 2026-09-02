import { expect, type APIResponse, type Page, test } from "@playwright/test";

import { loginE2EUser } from "./support/e2e-auth";
import { createE2EProject } from "./support/e2e-projects";

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:4200";
const E2E_USER = process.env.E2E_USER ?? "qihao";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "130015";

const WHITEBOARD_SCHEMA = JSON.stringify(
  {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "白板宿主回归配置",
    type: "object",
    properties: {
      heroImage: {
        type: "string",
        format: "image",
        title: "主视觉图片",
        default: "",
      },
    },
    required: ["heroImage"],
  },
  null,
  2,
);

const WHITEBOARD_CODE = `import React from 'react';

export default function WhiteboardHostRegression({ heroImage }: { heroImage: string }) {
  return <main className="min-h-screen bg-white"><img src={heroImage} alt="主视觉图片" /></main>;
}
`;

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type SessionData = {
  sessionId: string;
  demoPages?: Array<{ id: string }>;
};

let createdProjectId: string | null = null;

test.afterEach(async ({ page }) => {
  if (!createdProjectId) return;
  const cleanupStatus = await page
    .evaluate(async (projectId) => {
      const response = await fetch(`/api/demos/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      return response.status;
    }, createdProjectId)
    .catch(() => 0);
  if (cleanupStatus !== 200 && cleanupStatus !== 404) {
    console.warn(`[e2e] whiteboard fixture cleanup returned ${cleanupStatus}`);
  }
  createdProjectId = null;
});

async function parseApi<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  expect(response.ok(), JSON.stringify(body)).toBeTruthy();
  expect(body.success, JSON.stringify(body)).toBe(true);
  return body.data as T;
}

async function openEditPage(
  page: Page,
): Promise<{ projectId: string; sessionId: string }> {
  await loginE2EUser(page, {
    baseURL: E2E_BASE_URL,
    username: E2E_USER,
    password: E2E_PASSWORD,
  });
  const project = await createE2EProject(page, "配置图片白板宿主回归");
  createdProjectId = project.id;
  const session = await parseApi<SessionData>(
    await page.request.post("/api/sessions", {
      data: { demoId: project.id, forceNew: true },
    }),
  );
  const pageId = session.demoPages?.[0]?.id;
  const targetPageId =
    pageId ??
    (
      await parseApi<{ id: string }>(
        await page.request.post(`/api/projects/${project.id}/demos`, {
          data: { sessionId: session.sessionId, name: "首页" },
        }),
      )
    ).id;
  await parseApi(
    await page.request.put(
      `/api/sessions/${session.sessionId}/files/${targetPageId}`,
      {
        data: { code: WHITEBOARD_CODE, schema: WHITEBOARD_SCHEMA },
      },
    ),
  );
  await parseApi(
    await page.request.post(`/api/sessions/${session.sessionId}/save`, {
      data: { note: "配置图片白板宿主回归" },
    }),
  );
  await page.goto(`/demo/${project.id}/edit`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: project.name })).toBeVisible({
    timeout: 30_000,
  });
  return { projectId: project.id, sessionId: session.sessionId };
}

test("宿主编辑页可打开白板、导入代码并提交带 revision 的 document", async ({
  page,
}) => {
  const { projectId } = await openEditPage(page);
  await page.getByTitle("配置").first().click();
  await expect(page.getByText(/主视觉图片/).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByLabel("白板绘图").click({ force: true });
  await expect(
    page.getByRole("heading", { name: "配置图片白板", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "回填图片" })).toBeEnabled();

  for (const label of ["选择", "抓手", "矩形", "圆形", "文本", "图片", "画笔"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(1);
  }
  for (const label of ["菱形", "线条", "箭头", "便签", "橡皮", "橡皮擦"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }
  const brushGroup = page.getByRole("group", { name: "画笔工具" });
  await expect(brushGroup.getByRole("button", { name: "打开画笔设置" })).toBeVisible();
  await brushGroup.getByRole("button", { name: "打开画笔设置" }).click();
  const brushSettings = page.getByRole("dialog", { name: "画笔设置" });
  await expect(brushSettings.getByRole("button", { name: "画笔", exact: true })).toBeVisible();
  await expect(brushSettings.getByRole("button", { name: "橡皮擦", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭画笔设置" }).click();

  const commitRequests: Array<Record<string, unknown>> = [];
  await page.route(
    `/api/projects/${projectId}/whiteboards/commit`,
    async (route) => {
      commitRequests.push(
        JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { values: { heroImage: "assets/whiteboards/e2e.png" } },
        }),
      });
    },
  );

  await page.getByRole("button", { name: "代码导入/导出" }).click();
  await page
    .getByLabel("白板 HTML 代码")
    .fill(
      '<main data-sketch-canvas="v1" data-width="240" data-height="120"><div data-sketch-id="box" data-sketch-kind="rect"></div></main>',
    );
  await page
    .getByLabel("白板 CSS 代码")
    .fill(
      '[data-sketch-id="box"] { left: 20px; top: 20px; width: 160px; height: 80px; background: #e2e8f0; }',
    );
  await page.getByRole("button", { name: "导入到白板" }).click();
  await expect(page.getByText("有未回填的本地修改")).toBeVisible();

  await page.getByRole("button", { name: "回填图片" }).click();
  await expect(
    page.getByRole("heading", { name: "配置图片白板", exact: true }),
  ).toBeHidden();
  expect(commitRequests).toHaveLength(1);
  expect(commitRequests[0]).toMatchObject({
    baseDocumentRevision: null,
    document: {
      version: 3,
      sceneFormat: "sketch-scene-v1",
      documentRevision: 0,
      scene: { pageSize: { width: 240, height: 120 } },
    },
  });
});
