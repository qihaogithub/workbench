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
  await expect(contextToolbar.getByLabel("悬浮填充")).toBeVisible();
  await expect(contextToolbar.getByLabel("悬浮描边")).toBeVisible();
  await expect(contextToolbar.getByLabel("悬浮文本")).toBeVisible();
  await expect(contextToolbar.getByLabel("悬浮层级")).toBeVisible();
  const moreTrigger = contextToolbar.getByLabel("悬浮更多");
  const moreTriggerBox = await moreTrigger.boundingBox();
  expect(moreTriggerBox).not.toBeNull();
  await moreTrigger.click();
  const moreMenu = page.getByRole("menu", { name: "更多操作" });
  await expect(moreMenu).toBeVisible();
  const moreMenuBox = await moreMenu.boundingBox();
  expect(moreMenuBox).not.toBeNull();
  if (moreTriggerBox && moreMenuBox) {
    expect(moreMenuBox.width).toBeLessThan(240);
    expect(Math.abs((moreMenuBox.x + moreMenuBox.width / 2) - (moreTriggerBox.x + moreTriggerBox.width / 2))).toBeLessThan(3);
  }
  await expect(moreMenu.getByRole("menuitem", { name: /删除/ })).toBeVisible();
  await expect(moreMenu.getByRole("menuitem", { name: /^剪切/ })).toBeVisible();
  await expect(moreMenu.getByRole("menuitem", { name: /^复制 ⌘ C$/ })).toBeVisible();
  await expect(moreMenu.getByRole("menuitem", { name: /^复制样式/ })).toBeVisible();
  await expect(moreMenu.getByRole("menuitem", { name: /^粘贴样式/ })).toBeVisible();
  await expect(moreMenu.getByRole("menuitem", { name: /^位置与大小/ })).toBeVisible();
  await expect(moreMenu.getByText("副本")).toHaveCount(0);
  await expect(moreMenu.getByText("关闭")).toHaveCount(0);
  await moreMenu.getByRole("menuitem", { name: /^位置与大小/ }).click();
  await expect(page.getByLabel("水平位置")).toBeVisible();
  await expect(page.getByLabel("垂直位置")).toBeVisible();
  await expect(page.getByLabel("宽度")).toBeVisible();
  await expect(page.getByLabel("高度")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "更多操作" })).toHaveCount(0);
});

test("whiteboard keeps zoom and inline text editing available without fixed side panels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "文本", exact: true }).click();
  await page.locator("[data-sketch-stage]").click({ position: { x: 260, y: 220 } });
  const editor = page.getByLabel("画布文本编辑");
  await editor.fill("A simple idea");
  await editor.press("Enter");
  await expect(editor).toHaveValue("A simple idea\n");
  await page.getByRole("button", { name: "放大" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("A simple idea", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重置缩放" })).toContainText(/%/);
});

test("selection controls keep a stable screen size while the canvas zooms", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 220, y: 180 }, { x: 340, y: 280 });
  await page.locator('[data-sketch-node-id^="sketch_"]').first().click();

  const rotateHandle = page.getByTestId("sketch-rotate-handle");
  const resizeHandle = page.getByTestId("sketch-resize-handle");
  await expect(rotateHandle).toBeVisible();
  await expect(resizeHandle).toBeVisible();
  const beforeRotate = await rotateHandle.boundingBox();
  const beforeResize = await resizeHandle.boundingBox();
  expect(beforeRotate).not.toBeNull();
  expect(beforeResize).not.toBeNull();

  await page.getByRole("button", { name: "放大" }).click();
  await expect.poll(async () => (await page.locator("[data-sketch-stage]").getAttribute("style")) ?? "").toContain("scale(1.15)");

  const afterRotate = await rotateHandle.boundingBox();
  const afterResize = await resizeHandle.boundingBox();
  expect(afterRotate).not.toBeNull();
  expect(afterResize).not.toBeNull();
  if (beforeRotate && beforeResize && afterRotate && afterResize) {
    expect(Math.abs(afterRotate.width - beforeRotate.width)).toBeLessThan(1.5);
    expect(Math.abs(afterRotate.height - beforeRotate.height)).toBeLessThan(1.5);
    expect(Math.abs(afterResize.width - beforeResize.width)).toBeLessThan(1.5);
    expect(Math.abs(afterResize.height - beforeResize.height)).toBeLessThan(1.5);
    expect(afterRotate.x).toBeLessThan(afterResize.x);
    expect(afterRotate.y).toBeGreaterThan(afterResize.y);
  }
});

test("moving two shapes shows alignment guides without labels or spacing guides", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 220, y: 180 }, { x: 300, y: 260 });
  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 420, y: 180 }, { x: 500, y: 260 });

  const nodes = page.locator('[data-sketch-node-id^="sketch_"]');
  await nodes.nth(0).click();
  const stage = page.locator("[data-sketch-stage]");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (!stageBox) return;

  await page.mouse.move(stageBox.x + 260, stageBox.y + 220);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + 456, stageBox.y + 220);

  const guides = page.getByTestId("sketch-snap-guide");
  await expect(guides).not.toHaveCount(0);
  await expect(page.locator('[data-sketch-snap-guide-kind="spacing"]')).toHaveCount(0);
  await expect(page.getByText("网格", { exact: true })).toHaveCount(0);
  await expect(page.getByText("边缘", { exact: true })).toHaveCount(0);
  await expect(page.getByText("中心线", { exact: true })).toHaveCount(0);
  await page.mouse.up();
});

test("bottom toolbar tooltips appear after 200ms hover and focus without native titles", async ({ page }) => {
  await page.goto("/");

  const selectButton = page.getByRole("button", { name: "选择", exact: true });
  await expect(selectButton).not.toHaveAttribute("title");
  await selectButton.hover();
  await page.waitForTimeout(250);
  await expect(page.getByRole("tooltip", { name: "选择", exact: true })).toBeVisible();

  await page.mouse.move(8, 8);
  await expect(page.getByRole("tooltip", { name: "选择", exact: true })).toHaveCount(0);
  await selectButton.focus();
  await page.waitForTimeout(250);
  await expect(page.getByRole("tooltip", { name: "选择", exact: true })).toBeVisible();
});

test("pure text toolbar keeps layer access alongside style, color, and alignment controls", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "文本", exact: true }).click();
  await page.locator("[data-sketch-stage]").click({ position: { x: 340, y: 260 } });
  const editor = page.getByLabel("画布文本编辑");
  await editor.fill("Toolbar title");

  const toolbar = page.getByRole("toolbar", { name: "纯文本工具栏" });
  await expect(toolbar.getByLabel("悬浮字号")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮加粗")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮斜体")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮下划线")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮文字颜色")).toBeVisible();
  await expect(toolbar.getByLabel("对齐方式")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮层级")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮更多")).toBeVisible();

  await toolbar.getByLabel("悬浮文字颜色").click();
  const colorMenu = page.getByRole("menu", { name: "文字颜色" });
  await expect(colorMenu).toBeVisible();
  await expect(colorMenu.getByLabel(/无颜色/)).toHaveCount(0);
  await colorMenu.getByLabel("文字颜色 #2563eb").click();

  await toolbar.getByLabel("对齐方式").click();
  const alignMenu = page.getByRole("menu", { name: "对齐方式" });
  await alignMenu.getByLabel("对齐方式 居中对齐").click();

  await toolbar.getByLabel("悬浮层级").click();
  await expect(page.getByRole("menu", { name: "层级" })).toBeVisible();
  await expect(editor).toHaveCount(0);
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
  await page.getByRole("button", { name: "选择" }).click();

  await expect(page.locator("[data-sketch-stage]")).toHaveScreenshot("whiteboard-bridge-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixels: 120,
    threshold: 0.2,
  });
});
