import { describe, expect, it } from "vitest";
import { applyWhiteboardActions, getWhiteboardSelection, parseWhiteboardCode, resolveWhiteboardAssetRefs, serializeWhiteboardCode, transitionWhiteboardAsset, validateWhiteboardDocument } from "../src";

const html = `<main data-sketch-canvas="v1" data-width="400" data-height="300"><div data-sketch-id="box" data-sketch-kind="rect" data-sketch-role="subject"></div><div data-sketch-id="title" data-sketch-kind="text">Hello&#10;world</div></main>`;
const css = `[data-sketch-id="box"] { left:10px; top:20px; width:100px; height:80px; z-index:2; background:#fff; border-radius:4px; }\n[data-sketch-id="title"] { left:30px; top:40px; width:200px; height:30px; z-index:3; font-size:20px; color:#111; }`;

describe("whiteboard-core bridge", () => {
  it("parses restricted HTML/CSS and preserves explicit newlines", () => {
    const result = parseWhiteboardCode(html, css, { id: "demo" });
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.scene.nodes[1].text).toBe("Hello\nworld");
    expect(result.value?.nodeSemantics.box.role).toBe("subject");
  });
  it("round trips canonical fields", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const serialized = serializeWhiteboardCode(parsed).value!;
    const reparsed = parseWhiteboardCode(serialized.html, serialized.css, { id: "demo" }).value!;
    expect(reparsed.scene.nodes).toEqual(parsed.scene.nodes);
    expect(reparsed.nodeSemantics).toEqual(parsed.nodeSemantics);
  });
  it("keeps numeric font weights stable across canonical serialization", () => {
    const parsed = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="100" data-height="100"><div data-sketch-id="title" data-sketch-kind="text">Title</div></main>`,
      `[data-sketch-id="title"] { left:0px; top:0px; width:80px; height:20px; font-weight:700; }`,
      { id: "demo" },
    ).value!;
    const serialized = serializeWhiteboardCode(parsed).value!;
    const reparsed = parseWhiteboardCode(serialized.html, serialized.css, { id: "demo" }).value!;
    expect(reparsed.scene.nodes[0].style?.fontWeight).toBe(700);
  });
  it("round trips image fit, rotation, opacity and explicit layering", () => {
    const parsed = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="120" data-height="80"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" /></main>`,
      `[data-sketch-id="hero"] { left:10px; top:12px; width:40px; height:30px; z-index:4; opacity:0.75; object-fit:contain; transform:rotate(-6deg); }`,
      { id: "demo" },
    ).value!;
    const serialized = serializeWhiteboardCode(parsed).value!;
    const reparsed = parseWhiteboardCode(serialized.html, serialized.css, { id: "demo" }).value!;
    expect(reparsed.scene.nodes[0]).toMatchObject({ rotation: -6, style: { opacity: 0.75, imageFit: "contain" }, zIndex: 0 });
    expect(reparsed.nodeSemantics.hero.assetRef).toBe("asset_1");
  });
  it("round trips intrinsic image dimensions and crop metadata through the bridge", () => {
    const parsed = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="240" data-height="180"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" data-sketch-image-size="1200,800" data-sketch-image-crop="rect|0.1,0.2,0.6,0.5|10,20,200,160|contain" /></main>`,
      `[data-sketch-id="hero"] { left:30px; top:40px; width:120px; height:80px; border-color:#2563EB; border-width:4px; object-fit:contain; }`,
      { id: "demo" },
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.value?.scene.nodes[0]).toMatchObject({
      intrinsicWidth: 1200,
      intrinsicHeight: 800,
      imageCrop: {
        shape: "rect",
        sourceRect: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
        originalFrame: { x: 10, y: 20, width: 200, height: 160 },
        originalImageFit: "contain",
      },
    });

    const serialized = serializeWhiteboardCode(parsed.value!).value!;
    expect(serialized.html).toContain('data-sketch-image-size="1200,800"');
    expect(serialized.html).toContain('data-sketch-image-crop="rect|0.1,0.2,0.6,0.5|10,20,200,160|contain"');
    const reparsed = parseWhiteboardCode(serialized.html, serialized.css, { id: "demo" }).value!;
    expect(reparsed.scene.nodes[0]).toEqual(parsed.value!.scene.nodes[0]);
  });
  it("applies and resets the image crop action without losing the image node", () => {
    const document = parseWhiteboardCode(
      '<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" /></main>',
      '[data-sketch-id="hero"] { left:10px; top:12px; width:80px; height:60px; object-fit:contain; }',
    ).value!;
    const crop = {
      shape: "circle" as const,
      sourceRect: { x: 0.2, y: 0.1, width: 0.5, height: 0.5 },
      originalFrame: { x: 10, y: 12, width: 80, height: 60 },
      originalImageFit: "contain" as const,
    };
    const cropped = applyWhiteboardActions(document, [{
      type: "setImageCrop",
      nodeId: "hero",
      crop,
      frame: { x: 20, y: 16, width: 40, height: 40 },
    }]);
    expect(cropped.diagnostics).toEqual([]);
    expect(cropped.value?.scene.nodes[0]).toMatchObject({ x: 20, y: 16, width: 40, height: 40, imageCrop: crop });

    const reset = applyWhiteboardActions(cropped.value!, [{
      type: "setImageCrop",
      nodeId: "hero",
      crop: null,
      frame: crop.originalFrame,
    }]);
    expect(reset.diagnostics).toEqual([]);
    expect(reset.value?.scene.nodes[0]).toMatchObject({ x: 10, y: 12, width: 80, height: 60 });
    expect(reset.value?.scene.nodes[0]).not.toHaveProperty("imageCrop");
  });
  it("rejects unsupported nodes and duplicate IDs", () => {
    const result = parseWhiteboardCode(`<main data-sketch-canvas="v1" data-width="10" data-height="10"><div data-sketch-id="x" data-sketch-kind="card"></div><div data-sketch-id="x" data-sketch-kind="rect"></div></main>`, "");
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(["UNSUPPORTED_NODE", "DUPLICATE_NODE_ID"]));
  });
  it("applies field-level actions without replacing style", () => {
    const document = parseWhiteboardCode(html, css).value!;
    const result = applyWhiteboardActions(document, [{ type: "updateNode", nodeId: "box", patch: { x: 55 } }]);
    expect(result.value?.scene.nodes.find((n) => n.id === "box")?.style?.fill).toBe("#fff");
    expect(result.value?.scene.nodes.find((n) => n.id === "box")?.x).toBe(55);
  });
  it("allocates collision-free IDs for addText and returns the action-to-node mapping", () => {
    const document = parseWhiteboardCode(html, css).value!;
    const result = applyWhiteboardActions(document, [
      { type: "addText", nodeId: "text-1", text: "Reserved", x: 1, y: 1, width: 20, height: 10 },
      { type: "addText", text: "First", x: 1, y: 1, width: 20, height: 10 },
      { type: "addText", text: "Second", x: 1, y: 12, width: 20, height: 10 },
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.idMapping).toEqual({ "addText:1": "text-2", "addText:2": "text-3" });
    expect(result.value?.scene.nodes.map((node) => node.id)).toEqual(expect.arrayContaining(["text-1", "text-2", "text-3"]));
  });
  it("prevents updateNode from bypassing managed image placement", () => {
    const document = parseWhiteboardCode(
      '<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" /></main>',
      '[data-sketch-id="hero"] { left:0; top:0; width:20px; height:20px; }',
    ).value!;
    const result = applyWhiteboardActions(document, [{ type: "updateNode", nodeId: "hero", patch: { src: "/api/images/asset_1" } } as never]);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain("INVALID_ACTION");
  });
  it("requires placeAsset to bind an asset ID to its own managed source", () => {
    const document = parseWhiteboardCode(
      '<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" src="/api/images/asset_1" /></main>',
      '[data-sketch-id="hero"] { left:0; top:0; width:20px; height:20px; }',
    ).value!;
    const unrelated = applyWhiteboardActions(document, [{ type: "placeAsset", nodeId: "hero", assetId: "asset_1", src: "/api/images/asset_2" }]);
    expect(unrelated.value).toBeUndefined();
    expect(unrelated.diagnostics.map((item) => item.code)).toContain("INVALID_ASSET_REF");
    const unsafe = applyWhiteboardActions(document, [{ type: "placeAsset", nodeId: "hero", assetId: "asset_1", src: "uploads/asset_1" }]);
    expect(unsafe.value).toBeUndefined();
    expect(unsafe.diagnostics.map((item) => item.code)).toContain("INVALID_ASSET_REF");
    expect(applyWhiteboardActions(document, [{ type: "placeAsset", nodeId: "hero", assetId: "asset_1", src: "/api/images/asset_1" }]).value?.nodeSemantics.hero.assetRef).toBe("asset_1");
  });
  it("reports every nested bridge ID with a precise HTML range", () => {
    const nestedHtml = '<main data-sketch-canvas="v1" data-width="100" data-height="100"><div data-sketch-id="group" data-sketch-kind="group"><div data-sketch-id="box" data-sketch-kind="rect"><span data-sketch-id="label" data-sketch-kind="text">Label</span></div></div></main>';
    const nestedCss = '[data-sketch-id="group"] { left:0; top:0; width:100px; height:100px; }\n[data-sketch-id="box"] { left:1px; top:1px; width:10px; height:10px; }\n[data-sketch-id="label"] { left:1px; top:1px; width:8px; height:8px; }';
    const result = parseWhiteboardCode(nestedHtml, nestedCss);
    expect(result.value).toBeUndefined();
    for (const nodeId of ["group", "box", "label"]) {
      const diagnostic = result.diagnostics.find((item) => item.code === "NESTED_NODE" && item.nodeId === nodeId);
      expect(diagnostic?.range).toBeDefined();
      expect(nestedHtml.slice(diagnostic!.range!.start, diagnostic!.range!.end)).toContain(`data-sketch-id="${nodeId}"`);
    }
  });
  it("validates bridge documents", () => {
    const document = parseWhiteboardCode(html, css).value!;
    expect(validateWhiteboardDocument(document).valid).toBe(true);
  });
  it("returns structured diagnostics for unsafe CSS and resources", () => {
    const result = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" src="https://example.com/a.png"></img></main>`,
      `[data-sketch-id="hero"] { left:0; top:0; width:100px; height:100px; background:url(https://example.com/a.png); }`,
    );
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining(["UNSUPPORTED_CSS_VALUE", "UNLOCALIZED_RESOURCE"]));
    expect(result.diagnostics.every((diagnostic) => diagnostic.code && diagnostic.severity && diagnostic.message)).toBe(true);
    expect(result.diagnostics.find((diagnostic) => diagnostic.code === "UNSUPPORTED_CSS_VALUE")?.range).toBeDefined();
  });
  it("rejects non-managed image paths", () => {
    const result = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" src="hero.png" /></main>`,
      `[data-sketch-id="hero"] { left:0; top:0; width:100px; height:100px; }`,
    );
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("UNLOCALIZED_RESOURCE");
  });
  it("keeps group relationships non-semantic", () => {
    const result = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="100" data-height="100"><div data-sketch-id="group" data-sketch-kind="group" data-sketch-role="decor"></div></main>`,
      `[data-sketch-id="group"] { left:0; top:0; width:100px; height:100px; }`,
    );
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("INVALID_GROUP_SEMANTICS");
  });
  it("round trips a hidden group through children metadata", () => {
    const result = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="100" data-height="100"><div data-sketch-id="group" data-sketch-kind="group" data-sketch-children="box"></div><div data-sketch-id="box" data-sketch-kind="rect"></div></main>`,
      `[data-sketch-id="group"] { left:0; top:0; width:100px; height:100px; }\n[data-sketch-id="box"] { left:10px; top:10px; width:20px; height:20px; }`,
    );
    expect(result.diagnostics).toEqual([]);
    const serialized = serializeWhiteboardCode(result.value!).value!;
    expect(parseWhiteboardCode(serialized.html, serialized.css).diagnostics).toEqual([]);
  });
  it("projects an assetRef to a stable local src when code omits src", () => {
    const result = parseWhiteboardCode(
      `<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" /></main>`,
      `[data-sketch-id="hero"] { left:0; top:0; width:100px; height:100px; object-fit:contain; }`,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.value?.scene.nodes[0].src).toBe("assets/asset_1");
    expect(result.value?.nodeSemantics.hero.assetRef).toBe("asset_1");
  });

  it("requires lifecycle confirmation before an asset can be attached", () => {
    const candidate = { assetId: "asset_1", lifecycle: "candidate" as const };
    expect(transitionWhiteboardAsset(candidate, { type: "attach" }).value).toBeUndefined();
    const localized = transitionWhiteboardAsset(candidate, { type: "localize", src: "/api/images/img_1" }).value!;
    const attached = transitionWhiteboardAsset(localized, { type: "attach" }).value!;
    expect(attached.lifecycle).toBe("attached");
    expect(transitionWhiteboardAsset(attached, { type: "markOutput" }).value?.lifecycle).toBe("output");
  });

  it("resolves attached asset references without accepting temporary URLs", () => {
    const parsed = parseWhiteboardCode(
      '<main data-sketch-canvas="v1" data-width="100" data-height="100"><img data-sketch-id="hero" data-sketch-kind="image" data-asset-ref="asset_1" /></main>',
      '[data-sketch-id="hero"] { left:0; top:0; width:20px; height:20px; }',
    );
    expect(parsed.value).toBeDefined();
    const result = resolveWhiteboardAssetRefs(parsed.value!, [{ assetId: "asset_1", lifecycle: "attached", src: "/api/images/img_1" }]);
    expect(result.value?.scene.nodes[0]?.src).toBe("/api/images/img_1");
    expect(resolveWhiteboardAssetRefs(parsed.value!, [{ assetId: "asset_1", lifecycle: "candidate", src: "https://example.test/a.png" }]).value).toBeUndefined();
  });

  it("rejects bridge documents with scene metadata or unsafe style values", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    expect(validateWhiteboardDocument({ ...parsed, scene: { ...parsed.scene, metadata: { source: "editor" } } }).diagnostics.map((item) => item.code)).toContain("UNSUPPORTED_SCENE_FIELD");
    const unsafe = { ...parsed, scene: { ...parsed.scene, nodes: parsed.scene.nodes.map((node) => node.id === "box" ? { ...node, style: { ...node.style, fill: "red; color: blue" } } : node) } };
    expect(serializeWhiteboardCode(unsafe).diagnostics.map((item) => item.code)).toContain("UNSAFE_STYLE");
  });
  it("keeps bridge validation errors in Chinese for user-facing surfaces", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const invalid = {
      ...parsed,
      scene: {
        ...parsed.scene,
        metadata: { source: "editor" },
        nodes: parsed.scene.nodes.map((node) =>
          node.id === "box" ? { ...node, text: "不支持的文本" } : node,
        ),
      },
    };
    const messages = validateWhiteboardDocument(invalid).diagnostics.map(
      (item) => item.message,
    );
    expect(messages).toContain("场景元数据不属于当前白板代码桥接范围");
    expect(messages).toContain("仅文本节点和按钮节点支持文本内容");
    expect(messages.join("；")).not.toContain("scene metadata");
    expect(messages.join("；")).not.toContain("text is only supported");
  });

  it("rejects unknown document and node fields instead of dropping them", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const invalid = validateWhiteboardDocument({
      ...parsed,
      unexpected: true,
      scene: {
        ...parsed.scene,
        nodes: parsed.scene.nodes.map((node) => ({ ...node, unexpected: true })),
      },
    });
    expect(invalid.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["UNSUPPORTED_DOCUMENT_FIELD", "UNSUPPORTED_NODE_FIELD"]),
    );
  });

  it("rejects orphan CSS rules instead of silently dropping them", () => {
    const result = parseWhiteboardCode(html, `${css}\n[data-sketch-id="unused"] { left:0; top:0; width:1px; height:1px; }`);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain("ORPHAN_CSS_RULE");
  });
  it("enforces HTML and CSS input limits before normalization", () => {
    const oversized = parseWhiteboardCode(html, css, { maxBytes: 32 });
    expect(oversized.value).toBeUndefined();
    expect(oversized.diagnostics.map((item) => item.code)).toContain("INPUT_TOO_LARGE");
    const cssTokens = "[data-sketch-id=\"box\"] {" + " left:0px;".repeat(21_000) + "}";
    const tokenLimited = parseWhiteboardCode(html, cssTokens);
    expect(tokenLimited.value).toBeUndefined();
    expect(tokenLimited.diagnostics.map((item) => item.code)).toContain("CSS_TOKEN_LIMIT");
  });

  it("reports malformed scene nodes without throwing", () => {
    const malformed = { id: "demo", version: 2, documentRevision: 0, scene: { version: 1, pageSize: { width: 100, height: 100 }, nodes: [null], assets: [], bindings: {}, metadata: {} }, nodeSemantics: {}, editorView: { zoom: 1, offsetX: 0, offsetY: 0 }, updatedAt: 1 };
    expect(() => validateWhiteboardDocument(malformed)).not.toThrow();
    expect(validateWhiteboardDocument(malformed).valid).toBe(false);
  });

  it("does not silently drop type-incompatible node fields", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const invalid = { ...parsed, scene: { ...parsed.scene, nodes: parsed.scene.nodes.map((node) => node.id === "box" ? { ...node, text: "not a rect label" } : node) } };
    expect(serializeWhiteboardCode(invalid).diagnostics.map((item) => item.code)).toContain("UNSUPPORTED_NODE_FIELD");
  });

  it("rejects runtime actions outside the typed action union", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const result = applyWhiteboardActions(parsed, [{ type: "unknown", nodeId: "box" } as never]);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain("INVALID_ACTION");
  });

  it("rejects malformed action fields before mutating the document", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const invalidFit = applyWhiteboardActions(parsed, [{ type: "setImageFit", nodeId: "box", fit: "stretch" } as never]);
    expect(invalidFit.diagnostics.map((item) => item.code)).toContain("INVALID_ACTION");
    const invalidPatch = applyWhiteboardActions(parsed, [{ type: "updateNode", nodeId: "box", patch: { arbitrary: true } } as never]);
    expect(invalidPatch.diagnostics.map((item) => item.code)).toContain("INVALID_ACTION");
  });

  it("blocks geometry actions that leave the configured safe area", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    const document = { ...parsed, safeArea: { x: 0, y: 0, width: 120, height: 100 } };
    const result = applyWhiteboardActions(document, [{ type: "updateNode", nodeId: "box", patch: { x: 40 } }]);
    expect(result.value).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toContain("OUTSIDE_SAFE_AREA");
  });

  it("returns a stable selection summary for AI context", () => {
    const parsed = parseWhiteboardCode(html, css, { id: "demo" }).value!;
    expect(getWhiteboardSelection(parsed, ["title", "missing", "title"])).toEqual({
      nodeIds: ["title"],
      bounds: { x: 30, y: 40, width: 200, height: 30 },
    });
  });
});
