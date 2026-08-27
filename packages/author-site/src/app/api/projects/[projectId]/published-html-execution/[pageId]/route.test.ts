import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

describe("published HTML execution issuance", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalOrigin = process.env.HTML_SANDBOX_PUBLIC_ORIGIN;
  let dataDir: string;

  beforeEach(() => {
    jest.resetModules();
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "published-html-"));
    process.env.DATA_DIR = dataDir;
    process.env.HTML_SANDBOX_PUBLIC_ORIGIN = "https://sandbox.example.test";
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    jest.resetModules();
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalOrigin === undefined) delete process.env.HTML_SANDBOX_PUBLIC_ORIGIN;
    else process.env.HTML_SANDBOX_PUBLIC_ORIGIN = originalOrigin;
  });

  async function fixture() {
    const { HTML_IMPORT_ANALYSIS_VERSION, normalizeHtmlImport } = await import("@workbench/project-core");
    const html = "<!doctype html><html><body><button onclick=\"this.textContent='ok'\">go</button></body></html>";
    const normalized = normalizeHtmlImport(html);
    if (normalized.analysis.outcome.status !== "accepted" || !normalized.normalizedHash || !normalized.normalizedHtml) throw new Error("fixture rejected");
    const projectId = "project-1";
    const pageId = "page-1";
    const version = "v-1";
    const meta = {
      source: "html-import" as const,
      analysisVersion: HTML_IMPORT_ANALYSIS_VERSION,
      sourceHash: normalized.analysis.sourceHash,
      normalizedHash: normalized.normalizedHash,
      sandboxPolicyVersion: 1,
    };
    const publishedDir = path.join(dataDir, "published", projectId);
    const privateDir = path.join(dataDir, "html-sandbox-published", projectId, version);
    fs.mkdirSync(publishedDir, { recursive: true });
    fs.mkdirSync(privateDir, { recursive: true });
    fs.writeFileSync(path.join(publishedDir, "project.json"), JSON.stringify({
      id: projectId,
      publishedVersion: version,
      demoPages: [{ id: pageId, runtimeType: "sandboxed-html", sandboxExecutionPath: `/api/projects/${projectId}/published-html-execution/${pageId}?version=${version}`, htmlImportMeta: meta }],
    }));
    fs.writeFileSync(path.join(privateDir, "source-a.html"), normalized.normalizedHtml);
    fs.writeFileSync(path.join(privateDir, "manifest.json"), JSON.stringify({ version: 1, projectId, publishedVersion: version, pages: { [pageId]: { sourceKey: "source-a", fileName: "source-a.html", htmlImportMeta: meta } } }));
    return { projectId, pageId, version };
  }

  it("签发短时 ticket 且不返回源码", async () => {
    const input = await fixture();
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest(`https://author.example.test/api/projects/${input.projectId}/published-html-execution/${input.pageId}?version=${input.version}`, { method: "POST" }),
      { params: Promise.resolve(input) },
    );
    const body = await response.json() as { success: boolean; data?: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data?.executionUrl).toEqual(expect.stringContaining("https://sandbox.example.test/api/html-sandbox/executions/"));
    expect(body.data).not.toHaveProperty("html");
  });

  it("拒绝版本或 manifest 交叉校验不一致", async () => {
    const input = await fixture();
    const { POST } = await import("./route");
    const response = await POST(
      new NextRequest(`https://author.example.test/api/projects/${input.projectId}/published-html-execution/${input.pageId}?version=wrong`, { method: "POST" }),
      { params: Promise.resolve({ ...input, version: "wrong" }) },
    );
    expect(response.status).toBe(404);
  });
});
