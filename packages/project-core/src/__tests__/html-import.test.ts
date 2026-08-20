import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeHtmlImport, normalizeHtmlImport, stageHtmlImportBranch, HtmlImportError } from "../html-import";

interface Fixture { id: string; source: string; status: "accepted" | "rejected"; runtimeType?: "prototype-html-css" | "sandboxed-html"; signals: string[]; unsupported: string[]; }
const fixtures = JSON.parse(fs.readFileSync(new URL("./fixtures/html-import-analysis.json", import.meta.url), "utf8")) as Fixture[];

describe("production HTML import analyzer", () => {
  for (const fixture of fixtures) it(`matches Phase 0 fixture ${fixture.id}`, () => {
    const first = normalizeHtmlImport(fixture.source);
    const second = normalizeHtmlImport(fixture.source);
    expect(first).toEqual(second);
    expect(first.analysis.outcome.status).toBe(fixture.status);
    if (first.analysis.outcome.status === "accepted") expect(first.analysis.outcome.runtimeType).toBe(fixture.runtimeType);
    expect(first.analysis.signals.map((item) => item.code)).toEqual(fixture.signals.slice().sort());
    expect(first.analysis.unsupportedCapabilities.map((item) => item.code)).toEqual(fixture.unsupported.slice().sort());
  });

  it("removes inert data scripts and produces stable canonical output", () => {
    const first = normalizeHtmlImport("<div b='2' a='1'>x</div><script type='application/ld+json'>{}</script>");
    const second = normalizeHtmlImport("<div a='1' b='2'>x</div><script type='application/ld+json'>{}</script>");
    expect(first.analysis.outcome).toEqual({ status: "accepted", runtimeType: "prototype-html-css" });
    expect(first.normalizedHtml).toBe(second.normalizedHtml);
    expect(first.normalizedHtml).not.toMatch(/application\/ld\+json/);
  });

  it("preserves legacy Figma dimensions, with meta viewport taking precedence", () => {
    const css = normalizeHtmlImport("<style>.figma-export { width: 375px; height: 812px; }</style><div class='figma-export'>x</div>");
    expect(css.analysis.detectedViewport).toEqual({ width: 375, height: 812 });
    const inline = normalizeHtmlImport("<div data-layer='Frame' style='width: 414px; height: 896px'>x</div>");
    expect(inline.analysis.detectedViewport).toEqual({ width: 414, height: 896 });
    const meta = normalizeHtmlImport("<meta name='viewport' content='width=390,height=844'><style>.figma-export { width: 375px; height: 812px; }</style><div class='figma-export'>x</div>");
    expect(meta.analysis.detectedViewport).toEqual({ width: 390, height: 844 });
  });

  it("rejects resources, embeds, refresh and real submissions", () => {
    const result = analyzeHtmlImport("<base href='/'><iframe src='https://x.test'></iframe><meta http-equiv='refresh' content='0'><form action='/submit'></form>");
    expect(result.outcome).toEqual({ status: "rejected", code: "HTML_IMPORT_EMBED_UNSUPPORTED" });
    expect(result.unsupportedCapabilities.map((x) => x.code)).toEqual(expect.arrayContaining(["base-url", "embedded-browsing-context", "remote-resource", "meta-refresh", "form-submission"]));
  });

  it("stages and atomically commits static and sandbox pages", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-import-test-"));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "demos"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "workspace-tree.json"), JSON.stringify({ pages: [], folders: [] }));
    const stage = stageHtmlImportBranch({ workspacePath: workspace, pageId: "landing", page: { name: "Landing", routeKey: "landing", order: 0, parentId: null }, source: "<h1>Hello</h1>", schema: "{}", css: ".page{color:red}" });
    expect(fs.existsSync(path.join(workspace, "demos/landing"))).toBe(false);
    stage.commit();
    expect(fs.readFileSync(path.join(workspace, "demos/landing/prototype.html"), "utf8")).toContain("<h1>Hello</h1>");
    const interactive = stageHtmlImportBranch({ workspacePath: workspace, pageId: "interactive", page: {}, source: "<script>document.body</script>", schema: "{}" });
    interactive.commit();
    expect(fs.readFileSync(path.join(workspace, "demos/interactive/sandbox.html"), "utf8")).toContain("<script>");
    expect(JSON.parse(fs.readFileSync(path.join(workspace, "demos/interactive/html-import.meta.json"), "utf8")).source).toBe("html-import");
    expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".html-import-")).length).toBe(0);
  });

  it("rejects unsafe paths, invalid schemas and duplicate pages without touching workspace", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-import-input-"));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "demos", "existing"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "workspace-tree.json"), JSON.stringify({ pages: [{ id: "existing" }], folders: [] }));
    const input = { workspacePath: workspace, page: {}, source: "<p>x</p>", schema: "{}" };
    for (const pageId of ["", ".", "../evil", path.join(root, "evil")]) expect(() => stageHtmlImportBranch({ ...input, pageId })).toThrow(HtmlImportError);
    expect(() => stageHtmlImportBranch({ ...input, pageId: "new", schema: "[]" })).toThrow(HtmlImportError);
    expect(() => stageHtmlImportBranch({ ...input, pageId: "existing" })).toThrow(HtmlImportError);
    expect(fs.existsSync(path.join(workspace, "demos", "existing"))).toBe(true);
    expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".html-import-")).length).toBe(0);
  });

  it("returns a stable structured gate error", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-import-gate-"));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "demos"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "workspace-tree.json"), JSON.stringify({ pages: [], folders: [] }));
    try {
      stageHtmlImportBranch({ workspacePath: workspace, pageId: "too-css", page: {}, source: "<p>x</p>", schema: "{}", css: "x".repeat(120_001) });
      throw new Error("expected gate rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(HtmlImportError);
      expect((error as HtmlImportError).code).toBe("HTML_IMPORT_CAPABILITY_RESTRICTED");
      expect((error as HtmlImportError).reasonCodes).toContain("PROTOTYPE_CSS_TOO_LARGE");
    }
    expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".html-import-")).length).toBe(0);
  });

  it("scans inline style URLs and enforces each data URL limit", () => {
    const remote = analyzeHtmlImport('<div style="background:url(./hero.png)">x</div>');
    expect(remote.unsupportedCapabilities.map((item) => item.code)).toContain("css-external-resource");
    const oversized = `data:image/png;base64,${"A".repeat(1_500_000)}`;
    const result = analyzeHtmlImport(`<div style="background:url('${oversized}')">x</div>`);
    expect(result.unsupportedCapabilities.map((item) => item.code)).toContain("data-url-too-large");
  });

  it("cleans staging on discard and restores target after a controllable commit conflict", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-import-atomic-"));
    const workspace = path.join(root, "workspace");
    fs.mkdirSync(path.join(workspace, "demos"), { recursive: true });
    fs.writeFileSync(path.join(workspace, "workspace-tree.json"), JSON.stringify({ pages: [], folders: [] }));
    const discarded = stageHtmlImportBranch({ workspacePath: workspace, pageId: "discarded", page: {}, source: "<p>x</p>", schema: "{}" });
    discarded.discard();
    expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".html-import-")).length).toBe(0);
    const failed = stageHtmlImportBranch({ workspacePath: workspace, pageId: "failed", page: {}, source: "<p>x</p>", schema: "{}" });
    fs.rmSync(failed.stagingPath, { recursive: true, force: true });
    expect(() => failed.commit()).toThrow();
    expect(fs.existsSync(path.join(workspace, "workspace-tree.json"))).toBe(true);
    expect(fs.existsSync(path.join(workspace, "demos", "failed"))).toBe(false);
    expect(fs.readdirSync(root).filter((entry) => entry.startsWith(".html-import-")).length).toBe(0);
  });
});
