import { expect, test, type Page } from "@playwright/test";
import {
  createOpenPencilCommandMessage,
  createOpenPencilLoadDocumentMessage,
} from "../../packages/shared/src/openpencil-adapter";
import type {
  OpenPencilDirtyStateMessage,
  OpenPencilErrorMessage,
  OpenPencilHostCommand,
  OpenPencilTextSelectionRange,
  OpenPencilUiStateMessage,
} from "../../packages/shared/src/openpencil-adapter";
import {
  applySketchScenePatchOperations,
  type SketchSceneDocument,
} from "../../packages/shared/src/demo/sketch-scene";

type OpenPencilDebugNode = {
  id: string;
  name: string;
  type: string;
  parentId: string;
  hasVectorNetwork: boolean;
  hasImageFill: boolean;
  imageFillHash?: string;
  imageBytesAvailable: boolean;
  childCount: number;
};

type OpenPencilDebugState = {
  pageId?: string;
  layerCount: number;
  selectedNames: string[];
  selectedTextSelectionRange?: OpenPencilTextSelectionRange | null;
  commands: {
    duplicateSelection: boolean;
    deleteSelection: boolean;
    groupSelection: boolean;
    ungroupSelection: boolean;
    zoomToSelection: boolean;
    undo: boolean;
    redo: boolean;
  };
  openPencilNodes: OpenPencilDebugNode[];
  exportedScene?: SketchSceneDocument | null;
  lastPatchOperationCount?: number | null;
  lastPatchStatus?: string | null;
  viewport?: {
    width: number;
    height: number;
    panX: number;
    panY: number;
    zoom: number;
    pageFrame: {
      x: number;
      y: number;
      width: number;
      height: number;
      screenLeft: number;
      screenTop: number;
      screenRight: number;
      screenBottom: number;
    } | null;
  };
};

const INLINE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
const UPDATED_INLINE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lEFN5wAAAABJRU5ErkJggg==";
const INLINE_PNG_BYTES = Buffer.from(INLINE_PNG.split(",")[1], "base64");

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("favicon.ico")) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  await page.goto("/");
  await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_DIRTY_MESSAGES__?: OpenPencilDirtyStateMessage[];
      __OPENPENCIL_ERROR_MESSAGES__?: OpenPencilErrorMessage[];
      __OPENPENCIL_UI_STATE_MESSAGES__?: OpenPencilUiStateMessage[];
    };
    scope.__OPENPENCIL_DIRTY_MESSAGES__ = [];
    scope.__OPENPENCIL_ERROR_MESSAGES__ = [];
    scope.__OPENPENCIL_UI_STATE_MESSAGES__ = [];
    window.addEventListener("message", (event: MessageEvent<OpenPencilDirtyStateMessage>) => {
      if (event.data?.type !== "openpencil-spike/dirty-state") return;
      scope.__OPENPENCIL_DIRTY_MESSAGES__?.push(event.data);
    });
    window.addEventListener("message", (event: MessageEvent<OpenPencilErrorMessage>) => {
      if (event.data?.type !== "openpencil-spike/error") return;
      scope.__OPENPENCIL_ERROR_MESSAGES__?.push(event.data);
    });
    window.addEventListener("message", (event: MessageEvent<OpenPencilUiStateMessage>) => {
      if (event.data?.type !== "openpencil-spike/ui-state") return;
      scope.__OPENPENCIL_UI_STATE_MESSAGES__?.push(event.data);
    });
  });

  await test.step("assert no startup console errors", async () => {
    await page.waitForTimeout(200);
    expect(consoleErrors).toEqual([]);
  });
});

test("reports resource errors with a visible editor error state", async ({ page }) => {
  await page.evaluate(() => {
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "CanvasKit wasm served with invalid MIME type",
      }),
    );
  });

  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_ERROR_MESSAGES__?: OpenPencilErrorMessage[];
    };
    return Boolean(scope.__OPENPENCIL_ERROR_MESSAGES__?.at(-1));
  });

  const latest = await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_ERROR_MESSAGES__?: OpenPencilErrorMessage[];
    };
    return scope.__OPENPENCIL_ERROR_MESSAGES__?.at(-1);
  });

  expect(latest?.error).toMatchObject({
    code: "resource-load-failed",
    message: "CanvasKit wasm served with invalid MIME type",
    recoverable: true,
  });
  await expect(page.getByRole("alert")).toContainText("手绘编辑器加载失败");
  await expect(page.getByRole("alert")).toContainText("CanvasKit wasm served with invalid MIME type");
});

test("hydrates remote images through the host image proxy", async ({ page }) => {
  const remoteImageUrl = "https://cdn.example.test/openpencil/remote.png";
  let proxiedUrl: string | null = null;
  await page.route("**/__test-openpencil-image-proxy?**", async (route) => {
    const requestUrl = new URL(route.request().url());
    proxiedUrl = requestUrl.searchParams.get("url");
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: INLINE_PNG_BYTES,
    });
  });

  const scene: SketchSceneDocument = {
    version: 1,
    pageSize: { width: 640, height: 420 },
    nodes: [
      {
        id: "remote-photo",
        type: "image",
        name: "Remote photo",
        x: 120,
        y: 96,
        width: 180,
        height: 120,
        src: remoteImageUrl,
        alt: "Remote image",
      },
    ],
  };

  const debug = await loadSketchScene(page, "remote_image_proxy_page", scene, {
    imageProxyUrl: "http://127.0.0.1:3410/__test-openpencil-image-proxy",
    expectedImageNodeName: "Remote photo",
  });

  expect(proxiedUrl).toBe(remoteImageUrl);
  expect(debug.openPencilNodes.find((node) => node.name === "Remote photo")).toMatchObject({
    hasImageFill: true,
    imageBytesAvailable: true,
  });
  expect(debug.exportedScene?.nodes.find((node) => node.id === "remote-photo")).toMatchObject({
    src: remoteImageUrl,
    alt: "Remote image",
  });
});

test("fits the imported page frame into the viewport on first load", async ({ page }) => {
  const scene: SketchSceneDocument = {
    version: 1,
    pageSize: { width: 1440, height: 960 },
    nodes: [
      {
        id: "wide-card",
        type: "card",
        name: "Wide card",
        x: 80,
        y: 72,
        width: 1180,
        height: 720,
        text: "Large handdraw page",
        style: { fill: "#f8fafc", stroke: "#64748b" },
        visible: true,
      },
    ],
  };

  const debug = await loadSketchScene(page, "fit_regression_page", scene, {
    expectedImageNodeName: null,
  });
  const viewport = debug.viewport;

  expect(viewport?.pageFrame).not.toBeNull();
  expect(viewport?.zoom).toBeGreaterThan(0);
  expect(viewport?.zoom).toBeLessThan(1);
  expect(viewport?.pageFrame?.screenLeft).toBeGreaterThanOrEqual(0);
  expect(viewport?.pageFrame?.screenTop).toBeGreaterThanOrEqual(0);
  expect(viewport?.pageFrame?.screenRight).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(viewport?.pageFrame?.screenBottom).toBeLessThanOrEqual(viewport?.height ?? 0);
});

test("creates a rectangle through real canvas input and emits a replayable patch", async ({ page }) => {
  const scene: SketchSceneDocument = {
    version: 1,
    pageSize: { width: 640, height: 420 },
    nodes: [
      {
        id: "seed-card",
        type: "card",
        name: "Seed card",
        x: 32,
        y: 32,
        width: 120,
        height: 72,
        text: "Seed",
        style: { fill: "#f8fafc", stroke: "#94a3b8" },
      },
    ],
  };

  const debug = await loadSketchScene(page, "canvas_rectangle_input_page", scene, {
    expectedImageNodeName: null,
  });
  const beforeCount = debug.exportedScene?.nodes.length ?? 0;
  await resetDirtyMessages(page);

  await page.getByRole("button", { name: "Rectangle" }).click();
  const canvasBox = await page.locator("canvas.canvas-surface").boundingBox();
  expect(canvasBox).not.toBeNull();
  const pageFrame = (await getOpenPencilDebug(page)).viewport?.pageFrame;
  expect(pageFrame).not.toBeNull();
  if (!canvasBox || !pageFrame) return;

  const startX = canvasBox.x + pageFrame.screenLeft + 180;
  const startY = canvasBox.y + pageFrame.screenTop + 120;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY + 88, { steps: 8 });
  await page.mouse.up();

  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return (
      Array.isArray(nodes) &&
      nodes.length === expectedCount &&
      nodes.some(
        (node) =>
          node.id !== "seed-card" &&
          node.type === "rect" &&
          node.width >= 80 &&
          node.height >= 50,
      )
    );
  }, beforeCount + 1);

  const dirty = await waitForDirtyPatch(page);
  await expectDirtyPatchReplays(page, scene, dirty);
  const exported = (await getOpenPencilDebug(page)).exportedScene;
  const rectangle = exported?.nodes.find((node) => node.id !== "seed-card");
  expect(rectangle).toMatchObject({
    type: "rect",
    name: "Rectangle",
  });
  expect(rectangle?.x).toBeGreaterThan(0);
  expect(rectangle?.y).toBeGreaterThan(0);
});

test("round-trips group image path and protocol fields", async ({ page }) => {
  const scene: SketchSceneDocument = {
    version: 1,
    pageSize: { width: 960, height: 640 },
    assets: [
      {
        id: "asset-logo",
        type: "image",
        src: INLINE_PNG,
        width: 1,
        height: 1,
        alt: "Logo asset",
      },
    ],
    bindings: { headline: "Bound title" },
    metadata: { source: "openpencil-regression" },
    nodes: [
      {
        id: "hero-group",
        type: "group",
        name: "Hero group",
        x: 80,
        y: 70,
        width: 420,
        height: 180,
        visible: false,
        children: ["hero-card", "hero-title"],
        metadata: { role: "container" },
      },
      {
        id: "hero-card",
        type: "card",
        name: "Hero card",
        x: 100,
        y: 100,
        width: 360,
        height: 140,
        text: "Card text",
        style: { fill: "#f8fafc", stroke: "#94a3b8" },
        bindings: { fill: "cardFill", stroke: "cardStroke" },
        metadata: { component: "summary-card" },
      },
      {
        id: "hero-title",
        type: "text",
        name: "Hero title",
        x: 128,
        y: 126,
        width: 240,
        height: 42,
        text: "Fallback title",
        style: { color: "#111827", fontSize: 24, fontWeight: 700 },
        textStyleRuns: [
          {
            start: 0,
            length: 8,
            style: {
              color: "#2563eb",
              fontSize: 28,
              fontWeight: 800,
              fontFamily: "Inter",
              italic: true,
              textDecoration: "underline",
              lineHeight: 32,
              letterSpacing: 0.5,
            },
          },
          {
            start: 9,
            length: 5,
            style: {
              color: "#dc2626",
              textDecoration: "line-through",
            },
          },
        ],
        bindings: { text: "headline", color: "titleColor", visible: "showTitle" },
        metadata: { role: "title" },
      },
      {
        id: "photo-1",
        type: "image",
        name: "Inline photo",
        x: 540,
        y: 90,
        width: 180,
        height: 120,
        src: INLINE_PNG,
        alt: "Inline png",
      },
      {
        id: "curve-1",
        type: "path",
        name: "Vector curve",
        x: 540,
        y: 260,
        width: 240,
        height: 120,
        path: "M0 60 C60 0 120 120 240 60",
        points: [
          { x: 0, y: 60 },
          { x: 120, y: 120 },
          { x: 240, y: 60 },
        ],
        style: { stroke: "#dc2626", strokeWidth: 4, fill: "#fee2e2" },
      },
    ],
  };

  const debug = await loadSketchScene(page, "mapping_regression_page", scene);
  const exported = debug.exportedScene;
  expect(exported).not.toBeNull();
  if (!exported) return;

  expect(exported.assets).toEqual(scene.assets);
  expect(exported.bindings).toEqual(scene.bindings);
  expect(exported.metadata).toEqual(scene.metadata);

  const group = exported.nodes.find((node) => node.id === "hero-group");
  expect(group?.type).toBe("group");
  expect(group?.children).toEqual(["hero-card", "hero-title"]);
  expect(group?.metadata).toEqual({ role: "container" });

  const card = exported.nodes.find((node) => node.id === "hero-card");
  expect(card).toMatchObject({
    type: "card",
    text: "Card text",
    bindings: { fill: "cardFill", stroke: "cardStroke" },
    metadata: { component: "summary-card" },
  });

  const title = exported.nodes.find((node) => node.id === "hero-title");
  expect(title).toMatchObject({
    type: "text",
    text: "Fallback title",
    textStyleRuns: [
      {
        start: 0,
        length: 8,
        style: {
          color: "#2563eb",
          fontSize: 28,
          fontWeight: 800,
          fontFamily: "Inter",
          italic: true,
          textDecoration: "underline",
          lineHeight: 32,
          letterSpacing: 0.5,
        },
      },
      {
        start: 9,
        length: 5,
        style: {
          color: "#dc2626",
          textDecoration: "line-through",
        },
      },
    ],
    bindings: { text: "headline", color: "titleColor", visible: "showTitle" },
    metadata: { role: "title" },
  });

  const image = exported.nodes.find((node) => node.id === "photo-1");
  expect(image).toMatchObject({
    type: "image",
    src: INLINE_PNG,
    alt: "Inline png",
  });
  expect(image?.style?.fill).toBeUndefined();
  const openPencilImage = debug.openPencilNodes.find((node) => node.name === "Inline photo");
  expect(openPencilImage).toMatchObject({
    type: "RECTANGLE",
    hasImageFill: true,
    imageBytesAvailable: true,
  });

  expect(openPencilImage?.id).toBeTruthy();
  await resetDirtyMessages(page);
  await sendHostCommand(page, "mapping_regression_page", {
    type: "update-node",
    nodeId: openPencilImage?.id ?? "",
    changes: {
      src: UPDATED_INLINE_PNG,
      alt: "Updated inline png",
    },
  });
  await page.waitForFunction((updatedSrc) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const debugState = scope.__OPENPENCIL_SPIKE_DEBUG__?.();
    const imageNode = debugState?.exportedScene?.nodes.find((node) => node.id === "photo-1");
    const openPencilNode = debugState?.openPencilNodes.find((node) => node.name === "Inline photo");
    return (
      imageNode?.src === updatedSrc &&
      imageNode.alt === "Updated inline png" &&
      openPencilNode?.hasImageFill === true &&
      openPencilNode.imageBytesAvailable === true
    );
  }, UPDATED_INLINE_PNG);
  await expectDirtyPatchReplays(page, scene, await waitForDirtyPatch(page));

  const path = exported.nodes.find((node) => node.id === "curve-1");
  expect(path).toMatchObject({
    type: "path",
    path: "M0 60 C60 0 120 120 240 60",
    points: [
      { x: 0, y: 60 },
      { x: 120, y: 120 },
      { x: 240, y: 60 },
    ],
  });
  const openPencilPath = debug.openPencilNodes.find((node) => node.name === "Vector curve");
  expect(openPencilPath).toMatchObject({
    type: "VECTOR",
    hasVectorNetwork: true,
  });

  const openPencilCard = debug.openPencilNodes.find((node) => node.name === "Hero card");
  expect(openPencilCard?.id).toBeTruthy();
  await resetDirtyMessages(page);
  await sendHostCommand(page, "mapping_regression_page", {
    type: "update-node",
    nodeId: openPencilCard?.id ?? "",
    changes: {
      fill: "#22c55e",
      stroke: "#111827",
      strokeWidth: 3,
      opacity: 0.65,
      x: 144,
      y: 118,
      width: 320,
      height: 132,
      rotation: 12,
      bindings: { fill: "updatedCardFill", visible: "showHeroCard" },
    },
  });

  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const card = scope
      .__OPENPENCIL_SPIKE_DEBUG__?.()
      .exportedScene?.nodes.find((node) => node.id === "hero-card");
    return (
      card?.style?.fill === "#22c55e" &&
      card.style.stroke === "#111827" &&
      card.style.strokeWidth === 3 &&
      card.style.opacity === 0.65 &&
      card.x === 144 &&
      card.y === 118 &&
      card.width === 320 &&
      card.height === 132 &&
      card.rotation === 12 &&
      card.bindings?.fill === "updatedCardFill" &&
      card.bindings?.visible === "showHeroCard" &&
      card.bindings?.stroke === undefined
    );
  });
  await expectDirtyPatchReplays(page, scene, await waitForDirtyPatch(page));

  await sendHostCommand(page, "mapping_regression_page", {
    type: "select-node",
    nodeId: openPencilCard?.id ?? "",
  });
  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    return scope.__OPENPENCIL_SPIKE_DEBUG__?.().selectedNames.includes("Hero card");
  });
  expect((await getOpenPencilDebug(page)).commands).toMatchObject({
    duplicateSelection: true,
    deleteSelection: true,
    groupSelection: false,
    ungroupSelection: false,
    zoomToSelection: true,
    redo: false,
  });

  const nodeCountBeforeDuplicate = await exportedNodeCount(page);
  await sendHostCommand(page, "mapping_regression_page", {
    type: "duplicate-selection",
  });
  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return Array.isArray(nodes) && nodes.length === expectedCount;
  }, nodeCountBeforeDuplicate + 1);
  expect((await getOpenPencilDebug(page)).commands).toMatchObject({
    undo: true,
    redo: false,
  });

  await sendHostCommand(page, "mapping_regression_page", { type: "zoom-to-selection" });
  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    return scope.__OPENPENCIL_SPIKE_DEBUG__?.().commands.zoomToSelection === true;
  });
  expect(await exportedNodeCount(page)).toBe(nodeCountBeforeDuplicate + 1);

  await sendHostCommand(page, "mapping_regression_page", { type: "undo" });
  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return Array.isArray(nodes) && nodes.length === expectedCount;
  }, nodeCountBeforeDuplicate);
  expect((await getOpenPencilDebug(page)).commands).toMatchObject({
    redo: true,
  });

  await sendHostCommand(page, "mapping_regression_page", { type: "redo" });
  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return Array.isArray(nodes) && nodes.length === expectedCount;
  }, nodeCountBeforeDuplicate + 1);
  expect((await getOpenPencilDebug(page)).commands).toMatchObject({
    undo: true,
    redo: false,
  });

  await sendHostCommand(page, "mapping_regression_page", {
    type: "delete-selection",
  });
  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return (
      Array.isArray(nodes) &&
      nodes.length === expectedCount &&
      nodes.some((node) => node.id === "hero-card") &&
      !nodes.some((node) => node.id.endsWith("-copy-1"))
    );
  }, nodeCountBeforeDuplicate);

  expect(openPencilPath?.id).toBeTruthy();
  await sendHostCommand(page, "mapping_regression_page", {
    type: "select-nodes",
    nodeIds: [openPencilImage?.id ?? "", openPencilPath?.id ?? ""],
  });
  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const names = scope.__OPENPENCIL_SPIKE_DEBUG__?.().selectedNames ?? [];
    return names.includes("Inline photo") && names.includes("Vector curve");
  });
  expect((await getOpenPencilDebug(page)).commands).toMatchObject({
    duplicateSelection: true,
    deleteSelection: true,
    groupSelection: true,
    ungroupSelection: false,
    zoomToSelection: true,
  });

  const nodeCountBeforeGroup = await exportedNodeCount(page);
  await sendHostCommand(page, "mapping_regression_page", { type: "group-selection" });
  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return (
      Array.isArray(nodes) &&
      nodes.length === expectedCount &&
      nodes.some(
        (node) =>
          node.type === "group" &&
          (node.children ?? []).includes("photo-1") &&
          (node.children ?? []).includes("curve-1"),
      )
    );
  }, nodeCountBeforeGroup + 1);
  expect((await getOpenPencilDebug(page)).commands).toMatchObject({
    groupSelection: false,
    ungroupSelection: true,
  });

  await sendHostCommand(page, "mapping_regression_page", { type: "ungroup-selection" });
  await page.waitForFunction((expectedCount) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    return (
      Array.isArray(nodes) &&
      nodes.length === expectedCount &&
      nodes.some((node) => node.id === "photo-1") &&
      nodes.some((node) => node.id === "curve-1") &&
      !nodes.some(
        (node) =>
          node.type === "group" &&
          (node.children ?? []).includes("photo-1") &&
          (node.children ?? []).includes("curve-1"),
      )
    );
  }, nodeCountBeforeGroup);

  const openPencilTitle = debug.openPencilNodes.find((node) => node.name === "Hero title");
  expect(openPencilTitle?.id).toBeTruthy();
  await selectDebugTextWord(page, "Hero title", 1);
  const canvasTextRange = await waitForCanvasTextSelectionRange(page);
  expect(canvasTextRange).toEqual({
    start: 0,
    end: 8,
    source: "canvas",
  });
  expect((await getOpenPencilDebug(page)).selectedTextSelectionRange).toEqual(canvasTextRange);
  await overrideDebugTextSelectionRange(page, {
    cursor: 6,
    selectionAnchor: 11,
  });
  const objectShapeCanvasTextRange = await waitForCanvasTextSelectionRange(page, {
    start: 6,
    end: 11,
  });
  expect(objectShapeCanvasTextRange).toEqual({
    start: 6,
    end: 11,
    source: "canvas",
  });

  await sendHostCommand(page, "mapping_regression_page", {
    type: "update-node",
    nodeId: openPencilTitle?.id ?? "",
    changes: {
      text: "Edited host title",
      fill: "#ef4444",
    },
  });

  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const title = scope
      .__OPENPENCIL_SPIKE_DEBUG__?.()
      .exportedScene?.nodes.find((node) => node.id === "hero-title");
    return title?.text === "Edited host title" && title.style?.color === "#ef4444";
  });
});

async function selectDebugTextWord(
  page: Page,
  nodeNameOrId: string,
  characterIndex: number,
): Promise<void> {
  const selected = await page.evaluate(
    ({ nodeNameOrId: nameOrId, characterIndex: index }) => {
      const scope = globalThis as typeof globalThis & {
        __OPENPENCIL_SPIKE_DEBUG_SELECT_TEXT_WORD__?: (
          nodeNameOrId: string,
          characterIndex: number,
        ) => boolean;
      };
      return scope.__OPENPENCIL_SPIKE_DEBUG_SELECT_TEXT_WORD__?.(nameOrId, index) ?? false;
    },
    { nodeNameOrId, characterIndex },
  );
  expect(selected).toBe(true);
}

async function waitForCanvasTextSelectionRange(
  page: Page,
  expectedRange?: Pick<OpenPencilTextSelectionRange, "start" | "end">,
): Promise<OpenPencilTextSelectionRange> {
  await page.waitForFunction((expected) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_UI_STATE_MESSAGES__?: OpenPencilUiStateMessage[];
    };
    const latest = scope.__OPENPENCIL_UI_STATE_MESSAGES__?.at(-1);
    const range = latest?.state.inspector.selectedNode?.textSelectionRange;
    if (range?.source !== "canvas") return false;
    if (!expected) return true;
    return range.start === expected.start && range.end === expected.end;
  }, expectedRange ?? null);
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_UI_STATE_MESSAGES__?: OpenPencilUiStateMessage[];
    };
    const range =
      scope.__OPENPENCIL_UI_STATE_MESSAGES__?.at(-1)?.state.inspector.selectedNode
        ?.textSelectionRange;
    if (!range) throw new Error("OpenPencil canvas text selection range is unavailable");
    return range;
  });
}

async function overrideDebugTextSelectionRange(page: Page, range: unknown): Promise<void> {
  const overridden = await page.evaluate((nextRange) => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG_OVERRIDE_TEXT_SELECTION_RANGE__?: (
        range: unknown,
      ) => boolean;
    };
    return scope.__OPENPENCIL_SPIKE_DEBUG_OVERRIDE_TEXT_SELECTION_RANGE__?.(nextRange) ?? false;
  }, range);
  expect(overridden).toBe(true);
}

async function sendHostCommand(
  page: Page,
  pageId: string,
  command: OpenPencilHostCommand,
): Promise<void> {
  await page.evaluate(
    (payload) => window.postMessage(payload, "*"),
    createOpenPencilCommandMessage({
      pageId,
      command,
    }),
  );
}

async function exportedNodeCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const nodes = scope.__OPENPENCIL_SPIKE_DEBUG__?.().exportedScene?.nodes;
    if (!nodes) throw new Error("OpenPencil exported scene is unavailable");
    return nodes.length;
  });
}

async function getOpenPencilDebug(page: Page): Promise<OpenPencilDebugState> {
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
    };
    const debug = scope.__OPENPENCIL_SPIKE_DEBUG__?.();
    if (!debug) throw new Error("OpenPencil debug hook is unavailable");
    return debug;
  });
}

async function resetDirtyMessages(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_DIRTY_MESSAGES__?: OpenPencilDirtyStateMessage[];
    };
    scope.__OPENPENCIL_DIRTY_MESSAGES__ = [];
  });
}

async function waitForDirtyPatch(page: Page): Promise<OpenPencilDirtyStateMessage> {
  await page.waitForFunction(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_DIRTY_MESSAGES__?: OpenPencilDirtyStateMessage[];
    };
    const latest = scope.__OPENPENCIL_DIRTY_MESSAGES__?.at(-1);
    return Boolean(latest?.scene);
  });
  return page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __OPENPENCIL_DIRTY_MESSAGES__?: OpenPencilDirtyStateMessage[];
    };
    const latest = scope.__OPENPENCIL_DIRTY_MESSAGES__?.at(-1);
    if (!latest) throw new Error("OpenPencil dirty-state message is unavailable");
    return latest;
  });
}

async function expectDirtyPatchReplays(
  page: Page,
  baseScene: SketchSceneDocument,
  message: OpenPencilDirtyStateMessage,
): Promise<void> {
  expect(message.scene).not.toBeNull();
  expect(message.patchBaseSceneKey).toBeTruthy();
  expect(JSON.parse(message.patchBaseSceneKey ?? "null")).toEqual(baseScene);
  if (!message.patchOperations?.length) {
    const debug = await getOpenPencilDebug(page);
    throw new Error(`OpenPencil dirty-state patch missing: ${debug.lastPatchStatus ?? "unknown"}`);
  }
  expect(message.patchOperations.length).toBeGreaterThan(0);
  if (!message.scene || !message.patchOperations) return;

  const patched = applySketchScenePatchOperations(baseScene, message.patchOperations);
  expect(normalizeSceneForPatchAssert(patched)).toEqual(
    normalizeSceneForPatchAssert(message.scene),
  );
}

function normalizeSceneForPatchAssert(scene: SketchSceneDocument): SketchSceneDocument {
  const metadata = scene.metadata ? { ...scene.metadata } : undefined;
  if (metadata) delete metadata.updatedAt;
  return {
    ...scene,
    metadata: metadata && Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

async function loadSketchScene(
  page: Page,
  pageId: string,
  scene: SketchSceneDocument,
  options: {
    imageProxyUrl?: string;
    expectedImageNodeName?: string | null;
  } = {},
): Promise<OpenPencilDebugState> {
  await page.evaluate(
    (payload) => window.postMessage(payload, "*"),
    createOpenPencilLoadDocumentMessage({
      pageId,
      pageName: "OpenPencil regression",
      scene,
      configData: {},
      previewSize: scene.pageSize,
      imageProxyUrl: options.imageProxyUrl,
    }),
  );

  await page.waitForFunction(
    (expectedPageId) => {
      const scope = globalThis as typeof globalThis & {
        __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
      };
      return scope.__OPENPENCIL_SPIKE_DEBUG__?.().pageId === expectedPageId;
    },
    pageId,
  );

  const expectedImageNodeName = options.expectedImageNodeName === null
    ? null
    : options.expectedImageNodeName ?? "Inline photo";
  if (expectedImageNodeName) {
    await page.waitForFunction((nodeName) => {
      const scope = globalThis as typeof globalThis & {
        __OPENPENCIL_SPIKE_DEBUG__?: () => OpenPencilDebugState;
      };
      return scope
        .__OPENPENCIL_SPIKE_DEBUG__?.()
        .openPencilNodes.some((node) => node.name === nodeName && node.imageBytesAvailable);
    }, expectedImageNodeName);
  }

  return getOpenPencilDebug(page);
}
