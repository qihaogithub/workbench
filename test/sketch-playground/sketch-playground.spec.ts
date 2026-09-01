import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function expectMenuReceivesPointer(page: Page, menu: Locator, label: string) {
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const hitMenuLabel = await page.evaluate(({ x, y }) => {
    const hit = document.elementFromPoint(x, y);
    return hit?.closest<HTMLElement>('[role="menu"]')?.getAttribute("aria-label") ?? null;
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect(hitMenuLabel).toBe(label);
}

async function expectPresetColorGrid(menu: Locator, label: string) {
  const box = await menu.boundingBox();
  expect(box).not.toBeNull();
  if (box) expect(box.width).toBeLessThanOrEqual(320);
  const grid = menu.locator(`[data-sketch-color-grid="true"][aria-label="${label}常用颜色"]`);
  await expect(grid).toHaveCount(1);
  const swatches = grid.locator("[data-sketch-color]");
  await expect(swatches).toHaveCount(60);
  const colors = await swatches.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-sketch-color")));
  expect(new Set(colors).size).toBe(60);
  expect(colors).toContain("#f59e0b");
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
  await rect.click({ position: { x: 10, y: 10 } });
  const contextToolbar = page.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
  await expect(contextToolbar).toBeVisible();
  await expect(contextToolbar.getByLabel("悬浮填充")).toBeVisible();
  await expect(contextToolbar.getByLabel("悬浮描边")).toBeVisible();
  await expect(contextToolbar.getByLabel("悬浮文本")).toHaveCount(0);
  await expect(contextToolbar.getByLabel("悬浮层级")).toBeVisible();
  await expect(contextToolbar.getByTestId("sketch-floating-fill-indicator")).toBeVisible();
  await expect(contextToolbar.getByTestId("sketch-floating-stroke-indicator")).toBeVisible();
  for (const label of ["填充", "描边", "文本", "层级", "更多"]) {
    await expect(contextToolbar.getByText(label, { exact: true })).toHaveCount(0);
  }
  for (const button of await contextToolbar.getByRole("button").all()) {
    await expect(button).not.toHaveAttribute("title");
  }
  await contextToolbar.getByLabel("悬浮填充").hover();
  await page.waitForTimeout(250);
  await expect(page.getByRole("tooltip", { name: "填充", exact: true })).toBeVisible();
  await contextToolbar.getByLabel("悬浮填充").click();
  const fillMenu = page.getByRole("menu", { name: "填充" });
  await expectPresetColorGrid(fillMenu, "填充");
  await expect(fillMenu.getByLabel("填充 无颜色")).toBeVisible();
  await expect(fillMenu.getByText("无颜色", { exact: true })).toHaveCount(0);
  await fillMenu.getByLabel("填充 #f59e0b").click();
  await rect.dblclick();
  const shapeEditor = page.getByLabel("画布文本编辑");
  await expect(shapeEditor).toBeVisible();
  await expect(shapeEditor).toHaveAttribute("placeholder", "输入形状文本");
  const combinedToolbar = page.getByRole("toolbar", { name: "图文工具栏" });
  await expect(combinedToolbar).toBeVisible();
  await expect(combinedToolbar.getByLabel("悬浮文字颜色")).toBeVisible();
  await expect(combinedToolbar.getByLabel("悬浮字号")).toBeVisible();
  await expect(combinedToolbar.getByLabel("悬浮加粗")).toBeVisible();
  await expect(combinedToolbar.getByLabel("悬浮斜体")).toBeVisible();
  await expect(combinedToolbar.getByLabel("悬浮下划线")).toBeVisible();
  await expect(combinedToolbar.getByLabel("对齐方式")).toBeVisible();
  await expect.poll(async () => shapeEditor.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    overflowX: getComputedStyle(element).overflowX,
    overflowY: getComputedStyle(element).overflowY,
  }))).toMatchObject({
    backgroundColor: "rgba(0, 0, 0, 0)",
    overflowX: "auto",
  });
  await expect(shapeEditor).toHaveClass(/scrollbar-width:none/);
  await shapeEditor.press("Escape");
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
  await moreTrigger.click();
  await expect(page.getByRole("menu", { name: "更多操作" })).toHaveCount(0);
  await moreTrigger.click();
  await expect(page.getByRole("menu", { name: "更多操作" })).toBeVisible();
  const reopenedMoreMenu = page.getByRole("menu", { name: "更多操作" });
  await reopenedMoreMenu.getByRole("menuitem", { name: /^位置与大小/ }).click();
  await expect(page.getByLabel("水平位置")).toBeVisible();
  await expect(page.getByLabel("垂直位置")).toBeVisible();
  await expect(page.getByLabel("宽度")).toBeVisible();
  await expect(page.getByLabel("高度")).toBeVisible();
  const horizontalPositionBox = await page.getByLabel("水平位置").boundingBox();
  const widthBox = await page.getByLabel("宽度").boundingBox();
  const verticalPositionBox = await page.getByLabel("垂直位置").boundingBox();
  const heightBox = await page.getByLabel("高度").boundingBox();
  expect(horizontalPositionBox).not.toBeNull();
  expect(widthBox).not.toBeNull();
  expect(verticalPositionBox).not.toBeNull();
  expect(heightBox).not.toBeNull();
  if (horizontalPositionBox && widthBox && verticalPositionBox && heightBox) {
    expect(Math.abs(horizontalPositionBox.x - widthBox.x)).toBeLessThan(1.5);
    expect(Math.abs(verticalPositionBox.x - heightBox.x)).toBeLessThan(1.5);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "更多操作" })).toHaveCount(0);
});

test("multi-selection exposes style, alignment, grouping, and layer-unit actions", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 140, y: 100 }, { x: 260, y: 180 });
  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 360, y: 240 }, { x: 500, y: 340 });
  await page.getByRole("button", { name: "选择", exact: true }).click();

  const nodes = page.locator('[data-sketch-node-id^="sketch_"]');
  await expect(nodes).toHaveCount(2);
  await nodes.nth(0).click();
  await nodes.nth(1).click({ modifiers: ["Shift"] });

  const toolbar = page.getByRole("toolbar", { name: "草图悬浮快捷工具条" });
  await expect(toolbar.getByLabel("悬浮边框")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮颜色")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮对齐方式")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮组合")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮组合").locator('[data-sketch-icon="group"]')).toHaveCount(1);
  await expect(toolbar.getByLabel("悬浮组合").locator('[data-sketch-icon="ungroup"]')).toHaveCount(0);
  await expect(toolbar.getByLabel("悬浮图层")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮更多")).toBeVisible();
  await expect(toolbar.getByRole("button")).toHaveCount(6);

  await toolbar.getByLabel("悬浮对齐方式").click();
  const alignmentMenu = page.getByRole("menu", { name: "对齐方式" });
  await expectMenuReceivesPointer(page, alignmentMenu, "对齐方式");
  await expect(alignmentMenu.locator("[data-sketch-alignment]")).toHaveCount(6);
  const toolbarButtonBox = await toolbar.getByLabel("悬浮对齐方式").boundingBox();
  const alignmentButtonBox = await alignmentMenu.locator("[data-sketch-alignment]").first().boundingBox();
  const alignmentIconBox = await alignmentMenu.locator("[data-sketch-alignment] svg").first().boundingBox();
  const alignmentMenuBox = await alignmentMenu.boundingBox();
  expect(toolbarButtonBox).not.toBeNull();
  expect(alignmentButtonBox).not.toBeNull();
  expect(alignmentIconBox).not.toBeNull();
  expect(alignmentMenuBox).not.toBeNull();
  if (toolbarButtonBox && alignmentButtonBox && alignmentIconBox && alignmentMenuBox) {
    expect(alignmentButtonBox.width).toBeCloseTo(toolbarButtonBox.width, 1);
    expect(alignmentButtonBox.height).toBeCloseTo(toolbarButtonBox.height, 1);
    expect(alignmentIconBox.width).toBeCloseTo(14, 1);
    expect(alignmentIconBox.height).toBeCloseTo(14, 1);
    expect(alignmentMenuBox.height).toBeCloseTo(42, 1);
  }
  await expect(alignmentMenu.getByLabel("水平居中")).toBeVisible();
  await alignmentMenu.getByLabel("垂直居中").click();
  await expect(alignmentMenu).toHaveCount(0);

  await toolbar.getByLabel("悬浮更多").click();
  const moreMenu = page.getByRole("menu", { name: "更多操作" });
  const moreItemBox = await moreMenu.getByRole("menuitem", { name: "删除" }).boundingBox();
  expect(moreItemBox).not.toBeNull();
  if (moreItemBox) expect(moreItemBox.height).toBeCloseTo(32, 1);
  await expect(moreMenu.getByRole("menuitem", { name: "水平分布" })).toBeVisible();
  await expect(moreMenu.getByRole("menuitem", { name: "垂直分布" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(moreMenu).toHaveCount(0);

  await toolbar.getByLabel("悬浮组合").click();
  await expect(toolbar.getByLabel("悬浮解组")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮解组").locator('[data-sketch-icon="ungroup"]')).toHaveCount(1);
  await expect(toolbar.getByLabel("悬浮解组").locator('[data-sketch-icon="group"]')).toHaveCount(0);
  await expect(toolbar.getByLabel("悬浮边框")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮颜色")).toBeVisible();
  await expect(page.getByTestId("sketch-resize-handle")).toHaveCount(0);

  const groupedChildren = page.locator('[data-sketch-node-id^="sketch_"]');
  await expect(groupedChildren).toHaveCount(2);
  await groupedChildren.first().click({ position: { x: 10, y: 10 } });
  await expect(toolbar.getByLabel("悬浮解组")).toBeVisible();

  const beforeGroupDrag = await Promise.all(
    [0, 1].map(async (index) => groupedChildren.nth(index).boundingBox()),
  );
  expect(beforeGroupDrag[0]).not.toBeNull();
  expect(beforeGroupDrag[1]).not.toBeNull();
  if (beforeGroupDrag[0] && beforeGroupDrag[1]) {
    const dragTarget = page.locator('[data-sketch-node-id^="sketch_"]').first();
    const dragBox = await dragTarget.boundingBox();
    expect(dragBox).not.toBeNull();
    if (dragBox) {
      await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dragBox.x + dragBox.width / 2 + 32, dragBox.y + dragBox.height / 2 + 24);
      await page.mouse.up();
    }
  }
  await expect(toolbar.getByLabel("悬浮解组")).toBeVisible();
  const afterGroupDrag = await Promise.all(
    [0, 1].map(async (index) => page.locator('[data-sketch-node-id^="sketch_"]').nth(index).boundingBox()),
  );
  expect(afterGroupDrag[0]).not.toBeNull();
  expect(afterGroupDrag[1]).not.toBeNull();
  if (beforeGroupDrag[0] && beforeGroupDrag[1] && afterGroupDrag[0] && afterGroupDrag[1]) {
    const firstDelta = { x: afterGroupDrag[0].x - beforeGroupDrag[0].x, y: afterGroupDrag[0].y - beforeGroupDrag[0].y };
    const secondDelta = { x: afterGroupDrag[1].x - beforeGroupDrag[1].x, y: afterGroupDrag[1].y - beforeGroupDrag[1].y };
    expect(secondDelta.x).toBeCloseTo(firstDelta.x, 1);
    expect(secondDelta.y).toBeCloseTo(firstDelta.y, 1);
  }

  await page.locator("[data-sketch-stage]").click({ position: { x: 40, y: 40 } });
  await page.locator('[data-sketch-node-id^="sketch_"]').first().dblclick({ position: { x: 10, y: 10 } });
  await expect(page.getByLabel("画布文本编辑")).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.locator('[data-sketch-node-id^="sketch_"]').first().dblclick({ position: { x: 10, y: 10 } });
  await expect(page.getByLabel("画布文本编辑")).toBeVisible();
  await page.getByLabel("画布文本编辑").press("Escape");
});

test("embedded text shapes expose combined shape and text controls", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 220, y: 180 }, { x: 380, y: 280 });
  const rect = page.locator('[data-sketch-node-id^="sketch_"]').first();
  await rect.dblclick();
  const editor = page.getByLabel("画布文本编辑");
  await editor.fill("Shape label");
  await editor.press("Enter");

  await rect.click({ position: { x: 10, y: 10 } });
  const toolbar = page.getByRole("toolbar", { name: "图文工具栏" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByLabel("悬浮填充")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮描边")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮文字颜色")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮字号")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮加粗")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮斜体")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮下划线")).toBeVisible();
  await expect(toolbar.getByLabel("对齐方式")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮层级")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮更多")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮文本")).toHaveCount(0);
  const textColorIndicator = toolbar.getByTestId("sketch-text-color-indicator");
  await expect(textColorIndicator).toBeVisible();
  await expect(textColorIndicator).toHaveClass(/h-\[1\.4rem\]/);
  await expect(textColorIndicator).toHaveClass(/w-\[1\.2rem\]/);
  await expect(toolbar.getByTestId("sketch-text-color-underline")).toBeVisible();

  await toolbar.getByLabel("悬浮文字颜色").click();
  const textMenu = page.getByRole("menu", { name: "文字颜色" });
  await expect(textMenu).toBeVisible();
  await expectPresetColorGrid(textMenu, "文字颜色");
  await expect(textMenu.getByLabel(/无颜色/)).toHaveCount(0);
  await textMenu.getByLabel("文字颜色 #f59e0b").click();
  await toolbar.getByLabel("悬浮加粗").click();
  await expect(page.locator('[data-sketch-node-id^="sketch_"]').first()).toBeVisible();
});

test("whiteboard keeps zoom and inline text editing available without fixed side panels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "文本", exact: true }).click();
  await page.locator("[data-sketch-stage]").click({ position: { x: 260, y: 220 } });
  const editor = page.getByLabel("画布文本编辑");
  await expect(editor).not.toHaveAttribute("placeholder");
  await expect.poll(async () => editor.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    overflowX: getComputedStyle(element).overflowX,
    overflowY: getComputedStyle(element).overflowY,
    className: element.className,
  }))).toMatchObject({
    backgroundColor: "rgba(0, 0, 0, 0)",
    overflowX: "hidden",
    overflowY: "hidden",
  });
  await expect(editor).toHaveClass(/scrollbar-width:none/);
  await editor.fill("A simple idea");
  await editor.press("Enter");
  await expect(editor).toHaveValue("A simple idea\n");
  await page.getByRole("button", { name: "放大" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("A simple idea", { exact: true })).toBeVisible();
  const renderedText = page.locator('[data-sketch-node-id^="sketch_"]').first();
  await renderedText.dblclick();
  await expect(page.getByLabel("画布文本编辑")).toHaveValue("A simple idea\n");
  await page.getByLabel("画布文本编辑").press("Escape");
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
  await expect(toolbar.getByTestId("sketch-text-color-indicator")).toBeVisible();
  await expect(toolbar.getByTestId("sketch-text-color-underline")).toBeVisible();
  await expect(toolbar.getByLabel("对齐方式")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮层级")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮更多")).toBeVisible();
  await expect(toolbar.getByLabel("悬浮加粗")).not.toHaveAttribute("title");
  await toolbar.getByLabel("悬浮加粗").hover();
  await page.waitForTimeout(250);
  await expect(page.getByRole("tooltip", { name: "加粗", exact: true })).toBeVisible();

  await toolbar.getByLabel("打开字号选项").click();
  const sizeMenu = page.getByRole("menu", { name: "字号选项" });
  await expect(sizeMenu).toBeVisible();
  await expectMenuReceivesPointer(page, sizeMenu, "字号选项");
  await toolbar.getByLabel("打开字号选项").click();

  await toolbar.getByLabel("悬浮文字颜色").click();
  const colorMenu = page.getByRole("menu", { name: "文字颜色" });
  await expect(colorMenu).toBeVisible();
  await expectMenuReceivesPointer(page, colorMenu, "文字颜色");
  await expectPresetColorGrid(colorMenu, "文字颜色");
  await expect(colorMenu.getByLabel(/无颜色/)).toHaveCount(0);
  await toolbar.getByLabel("悬浮文字颜色").click();
  await expect(page.getByRole("menu", { name: "文字颜色" })).toHaveCount(0);
  await toolbar.getByLabel("悬浮文字颜色").click();
  await colorMenu.getByLabel("文字颜色 #f59e0b").click();

  await toolbar.getByLabel("对齐方式").click();
  const alignMenu = page.getByRole("menu", { name: "对齐方式" });
  await expectMenuReceivesPointer(page, alignMenu, "对齐方式");
  await alignMenu.getByLabel("对齐方式 居中对齐").click();

  await toolbar.getByLabel("悬浮层级").click();
  await expect(page.getByRole("menu", { name: "层级" })).toBeVisible();
  await toolbar.getByLabel("悬浮层级").click();
  await expect(page.getByRole("menu", { name: "层级" })).toHaveCount(0);
  await toolbar.getByLabel("悬浮层级").click();
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
  await page.locator("[data-sketch-stage]").hover({ position: { x: 40, y: 40 } });

  await expect(page.locator("[data-sketch-stage]")).toHaveScreenshot("whiteboard-bridge-scene.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixels: 120,
    threshold: 0.2,
  });
});
