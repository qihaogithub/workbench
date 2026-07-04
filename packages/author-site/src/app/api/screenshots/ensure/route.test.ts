import fs from "fs";
import os from "os";
import path from "path";
import { ReadableStream as NodeReadableStream } from "stream/web";
import type { NextRequest } from "next/server";

function createRequest(body: unknown): NextRequest {
  return {
    json: jest.fn(async () => body),
  } as unknown as NextRequest;
}

class TestResponse {
  status: number;
  readonly body: ReadableStream<Uint8Array> | null;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;
  private readonly streamBody?: ReadableStream<Uint8Array>;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    this.status = init?.status ?? 200;
    const headers = new Map<string, string>();
    if (init?.headers) {
      for (const [key, value] of Object.entries(
        init.headers as Record<string, string>,
      )) {
        headers.set(key.toLowerCase(), value);
      }
    }
    this.headers = {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    };
    if (body && typeof body === "object" && "getReader" in body) {
      this.buffer = Buffer.alloc(0);
      this.streamBody = body as ReadableStream<Uint8Array>;
      this.body = this.streamBody;
    } else {
      this.buffer =
        typeof body === "string"
          ? Buffer.from(body)
          : body instanceof Uint8Array
            ? Buffer.from(body)
            : Buffer.alloc(0);
      this.body = new NodeReadableStream<Uint8Array>({
        start: (controller) => {
          controller.enqueue(new Uint8Array(this.buffer));
          controller.close();
        },
      }) as unknown as ReadableStream<Uint8Array>;
    }
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    if (this.streamBody) {
      const chunks: Uint8Array[] = [];
      const reader = this.streamBody.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return new Uint8Array(Buffer.concat(chunks)).buffer;
    }
    return new Uint8Array(this.buffer).buffer;
  }

  async json(): Promise<unknown> {
    const buffer = Buffer.from(await this.arrayBuffer());
    return JSON.parse(buffer.toString("utf-8"));
  }

  static json(body: unknown, init?: ResponseInit): TestResponse {
    return new TestResponse(JSON.stringify(body), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  }
}

function writeProjectPage(
  dataDir: string,
  options: {
    projectId: string;
    pageId: string;
    code?: string;
    runtimeType?: "prototype-html-css" | "high-fidelity-react";
    prototypeHtml?: string;
    prototypeCss?: string;
    prototypeMeta?: Record<string, unknown>;
    pageSchema?: Record<string, unknown>;
    projectSchema?: Record<string, unknown>;
  },
): void {
  const workspacePath = path.join(
    dataDir,
    "projects",
    options.projectId,
    "workspace",
  );
  const pagePath = path.join(workspacePath, "demos", options.pageId);
  fs.mkdirSync(pagePath, { recursive: true });
  if (options.runtimeType !== "prototype-html-css") {
    fs.writeFileSync(
      path.join(pagePath, "index.tsx"),
      options.code ?? "export default function Demo(){ return <div>ok</div>; }",
      "utf-8",
    );
  }
  if (options.runtimeType === "prototype-html-css") {
    fs.writeFileSync(
      path.join(pagePath, "prototype.html"),
      options.prototypeHtml ?? "<main>{{brand}}</main>",
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pagePath, "prototype.css"),
      options.prototypeCss ?? "main { width: 100vw; }",
      "utf-8",
    );
    if (options.prototypeMeta) {
      fs.writeFileSync(
        path.join(pagePath, "prototype.meta.json"),
        JSON.stringify(options.prototypeMeta),
        "utf-8",
      );
    }
    fs.writeFileSync(
      path.join(workspacePath, "workspace-tree.json"),
      JSON.stringify({
        folders: [],
        pages: [
          {
            id: options.pageId,
            name: options.pageId,
            order: 0,
            parentId: null,
            runtimeType: "prototype-html-css",
          },
        ],
      }),
      "utf-8",
    );
  }
  fs.writeFileSync(
    path.join(pagePath, "config.schema.json"),
    JSON.stringify(
      options.pageSchema ?? {
        $demo: { previewSize: { width: 1024, height: 768 } },
        type: "object",
        properties: {
          image: { type: "string", default: "https://example.com/a.png" },
        },
      },
    ),
    "utf-8",
  );
  if (options.projectSchema) {
    fs.writeFileSync(
      path.join(workspacePath, "project.config.schema.json"),
      JSON.stringify(options.projectSchema),
      "utf-8",
    );
  }
}

function writeScreenshotCache(
  dataDir: string,
  options: {
    projectId: string;
    pageId: string;
    hash?: string;
    hashSize?: number;
    currentSize?: number;
    writeCurrent?: boolean;
  },
): void {
  const hash = options.hash ?? "1111111111111111";
  const screenshotDir = path.join(dataDir, "screenshots", options.projectId);
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.writeFileSync(
    path.join(screenshotDir, `${options.pageId}.meta.json`),
    JSON.stringify({ currentHash: hash }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(screenshotDir, `${options.pageId}.${hash}.png`),
    Buffer.alloc(options.hashSize ?? 10_000),
  );
  if (options.writeCurrent ?? true) {
    fs.writeFileSync(
      path.join(screenshotDir, `${options.pageId}.png`),
      Buffer.alloc(options.currentSize ?? 10_000),
    );
  }
}

describe("screenshots ensure route", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalFetch = global.fetch;
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshots-ensure-"));
    process.env.DATA_DIR = tempDir;
    global.fetch = jest.fn(
      async () => new TestResponse(JSON.stringify({ success: true })),
    ) as unknown as typeof fetch;
    jest.doMock("@/lib/runtime-config", () => ({
      getScreenshotServiceUrl: () => "http://screenshot-service",
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/runtime-config");
    fs.rmSync(tempDir, { recursive: true, force: true });
    global.fetch = originalFetch;
    global.Response = originalResponse;
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
  });

  it("按 schema 默认值和 previewSize 组装缩略图截图请求", async () => {
    writeProjectPage(tempDir, {
      projectId: "proj_1",
      pageId: "page_1",
      projectSchema: {
        type: "object",
        properties: {
          brand: { type: "string", default: "OneFlow" },
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(createRequest({ projectId: "proj_1" }));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://screenshot-service/api/screenshots/generate-batch",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(body).toEqual({
      projectId: "proj_1",
      pages: [
        expect.objectContaining({
          pageId: "page_1",
          configData: {
            brand: "OneFlow",
            image: "https://example.com/a.png",
          },
          width: 1024,
          height: 768,
          fullPage: true,
          priority: "thumbnail",
          renderMode: "strict",
          force: true,
        }),
      ],
    });
  });

  it("已有健康 hash 截图时不重新生成", async () => {
    writeProjectPage(tempDir, { projectId: "proj_1", pageId: "page_1" });
    writeScreenshotCache(tempDir, {
      projectId: "proj_1",
      pageId: "page_1",
    });

    const { POST } = await import("./route");
    const response = await POST(createRequest({ projectId: "proj_1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { generated: 0, total: 1 },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("原型页按 runtimeType 组装 HTML/CSS 截图请求", async () => {
    writeProjectPage(tempDir, {
      projectId: "proj_proto",
      pageId: "prototype_1",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main>{{brand}}</main>",
      prototypeCss: "main { color: red; }",
      prototypeMeta: { width: 375, updatedAt: 123 },
      projectSchema: {
        type: "object",
        properties: {
          brand: { type: "string", default: "OneFlow" },
        },
      },
    });

    const { POST } = await import("./route");
    const response = await POST(createRequest({ projectId: "proj_proto" }));

    expect(response.status).toBe(200);
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(body.pages[0]).toMatchObject({
      pageId: "prototype_1",
      runtimeType: "prototype-html-css",
      prototypeHtml: "<main>{{brand}}</main>",
      prototypeCss: "main { color: red; }",
      prototypeMeta: { width: 375, updatedAt: 123 },
      configData: {
        brand: "OneFlow",
        image: "https://example.com/a.png",
      },
      fullPage: true,
      priority: "thumbnail",
      renderMode: "strict",
      force: true,
    });
  });

  it("current 文件缺失或明显异常小时会强制重新生成", async () => {
    writeProjectPage(tempDir, { projectId: "proj_1", pageId: "missing_current" });
    writeScreenshotCache(tempDir, {
      projectId: "proj_1",
      pageId: "missing_current",
      writeCurrent: false,
    });
    writeProjectPage(tempDir, { projectId: "proj_1", pageId: "tiny_current" });
    writeScreenshotCache(tempDir, {
      projectId: "proj_1",
      pageId: "tiny_current",
      currentSize: 1024,
    });

    const { POST } = await import("./route");
    const response = await POST(createRequest({ projectId: "proj_1" }));

    expect(response.status).toBe(200);
    const body = JSON.parse(
      (global.fetch as jest.Mock).mock.calls[0][1].body,
    );
    expect(body.pages.map((page: { pageId: string; force: boolean }) => page))
      .toEqual([
        expect.objectContaining({ pageId: "missing_current", force: true }),
        expect.objectContaining({ pageId: "tiny_current", force: true }),
      ]);
  });
});
