import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEditableSnapshotBundle, decodeText, type SnapshotCaptureInput } from "../src/index.js";

const adapters = {
  async sha256(content: Uint8Array) {
    return createHash("sha256").update(content).digest("hex");
  },
};

function capture(html: string): SnapshotCaptureInput {
  return {
    captureId: "capture-test",
    capturedAt: "2026-08-20T00:00:00.000Z",
    url: "https://app.example.test/dashboard",
    title: "Dashboard",
    routeKey: "/dashboard",
    viewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    html,
  };
}

describe("buildEditableSnapshotBundle", () => {
  it("keeps executable and embedded document structures while extracting inline code", async () => {
    const html = `<!doctype html><html><head><style>body{color:red}</style></head><body onload="boot()"><form action="/save"><iframe src="https://frame.example.test/app" sandbox="allow-scripts"></iframe><script type="module" async crossorigin="anonymous">console.log("ready")</script></form></body></html>`;
    const bundle = await buildEditableSnapshotBundle(capture(html), adapters);
    const workspace = decodeText(bundle.files.find((file) => file.path === "workspace/index.html")!.content);

    expect(workspace).toContain('onload="boot()"');
    expect(workspace).toContain('<form action="/save">');
    expect(workspace).toContain("<iframe");
    expect(workspace).toContain('sandbox="allow-scripts"');
    expect(workspace).toContain('src="scripts/first-party/inline-001.js"');
    expect(workspace).toContain('type="module"');
    expect(workspace).toContain(" async");
    expect(bundle.manifest.scripts[0]).toMatchObject({ order: 1, inline: true, type: "module", async: true });
    expect(bundle.files.some((file) => file.path === "workspace/styles/inline-001.css")).toBe(true);
    expect(bundle.files.some((file) => file.path === "workspace/frames/frame-001/frame.json")).toBe(true);
  });

  it("splits captured iframe srcdoc into an isolated nested workspace", async () => {
    const html = `<iframe sandbox="allow-scripts" srcdoc="&lt;h1&gt;Frame&lt;/h1&gt;&lt;script&gt;window.ready=true&lt;/script&gt;"></iframe>`;
    const bundle = await buildEditableSnapshotBundle(capture(html), adapters);
    const workspace = decodeText(bundle.files.find((file) => file.path === "workspace/index.html")!.content);
    const frame = decodeText(bundle.files.find((file) => file.path === "workspace/frames/frame-001/index.html")!.content);
    expect(workspace).toContain('src="frames/frame-001/index.html"');
    expect(workspace).toContain('sandbox="allow-scripts"');
    expect(workspace).not.toContain("srcdoc=");
    expect(frame).toContain("<script>window.ready=true</script>");
  });

  it("localizes data URLs by content hash and does not duplicate assets", async () => {
    const html = `<html><body><img src="data:image/png;base64,aGVsbG8="><img src="data:image/png;base64,aGVsbG8="></body></html>`;
    const bundle = await buildEditableSnapshotBundle(capture(html), adapters);
    const images = bundle.files.filter((file) => file.path.startsWith("workspace/assets/images/"));
    expect(images).toHaveLength(1);
    expect(decodeText(images[0].content)).toBe("hello");
  });

  it("localizes CSS data URLs relative to extracted stylesheets", async () => {
    const html = `<style>.logo{background:url("data:image/png;base64,aGVsbG8=")}</style>`;
    const bundle = await buildEditableSnapshotBundle(capture(html), adapters);
    const css = decodeText(bundle.files.find((file) => file.path === "workspace/styles/inline-001.css")!.content);
    expect(css).toContain('url("../assets/images/');
    expect(bundle.files.filter((file) => file.path.startsWith("workspace/assets/images/"))).toHaveLength(1);
  });

  it("recovers only source-map sources that include real sourcesContent", async () => {
    const sourceMap = Buffer.from(JSON.stringify({
      version: 3,
      sources: ["webpack:///src/app.ts", "webpack:///src/missing.ts"],
      sourcesContent: ["export const answer = 42;", null],
      names: [],
      mappings: "",
    })).toString("base64");
    const bundle = await buildEditableSnapshotBundle(capture(`<script>//# sourceMappingURL=data:application/json;base64,${sourceMap}</script>`), adapters);
    expect(bundle.files.some((file) => file.path === "sources/src/app.ts")).toBe(true);
    expect(bundle.files.some((file) => file.path === "sources/src/missing.ts")).toBe(false);
    expect(bundle.manifest.sourceMaps[0]).toMatchObject({
      status: "partial",
      sources: ["sources/src/app.ts"],
      missingSources: ["webpack:///src/missing.ts"],
    });
  });

  it("recovers external source maps and missing source bodies through the injected adapter", async () => {
    const script = `console.log("compiled")\n//# sourceMappingURL=app.js.map`;
    const scriptUrl = "https://app.example.test/assets/app.js";
    const requested: string[] = [];
    const bundle = await buildEditableSnapshotBundle(capture(
      `<script data-editable-snapshot-original-src="${scriptUrl}" src="data:text/javascript;base64,${Buffer.from(script).toString("base64")}"></script>`,
    ), {
      ...adapters,
      async fetchResource(url) {
        requested.push(url);
        if (url.endsWith("app.js.map")) {
          return {
            bytes: new TextEncoder().encode(JSON.stringify({ version: 3, sources: ["../src/app.ts"], names: [], mappings: "" })),
            mediaType: "application/json",
          };
        }
        if (url.endsWith("/src/app.ts")) return { bytes: new TextEncoder().encode("export const source = true;"), mediaType: "text/typescript" };
        throw new Error(`unexpected ${url}`);
      },
    });

    expect(requested).toEqual([
      "https://app.example.test/assets/app.js.map",
      "https://app.example.test/src/app.ts",
    ]);
    expect(bundle.manifest.sourceMaps[0]).toMatchObject({ status: "recovered", sources: ["sources/src/app.ts"] });
    expect(decodeText(bundle.files.find((file) => file.path === "sources/src/app.ts")!.content)).toContain("source = true");
    expect(bundle.manifest.scripts[0]).toMatchObject({ originalUrl: scriptUrl });
    expect(decodeText(bundle.files.find((file) => file.path === "workspace/index.html")!.content))
      .not.toContain("data-editable-snapshot-original-src");
  });

  it("creates formatted reading copies without changing execution bytes", async () => {
    const source = "const answer=40+2";
    const bundle = await buildEditableSnapshotBundle(capture(`<style>body{color:red}</style><script>${source}</script>`), {
      ...adapters,
      async formatReadable(value, language) {
        return `/* ${language} readable */\n${value}\n`;
      },
    });
    const script = bundle.manifest.resources.find((resource) => resource.kind === "script")!;
    expect(script.readablePath).toBe("workspace/readable/scripts/first-party/inline-001.js");
    expect(decodeText(bundle.files.find((file) => file.path === script.localPath)!.content)).toBe(source);
    expect(decodeText(bundle.files.find((file) => file.path === script.readablePath)!.content)).toContain("javascript readable");
  });

  it("records multiple scripts in document order with execution attributes intact", async () => {
    const bundle = await buildEditableSnapshotBundle(capture(`
      <script defer src="https://app.example.test/a.js"></script>
      <script type="module" async crossorigin="use-credentials" integrity="sha256-x" referrerpolicy="no-referrer">one()</script>
      <script nomodule>legacy()</script>
    `), adapters);
    expect(bundle.manifest.scripts).toMatchObject([
      { order: 1, originalUrl: "https://app.example.test/a.js", defer: true, async: false },
      { order: 2, type: "module", async: true, crossorigin: "use-credentials", integrity: "sha256-x", referrerpolicy: "no-referrer" },
      { order: 3, nomodule: true },
    ]);
  });

  it("flags executable content without exporting browser storage", async () => {
    const bundle = await buildEditableSnapshotBundle(capture(`<script>const token = "secret-value"</script>`), adapters);
    const report = JSON.parse(decodeText(bundle.files.find((file) => file.path === "reports/security-report.json")!.content));
    expect(bundle.manifest.executableContent).toBe(true);
    expect(report.cookieExported).toBe(false);
    expect(report.storageExported).toBe(false);
    expect(report.findings.some((finding: { code: string }) => finding.code === "EXECUTABLE_SCRIPT")).toBe(true);
  });

  it("generates a syntactically valid sandboxed preview runner", async () => {
    const bundle = await buildEditableSnapshotBundle(capture("<h1>Preview</h1>"), adapters);
    const runner = decodeText(bundle.files.find((file) => file.path === "runner/serve.mjs")!.content);
    const syntax = spawnSync(process.execPath, ["--input-type=module", "--check", "-"], { input: runner, encoding: "utf8" });
    expect(syntax.status, syntax.stderr).toBe(0);
    expect(runner).toContain("sandbox allow-scripts allow-forms allow-same-origin");
    expect(runner).toContain("connect-src ${connections}");
    expect(runner).toContain('networkMode !== "read-only"');
    expect(runner).toContain('!["GET", "HEAD"].includes');
    expect(runner).toContain('credentials: "omit"');
    expect(runner).toContain("relative(root, target)");
  });

  it("repacks an edited workspace and appends content-hash history", async () => {
    const bundle = await buildEditableSnapshotBundle(capture("<h1>Before</h1>"), adapters);
    const root = await mkdtemp(join(tmpdir(), "editable-snapshot-repack-"));
    const output = join(dirname(root), `${root.split("/").pop()}.zip`);
    try {
      for (const file of bundle.files) {
        const path = join(root, file.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, file.content);
      }
      await writeFile(join(root, "workspace/index.html"), "<h1>After</h1>");
      const result = spawnSync(process.execPath, [join(root, "runner/repack.mjs"), output], {
        cwd: root,
        env: { ...process.env, SNAPSHOT_CHANGE_NOTE: "Changed heading" },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
      expect((await readFile(output)).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
      const history = JSON.parse(await readFile(join(root, "reports/workspace-history.json"), "utf8"));
      expect(history.entries).toHaveLength(2);
      expect(history.entries[1]).toMatchObject({ note: "Changed heading" });
      expect(history.entries[1].files["workspace/index.html"].hash).not.toBe(history.entries[0].files["workspace/index.html"].hash);
      const manifest = JSON.parse(await readFile(join(root, "bundle.json"), "utf8"));
      expect(manifest.resources.find((resource: { localPath: string }) => resource.localPath === "workspace/index.html").hash)
        .toBe(history.entries[1].files["workspace/index.html"].hash);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(output, { force: true });
    }
  });
});
