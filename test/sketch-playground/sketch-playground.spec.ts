import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function dragOnStage(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { shift?: boolean } = {},
) {
  const stage = page.locator("[data-sketch-stage]");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (!stageBox) return;
  if (options.shift) await page.keyboard.down("Shift");
  await page.mouse.move(stageBox.x + from.x, stageBox.y + from.y);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + to.x, stageBox.y + to.y);
  await page.mouse.up();
  if (options.shift) await page.keyboard.up("Shift");
}

async function readScene(page: Page): Promise<{ nodes: Array<Record<string, unknown>> }> {
  const sceneJson = page.getByLabel("scene-json");
  const wasOpen = await sceneJson.isVisible().catch(() => false);
  if (!wasOpen) {
    await page.getByRole("button", { name: "Dev Data" }).click();
  }
  const value = await page.getByLabel("scene-json").inputValue();
  if (!wasOpen) {
    await page.getByRole("button", { name: "Close" }).click();
  }
  return JSON.parse(value) as { nodes: Array<Record<string, unknown>> };
}

async function attachSketchScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

function createLargeBenchmarkScene(count: number) {
  return {
    version: 1,
    pageSize: { width: 960, height: 640 },
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `perf-${index}`,
      type: index % 5 === 0 ? "text" : "card",
      x: 32 + (index % 10) * 88,
      y: 48 + Math.floor(index / 10) * 70,
      width: index % 5 === 0 ? 120 : 76,
      height: index % 5 === 0 ? 32 : 48,
      text: `N${index + 1}`,
      style: {
        fill: index % 2 ? "#f8fafc" : "#ffffff",
        stroke: "#94a3b8",
        color: "#0f172a",
        radius: 8,
      },
    })),
    assets: [],
    bindings: {},
  };
}

async function applySceneJson(page: Page, scene: unknown) {
  const sceneJson = page.getByLabel("scene-json");
  const wasOpen = await sceneJson.isVisible().catch(() => false);
  if (!wasOpen) await page.getByRole("button", { name: "Dev Data" }).click();
  await page.getByLabel("scene-json").evaluate((element, value) => {
    const textarea = element as HTMLTextAreaElement;
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }, JSON.stringify(scene));
  await page.getByRole("button", { name: "Apply Scene" }).click();
  await expect(page.getByText("Scene JSON applied")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
}

test("sketch playground edits and exports scene JSON", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByLabel("fixture")).toBeVisible();
  await expect(page.getByText("Drafts")).toHaveCount(0);
  await expect(page.getByText("Page 1")).toHaveCount(0);
  await page.getByLabel("fixture").selectOption("config-binding");
  await expect(page.getByText("Valid scene")).toBeVisible();

  await page.getByLabel("便签").click();
  await dragOnStage(page, { x: 300, y: 200 }, { x: 380, y: 250 });

  await page.getByPlaceholder("对象文本").fill("Playground card");
  await page.getByRole("button", { name: "Dev Data" }).click();
  await expect(page.getByLabel("scene-json")).toContainText("Playground card");

  await page.getByRole("button", { name: "Performance" }).click();
  await expect(page.getByRole("cell", { name: "100", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "500", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "1000", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "selection ms" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "property panel ms" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "hit test ms" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "drag ms" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "input ms" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "translate ms" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "path render ms" })).toBeVisible();
});

test("sketch playground records large document interaction performance baselines", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  const rows: Array<{ count: number; selectionMs: number; propertyPanelMs: number; dragMs: number; inputMs: number }> = [];

  for (const count of [100, 500, 1000]) {
    await applySceneJson(page, createLargeBenchmarkScene(count));
    const nodeLabel = page.locator('[data-sketch-node-label="perf-1"]');
    const node = page.locator('[data-sketch-node-id="perf-1"]');

    let start = Date.now();
    await nodeLabel.click();
    await expect(page.getByText("1 selected")).toBeVisible();
    const selectionMs = Date.now() - start;

    start = Date.now();
    await expect(page.getByRole("spinbutton", { name: "X" })).toBeVisible();
    await expect(page.getByPlaceholder("对象文本")).toBeVisible();
    const propertyPanelMs = Date.now() - start;

    const box = await node.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    start = Date.now();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const parsed = await readScene(page);
        const moved = parsed.nodes.find((item) => item.id === "perf-1");
        return moved ? `${moved.x},${moved.y}` : "";
      })
      .toBe("132,56");
    const dragMs = Date.now() - start;

    start = Date.now();
    await page.getByPlaceholder("对象文本").fill(`Benchmark ${count}`);
    await expect
      .poll(async () => {
        const parsed = await readScene(page);
        return parsed.nodes.find((item) => item.id === "perf-1")?.text ?? "";
      })
      .toBe(`Benchmark ${count}`);
    const inputMs = Date.now() - start;

    rows.push({ count, selectionMs, propertyPanelMs, dragMs, inputMs });
  }

  await test.info().attach("sketch-large-document-performance.json", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });

  for (const row of rows) {
    expect(row.selectionMs).toBeLessThan(1500);
    expect(row.propertyPanelMs).toBeLessThan(1500);
    expect(row.dragMs).toBeLessThan(2500);
    expect(row.inputMs).toBeLessThan(2500);
  }
});

test("sketch playground debug panel shows tool, selection, recent change, and object list", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Dev Data" }).click();
  await page.getByRole("button", { name: "Debug" }).click();
  await expect(page.getByText("tool", { exact: true })).toBeVisible();
  await expect(page.getByText("select", { exact: true })).toBeVisible();
  await expect(page.getByText("selection", { exact: true })).toBeVisible();
  await expect(page.getByText("draft state", { exact: true })).toBeVisible();
  await expect(page.getByText("idle", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "card" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Close" }).click();
  await page.getByLabel("矩形").click();
  await dragOnStage(page, { x: 280, y: 120 }, { x: 350, y: 180 });

  await page.getByRole("button", { name: "Dev Data" }).click();
  await page.getByRole("button", { name: "Debug" }).click();
  await expect(page.getByText(/added sketch_/)).toBeVisible();
  await expect(page.getByText("rect")).toBeVisible();
});

test("sketch playground captures editor state walkthrough screenshots", async ({ page }) => {
  await page.goto("/");

  await attachSketchScreenshot(page, "sketch-empty-selection");
  await page.locator('[data-sketch-node-label="card"]').click();
  await expect(page.getByText("1 selected")).toBeVisible();
  await attachSketchScreenshot(page, "sketch-single-selection-property-panel");

  await page.locator('[data-sketch-node-label="button"]').click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 selected")).toBeVisible();
  await attachSketchScreenshot(page, "sketch-multi-selection-layer-panel");

  await page.keyboard.press("Escape");
  await page.locator('[data-sketch-node-label="card"]').dispatchEvent("dblclick", { bubbles: true, cancelable: true });
  await expect(page.getByLabel("画布文本编辑")).toBeVisible();
  await attachSketchScreenshot(page, "sketch-inline-text-editing");
  await page.keyboard.press("Escape");

  await page.getByLabel("打开命令面板").click();
  await expect(page.getByLabel("草图命令面板")).toBeVisible();
  await attachSketchScreenshot(page, "sketch-command-palette");
});

test("sketch playground can create image nodes from the toolbar", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "图片" }).click();
  const stage = page.locator("[data-sketch-stage]");
  const fileChooserPromise = page.waitForEvent("filechooser");
  await stage.click({ position: { x: 300, y: 180 } });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: "playground-import.png",
    mimeType: "image/png",
    buffer: Buffer.from("playground image bytes"),
  });

  await page.getByRole("button", { name: "Dev Data" }).click();
  const sceneJson = page.getByLabel("scene-json");
  await expect(sceneJson).toContainText('"type": "image"');
  await expect(sceneJson).toContainText('"alt": "playground-import.png"');
  await expect(sceneJson).toContainText('"src": "data:image/png;base64');
});

test("sketch playground edits shape text inline and from properties", async ({ page }) => {
  await page.goto("/");

  const devDataButton = page.getByRole("button", { name: "Dev Data" });
  const readSceneJson = async () => {
    await devDataButton.click();
    const value = await page.getByLabel("scene-json").inputValue();
    await devDataButton.click();
    return value;
  };

  await page.getByRole("button", { name: "矩形" }).click();
  await dragOnStage(page, { x: 280, y: 120 }, { x: 390, y: 190 });

  const createdScene = JSON.parse(await readSceneJson()) as {
    nodes: Array<{ id: string; type: string; text?: string }>;
  };
  const rectNodeId = createdScene.nodes.find((node) => node.type === "rect" && !node.text)?.id;
  expect(rectNodeId).toBeTruthy();
  if (!rectNodeId) return;

  const rectBox = await page.locator(`[data-sketch-node-id="${rectNodeId}"]`).boundingBox();
  expect(rectBox).not.toBeNull();
  if (!rectBox) return;
  await page.locator("[data-sketch-stage]").dispatchEvent("dblclick", {
    bubbles: true,
    cancelable: true,
    clientX: rectBox.x + rectBox.width / 2,
    clientY: rectBox.y + rectBox.height / 2,
  });
  await page.getByLabel("画布文本编辑").fill("Inline shape label");
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as { nodes: Array<{ id: string; text?: string }> };
      return parsed.nodes.find((node) => node.id === rectNodeId)?.text ?? "";
    })
    .toBe("Inline shape label");

  await page.getByPlaceholder("对象文本").fill("Property shape label");
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as { nodes: Array<{ id: string; text?: string }> };
      return parsed.nodes.find((node) => node.id === rectNodeId)?.text ?? "";
    })
    .toBe("Property shape label");
});

test("sketch playground draws shift-constrained circles and text nodes", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("圆形").click();
  await dragOnStage(page, { x: 260, y: 110 }, { x: 340, y: 160 }, { shift: true });

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const ellipse = parsed.nodes.find((node) => node.type === "ellipse" && Number(node.width) > 20) as { width?: number; height?: number } | undefined;
      return ellipse ? `${ellipse.width},${ellipse.height}` : "";
    })
    .toBe("80,80");

  await page.getByLabel("text").click();
  const stage = page.locator("[data-sketch-stage]");
  await stage.click({ position: { x: 420, y: 180 } });
  await page.getByLabel("画布文本编辑").fill("Standalone text");
  await page.keyboard.press("Enter");

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      return parsed.nodes.some((node) => node.type === "text" && node.text === "Standalone text");
    })
    .toBe(true);
});

test("sketch playground restores dragged object position with undo", async ({ page }) => {
  await page.goto("/");

  const xInput = page.getByRole("spinbutton", { name: "X" });
  await expect(xInput).toHaveValue("120");

  const card = page.locator('[data-sketch-node-label="card"]');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2);
  await page.mouse.up();

  await expect.poll(async () => Number(await xInput.inputValue())).toBeGreaterThan(120);

  await page.getByLabel("撤销").click();
  await expect(xInput).toHaveValue("120");
});

test("sketch playground duplicates selected objects with Alt-drag and undo removes the copy", async ({ page }) => {
  await page.goto("/");

  const card = page.locator('[data-sketch-node-label="card"]');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 64, box.y + box.height / 2 + 28);
  await page.mouse.up();
  await page.keyboard.up("Alt");

  await page.getByRole("button", { name: "Dev Data" }).click();
  const sceneJson = page.getByLabel("scene-json");
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as {
        nodes: Array<{ id: string; text?: string; x?: number }>;
      };
      return parsed.nodes.filter((node) => node.text === "卡片标题").length;
    })
    .toBe(2);
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as {
        nodes: Array<{ id: string; text?: string; x?: number }>;
      };
      return parsed.nodes.find((node) => node.id === "card")?.x ?? 0;
    })
    .toBe(120);

  await page.getByLabel("撤销").click();
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "卡片标题").length;
    })
    .toBe(1);
});

test("sketch playground supports viewport, inline text, clipboard, undo, and redo flow", async ({ page }) => {
  await page.goto("/");

  const stage = page.locator("[data-sketch-stage]");
  await expect(stage).toBeVisible();

  await page.getByLabel("放大").click();
  await expect(page.getByLabel("重置缩放")).toContainText("115%");

  const card = page.locator('[data-sketch-node-id="card"]');
  await card.dispatchEvent("dblclick", { bubbles: true, cancelable: true });
  await page.getByLabel("画布文本编辑").fill("Inline playground card");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: "Dev Data" }).click();
  const sceneJson = page.getByLabel("scene-json");
  await expect(sceneJson).toContainText("Inline playground card");

  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+C`);
  await page.keyboard.press(`${modifier}+V`);

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "Inline playground card").length;
    })
    .toBe(2);

  await page.keyboard.press(`${modifier}+Z`);
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "Inline playground card").length;
    })
    .toBe(1);

  await page.keyboard.press(`${modifier}+Shift+Z`);
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "Inline playground card").length;
    })
    .toBe(2);
});

test("sketch playground pans with the hand tool without changing scene JSON", async ({ page }) => {
  await page.goto("/");

  const stage = page.locator("[data-sketch-stage]");
  await expect(stage).toBeVisible();
  const beforeScene = JSON.stringify(await readScene(page));
  const beforeTransform = await stage.evaluate((element) => (element as HTMLElement).style.transform);

  await page.getByLabel("抓手").click();
  await dragOnStage(page, { x: 220, y: 160 }, { x: 280, y: 210 });

  await expect
    .poll(async () => stage.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe(beforeTransform);
  expect(JSON.stringify(await readScene(page))).toBe(beforeScene);
});

test("sketch playground runs commands from the canvas context menu", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-sketch-node-id="card"]').dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 220,
    clientY: 220,
  });

  const menu = page.getByRole("menu", { name: "草图右键菜单" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "复制", exact: true }).click();

  await page.getByRole("button", { name: "Dev Data" }).click();
  const sceneJson = page.getByLabel("scene-json");
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "卡片标题").length;
    })
    .toBe(2);

  await page.getByLabel("撤销").click();
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await sceneJson.inputValue()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "卡片标题").length;
    })
    .toBe(1);
});

test("sketch playground runs commands from the layer context menu", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-sketch-layer-node-id="card"]').click({ button: "right" });
  const menu = page.getByRole("menu", { name: "草图图层菜单" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "复制" }).click();

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      return parsed.nodes.filter((node) => node.text === "卡片标题").length;
    })
    .toBe(2);

  await page.locator('[data-sketch-layer-node-id="card"]').click({ button: "right" });
  await page.getByRole("menu", { name: "草图图层菜单" }).getByRole("menuitem", { name: "删除" }).click();

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      return parsed.nodes.some((node) => node.id === "card");
    })
    .toBe(false);
});

test("sketch playground toggles layer lock and visibility from hover actions", async ({ page }) => {
  await page.goto("/");

  const cardLayer = page.locator('[data-sketch-layer-node-id="card"]');
  await cardLayer.hover();
  await page.getByLabel("锁定 卡片标题").click();

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const card = parsed.nodes.find((node) => node.id === "card") as { locked?: boolean } | undefined;
      return card?.locked ?? false;
    })
    .toBe(true);

  await cardLayer.hover();
  await page.getByLabel("隐藏 卡片标题").click();

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const card = parsed.nodes.find((node) => node.id === "card") as { visible?: boolean } | undefined;
      return card?.visible;
    })
    .toBe(false);
});

test("sketch playground supports marquee, shift selection, and escape clear", async ({ page }) => {
  await page.goto("/");

  const card = page.locator('[data-sketch-node-label="card"]');
  const button = page.locator('[data-sketch-node-label="button"]');
  const stage = page.locator("[data-sketch-stage]");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  if (!stageBox) return;

  await page.mouse.move(stageBox.x + 30, stageBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(stageBox.x + stageBox.width - 20, stageBox.y + stageBox.height - 20);
  await page.mouse.up();

  await expect(page.getByText("2 selected")).toBeVisible();

  await card.click({ modifiers: ["Shift"] });
  await expect(page.getByText("1 selected")).toBeVisible();

  await card.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 selected")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("No selection")).toBeVisible();
});

test("sketch playground draws pencil paths and erases editable objects", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("画笔").click();
  await dragOnStage(page, { x: 260, y: 120 }, { x: 340, y: 170 });

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const path = parsed.nodes.find((node) => node.type === "path") as { points?: unknown[] } | undefined;
      return path?.points?.length ?? 0;
    })
    .toBeGreaterThan(1);
  const sceneWithPath = await readScene(page);
  const pathNode = sceneWithPath.nodes.find((node) => node.type === "path") as { id?: string } | undefined;
  expect(pathNode?.id).toBeTruthy();
  if (!pathNode?.id) return;

  await page.getByLabel("橡皮").click();
  const pathBox = await page.locator(`[data-sketch-node-id="${pathNode.id}"]`).boundingBox();
  expect(pathBox).not.toBeNull();
  if (!pathBox) return;
  await page.mouse.move(pathBox.x + pathBox.width / 2, pathBox.y + pathBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pathBox.x + pathBox.width / 2 + 8, pathBox.y + pathBox.height / 2 + 8);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      return parsed.nodes.some((node) => node.type === "path");
    })
    .toBe(false);

  await page.getByLabel("撤销").click();
  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      return parsed.nodes.some((node) => node.type === "path");
    })
    .toBe(true);
});

test("sketch playground draws lines and edits line endpoints", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("线条").click();
  await dragOnStage(page, { x: 260, y: 130 }, { x: 360, y: 130 }, { shift: true });

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const line = parsed.nodes.find((node) => node.type === "line" && Number(node.width) > 50) as { id?: string } | undefined;
      return line?.id ?? "";
    })
    .not.toBe("");

  const sceneAfterLine = await readScene(page);
  const lineNode = sceneAfterLine.nodes.find((node) => node.type === "line" && Number(node.width) > 50) as { id: string; width: number; height: number };
  expect(lineNode).toBeTruthy();

  await page.locator(`[data-sketch-layer-node-id="${lineNode.id}"] button`).first().click();
  const endHandle = page.getByTestId("sketch-resize-handle");
  const endHandleBox = await endHandle.boundingBox();
  expect(endHandleBox).not.toBeNull();
  if (!endHandleBox) return;

  await page.mouse.move(endHandleBox.x + endHandleBox.width / 2, endHandleBox.y + endHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endHandleBox.x + endHandleBox.width / 2 + 30, endHandleBox.y + endHandleBox.height / 2 + 40);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const updated = parsed.nodes.find((node) => node.id === lineNode.id) as { width?: number; height?: number } | undefined;
      return `${updated?.width ?? 0},${updated?.height ?? 0}`;
    })
    .not.toBe(`${lineNode.width},${lineNode.height}`);
});

test("sketch playground draws arrows and edits arrow heads", async ({ page }) => {
  await page.goto("/");

  await page.getByLabel("箭头").click();
  await dragOnStage(page, { x: 260, y: 190 }, { x: 370, y: 230 });

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const arrow = parsed.nodes.find((node) => node.type === "arrow" && Number(node.width) > 50) as { id?: string } | undefined;
      return arrow?.id ?? "";
    })
    .not.toBe("");

  const sceneAfterArrow = await readScene(page);
  const arrowNode = sceneAfterArrow.nodes.find((node) => node.type === "arrow" && Number(node.width) > 50) as { id: string };
  expect(arrowNode).toBeTruthy();

  await page.locator(`[data-sketch-layer-node-id="${arrowNode.id}"] button`).first().click();
  await page.getByLabel("起点箭头").selectOption("arrow");
  await page.getByLabel("终点箭头").selectOption("none");

  await expect
    .poll(async () => {
      const parsed = await readScene(page);
      const updated = parsed.nodes.find((node) => node.id === arrowNode.id) as { style?: { startArrow?: string; endArrow?: string } } | undefined;
      return `${updated?.style?.startArrow ?? ""},${updated?.style?.endArrow ?? ""}`;
    })
    .toBe("arrow,none");
});

test("sketch playground completes the P0 editing acceptance flow", async ({ page }) => {
  await page.goto("/");

  const stage = page.locator("[data-sketch-stage]");
  await expect(stage).toBeVisible();

  await page.getByLabel("放大").click();
  await expect(page.getByLabel("重置缩放")).toContainText("115%");

  await page.getByLabel("便签").click();
  await dragOnStage(page, { x: 240, y: 140 }, { x: 340, y: 210 });
  await page.getByPlaceholder("对象文本").fill("P0 flow note");
  const devDataButton = page.getByRole("button", { name: "Dev Data" });
  const readSceneJson = async () => {
    await devDataButton.click();
    const value = await page.getByLabel("scene-json").inputValue();
    await devDataButton.click();
    return value;
  };

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as {
        nodes: Array<{ id: string; type: string; text?: string }>;
      };
      return parsed.nodes.find((node) => node.type === "sticky" && node.text === "P0 flow note")?.id ?? "";
    })
    .not.toBe("");
  const createdScene = JSON.parse(await readSceneJson()) as {
    nodes: Array<{ id: string; type: string; text?: string; x?: number; y?: number }>;
  };
  const createdNodeId = createdScene.nodes.find((node) => node.type === "sticky" && node.text === "P0 flow note")?.id;
  expect(createdNodeId).toBeTruthy();
  if (!createdNodeId) return;

  const createdNode = page.locator(`[data-sketch-node-id="${createdNodeId}"]`);
  const createdNodeLabel = page.locator(`[data-sketch-node-label="${createdNodeId}"]`);
  const buttonNode = page.locator('[data-sketch-node-label="button"]');
  await createdNodeLabel.click();
  await expect(page.getByRole("toolbar", { name: "草图悬浮快捷工具条" })).toBeVisible();
  await expect(page.getByLabel("悬浮更多")).toBeVisible();

  const createdLayerRow = page.locator(`[data-sketch-layer-node-id="${createdNodeId}"]`);
  await createdLayerRow.dblclick();
  const renameInput = page.getByLabel(/重命名图层/);
  await expect(renameInput).toBeVisible();
  await renameInput.fill("P0 renamed layer");
  await renameInput.press("Enter");
  await expect(createdLayerRow).toContainText("P0 renamed layer");

  await createdNodeLabel.click({ button: "right" });
  const exportMenu = page.getByRole("menu", { name: "草图右键菜单" });
  await expect(exportMenu.getByRole("menuitem", { name: "复制 SVG" })).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: "复制 PNG" })).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: "导出选区" })).toBeVisible();
  await exportMenu.getByRole("menuitem", { name: "导出选区" }).click();
  await expect(exportMenu).toBeHidden();

  await createdNodeLabel.click();
  await buttonNode.click({ modifiers: ["Shift"] });
  await expect(page.getByText("2 selected")).toBeVisible();

  const selectedNodeBox = await createdNode.boundingBox();
  expect(selectedNodeBox).not.toBeNull();
  if (!selectedNodeBox) return;
  const beforeDragScene = JSON.parse(await readSceneJson()) as {
    nodes: Array<{ id: string; x: number; y: number }>;
  };
  const beforeDragNode = beforeDragScene.nodes.find((node) => node.id === createdNodeId);
  expect(beforeDragNode).toBeTruthy();
  if (!beforeDragNode) return;

  await page.mouse.move(selectedNodeBox.x + selectedNodeBox.width / 2, selectedNodeBox.y + selectedNodeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(selectedNodeBox.x + selectedNodeBox.width / 2 + 36, selectedNodeBox.y + selectedNodeBox.height / 2 + 18);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as {
        nodes: Array<{ id: string; x: number; y: number }>;
      };
      const node = parsed.nodes.find((item) => item.id === createdNodeId);
      return node ? `${node.x},${node.y}` : "";
    })
    .not.toBe(`${beforeDragNode.x},${beforeDragNode.y}`);

  await page.keyboard.press("Escape");
  await expect(page.getByText("No selection")).toBeVisible();
  await createdNodeLabel.click();
  await expect(page.getByText("1 selected")).toBeVisible();

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as {
        nodes: Array<{ id: string; width: number; height: number }>;
      };
      const node = parsed.nodes.find((item) => item.id === createdNodeId);
      return node ? `${node.width},${node.height}` : "";
    })
    .not.toBe("");
  const beforeResizeScene = JSON.parse(await readSceneJson()) as {
    nodes: Array<{ id: string; width: number; height: number }>;
  };
  const beforeResize = beforeResizeScene.nodes.find((node) => node.id === createdNodeId);
  expect(beforeResize).toBeTruthy();
  if (!beforeResize) return;

  const resizeHandle = page.getByTestId("sketch-resize-handle");
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).not.toBeNull();
  if (!resizeBox) return;

  await page.keyboard.down("Shift");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 64, resizeBox.y + resizeBox.height / 2 + 12);
  await page.mouse.up();
  await page.keyboard.up("Shift");

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as {
        nodes: Array<{ id: string; width: number; height: number }>;
      };
      const node = parsed.nodes.find((item) => item.id === createdNodeId);
      if (!node) return false;
      const beforeRatio = beforeResize.width / beforeResize.height;
      const afterRatio = node.width / node.height;
      return node.width > beforeResize.width && Math.abs(afterRatio - beforeRatio) < 0.02;
    })
    .toBe(true);

  const rotateHandle = page.getByTestId("sketch-rotate-handle");
  const rotateBox = await rotateHandle.boundingBox();
  expect(rotateBox).not.toBeNull();
  if (!rotateBox) return;

  await page.mouse.move(rotateBox.x + rotateBox.width / 2, rotateBox.y + rotateBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rotateBox.x + rotateBox.width / 2 + 80, rotateBox.y + rotateBox.height / 2 + 70);
  await page.mouse.up();

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as {
        nodes: Array<{ id: string; rotation?: number }>;
      };
      return parsed.nodes.find((node) => node.id === createdNodeId)?.rotation ?? 0;
    })
    .not.toBe(0);

  await page.getByRole("spinbutton", { name: "旋转" }).fill("15");
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as {
        nodes: Array<{ id: string; rotation?: number }>;
      };
      return parsed.nodes.find((node) => node.id === createdNodeId)?.rotation ?? 0;
    })
    .toBe(15);

  await createdNodeLabel.dispatchEvent("dblclick", { bubbles: true, cancelable: true });
  await page.getByLabel("画布文本编辑").fill("P0 flow edited");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.some((node) => node.text === "P0 flow edited");
    })
    .toBe(true);

  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+C`);
  await page.keyboard.press(`${modifier}+V`);

  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "P0 flow edited").length;
    })
    .toBe(2);

  await page.keyboard.press(`${modifier}+Z`);
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "P0 flow edited").length;
    })
    .toBe(1);

  await page.keyboard.press(`${modifier}+Shift+Z`);
  await expect
    .poll(async () => {
      const parsed = JSON.parse(await readSceneJson()) as { nodes: Array<{ text?: string }> };
      return parsed.nodes.filter((node) => node.text === "P0 flow edited").length;
    })
    .toBe(2);
});
