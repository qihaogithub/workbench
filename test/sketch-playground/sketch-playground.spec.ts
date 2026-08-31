import { expect, test, type Page } from "@playwright/test";

async function dragOnStage(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const stage = page.locator("[data-sketch-stage]");
  const box = await stage.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y);
  await page.mouse.up();
}

test("whiteboard opens as a clean blank canvas with a bottom tool tray", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Whiteboard", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "矩形" })).toBeVisible();
  await expect(page.getByRole("button", { name: "放大" })).toBeVisible();
  await expect(page.locator("[data-sketch-node-id]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dev Data" })).toHaveCount(0);
});

test("selection exposes contextual editing and on-demand details", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 220, y: 180 }, { x: 380, y: 280 });

  const rect = page.locator('[data-sketch-node-id^="sketch_"]').first();
  await rect.click();
  const contextToolbar = page.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
  await expect(contextToolbar).toBeVisible();
  await contextToolbar.getByLabel("悬浮更多").click();
  await expect(page.getByRole("dialog", { name: "草图工具菜单" })).toBeVisible();
  await page.getByRole("button", { name: "图层管理" }).click();
  await expect(page.getByTestId("sketch-layer-panel")).toBeVisible();
  await page.getByRole("button", { name: "关闭工具菜单" }).click();
  await expect(page.getByRole("dialog", { name: "草图工具菜单" })).toHaveCount(0);
});

test("whiteboard keeps zoom and inline text editing available without fixed side panels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "文本", exact: true }).click();
  await page.locator("[data-sketch-stage]").click({ position: { x: 260, y: 220 } });
  await page.getByLabel("画布文本编辑").fill("A simple idea");
  await page.keyboard.press("Enter");
  await expect(page.getByText("A simple idea", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "放大" }).click();
  await expect(page.getByRole("button", { name: "重置缩放" })).toContainText(/%/);
});

test("whiteboard bridge profile hides tools that cannot round-trip to HTML/CSS", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "矩形" })).toBeVisible();
  await expect(page.getByRole("button", { name: "菱形" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "线条" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "箭头" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "画笔路径" })).toHaveCount(0);
});

test("whiteboard bridge scene keeps a pixel-tolerant PNG golden", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 220, y: 180 }, { x: 520, y: 330 });
  await page.getByRole("button", { name: "文本", exact: true }).click();
  await page.locator("[data-sketch-stage]").click({ position: { x: 620, y: 220 } });
  await page.getByLabel("画布文本编辑").fill("Golden title");
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-sketch-stage]")).toHaveScreenshot("whiteboard-bridge-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixels: 120,
    threshold: 0.2,
  });
});
