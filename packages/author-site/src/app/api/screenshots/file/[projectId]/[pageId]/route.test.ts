import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

function createRequest(url: string): NextRequest {
  return { nextUrl: new URL(url) } as NextRequest;
}

class TestResponse {
  status: number;
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
    } else if (body instanceof Uint8Array) {
      this.buffer = Buffer.from(body);
    } else if (typeof body === "string") {
      this.buffer = Buffer.from(body);
    } else {
      this.buffer = Buffer.alloc(0);
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

describe("screenshot file route", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshot-file-route-"));
    process.env.DATA_DIR = tempDir;
    jest.doMock("@/lib/screenshot-service", () => ({
      fetchScreenshotService: jest.fn(async () => {
        throw new Error("service unavailable");
      }),
    }));
  });

  afterEach(() => {
    jest.dontMock("@/lib/screenshot-service");
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    global.Response = originalResponse;
  });

  it("截图服务不可用时按 hash 精确读取本地截图", async () => {
    const projectDir = path.join(tempDir, "screenshots", "proj_1");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "page_1.1111111111111111.png"),
      Buffer.from("expected"),
    );
    fs.writeFileSync(
      path.join(projectDir, "page_1.2222222222222222.png"),
      Buffer.from("current"),
    );
    fs.writeFileSync(
      path.join(projectDir, "page_1.meta.json"),
      JSON.stringify({ currentHash: "2222222222222222" }),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createRequest(
        "http://localhost/api/screenshots/file/proj_1/page_1?hash=1111111111111111",
      ),
      { params: { projectId: "proj_1", pageId: "page_1" } },
    );

    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe(
      "expected",
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("指定 hash 不存在时不回退 current 截图", async () => {
    const projectDir = path.join(tempDir, "screenshots", "proj_1");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "page_1.2222222222222222.png"),
      Buffer.from("current"),
    );
    fs.writeFileSync(
      path.join(projectDir, "page_1.meta.json"),
      JSON.stringify({ currentHash: "2222222222222222" }),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createRequest(
        "http://localhost/api/screenshots/file/proj_1/page_1?hash=1111111111111111",
      ),
      { params: { projectId: "proj_1", pageId: "page_1" } },
    );

    expect(response.status).toBe(404);
  });

  it("meta 查询返回本地 currentHash 与 renderBox", async () => {
    const projectDir = path.join(tempDir, "screenshots", "proj_1");
    fs.mkdirSync(projectDir, { recursive: true });
    const renderBox = { width: 375, height: 960, fullPage: true };
    fs.writeFileSync(
      path.join(projectDir, "page_1.meta.json"),
      JSON.stringify({
        currentHash: "1111111111111111",
        renderBoxes: {
          "1111111111111111": renderBox,
        },
      }),
    );

    const { GET } = await import("./route");
    const response = await GET(
      createRequest(
        "http://localhost/api/screenshots/file/proj_1/page_1?meta=1",
      ),
      { params: { projectId: "proj_1", pageId: "page_1" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        currentHash: "1111111111111111",
        url: "/api/screenshots/file/proj_1/page_1?hash=1111111111111111",
        renderBox,
      },
    });
  });
});
