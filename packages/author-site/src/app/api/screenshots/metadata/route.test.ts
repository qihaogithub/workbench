import fs from "fs";
import os from "os";
import path from "path";
import type { NextRequest } from "next/server";

function createRequest(body: unknown): NextRequest {
  return {
    json: async () => body,
  } as NextRequest;
}

class TestResponse {
  status: number;
  headers: { get: (name: string) => string | null };
  private readonly buffer: Buffer;

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
    this.buffer = typeof body === "string" ? Buffer.from(body) : Buffer.alloc(0);
  }

  async json(): Promise<unknown> {
    return JSON.parse(this.buffer.toString("utf-8"));
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

describe("screenshot metadata batch route", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalResponse = global.Response;
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    global.Response = TestResponse as unknown as typeof Response;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "screenshot-metadata-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
    global.Response = originalResponse;
  });

  it("一次聚合返回现有与缺失截图，不依赖截图服务", async () => {
    const projectDir = path.join(tempDir, "screenshots", "proj_1");
    fs.mkdirSync(projectDir, { recursive: true });
    const renderBox = { width: 375, height: 960, fullPage: true };
    fs.writeFileSync(
      path.join(projectDir, "page_1.1111111111111111.png"),
      Buffer.alloc(12_000, 1),
    );
    fs.writeFileSync(
      path.join(projectDir, "page_1.meta.json"),
      JSON.stringify({
        currentHash: "1111111111111111",
        renderBoxes: { "1111111111111111": renderBox },
      }),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createRequest({
        items: [
          { projectId: "proj_1", pageId: "page_1" },
          { projectId: "proj_1", pageId: "page_missing" },
        ],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        items: [
          {
            projectId: "proj_1",
            pageId: "page_1",
            available: true,
            currentHash: "1111111111111111",
            variant: "strict",
            url: "/api/screenshots/file/proj_1/page_1?hash=1111111111111111",
            renderBox,
          },
          {
            projectId: "proj_1",
            pageId: "page_missing",
            available: false,
          },
        ],
      },
    });
  });

  it("拒绝可穿越目录的标识与超限批次", async () => {
    const { POST } = await import("./route");

    const unsafe = await POST(
      createRequest({
        items: [{ projectId: "../secret", pageId: "page_1" }],
      }),
    );
    expect(unsafe.status).toBe(400);

    const oversized = await POST(
      createRequest({
        items: Array.from({ length: 501 }, (_, index) => ({
          projectId: "proj_1",
          pageId: `page_${index}`,
        })),
      }),
    );
    expect(oversized.status).toBe(400);
  });
});
