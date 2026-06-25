"use client";

import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { useScreenshotGeneration } from "./useScreenshotGeneration";

function getFetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return input.toString();
}

function jsonFetchResponse(body: unknown, init?: { status?: number }): Response {
  const status = init?.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const renderBox = {
  width: 375,
  height: 960,
  viewportWidth: 375,
  viewportHeight: 812,
  bodyWidth: 375,
  bodyHeight: 960,
  documentWidth: 375,
  documentHeight: 960,
  fullPage: true,
};

describe("useScreenshotGeneration", () => {
  const originalFetch = global.fetch;
  const originalWindowFetch = window.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    window.fetch = originalWindowFetch;
  });

  it("批量截图完成后使用 hash URL 更新页面状态", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = getFetchUrl(input);
      if (url.includes("/api/screenshots/health")) {
        return jsonFetchResponse({ success: true });
      }
      if (url.includes("/api/screenshots/generate-batch")) {
        return jsonFetchResponse({
          success: true,
          data: {
            batchId: "batch_1",
            results: [
              {
                pageId: "page_1",
                hash: "1111111111111111",
                status: "pending",
              },
            ],
          },
        });
      }
      if (url.includes("/api/screenshots/status/proj_1/batch_1")) {
        return jsonFetchResponse({
          success: true,
          data: {
            status: "completed",
            cancelled: false,
            results: [
              {
                pageId: "page_1",
                url: "/api/screenshots/file/proj_1/page_1",
                hash: "1111111111111111",
                renderBox,
                status: "done",
              },
            ],
          },
        });
      }
      if (url.includes("/api/screenshots/cancel/proj_1/batch_1")) {
        return jsonFetchResponse({ success: true });
      }
      return jsonFetchResponse({ success: false }, { status: 404 });
    }) as jest.Mock;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result, unmount } = renderHook(() =>
      useScreenshotGeneration({ projectId: "proj_1" }),
    );

    await act(async () => {
      await result.current.startBatchGeneration([
        {
          pageId: "page_1",
          code: "export default function Demo() { return null; }",
          configData: {},
        },
      ]);
    });
    await waitFor(() => {
      expect(result.current.pageScreenshots.page_1).toMatchObject({
        screenshotUrl:
          "/api/screenshots/file/proj_1/page_1?hash=1111111111111111",
        hash: "1111111111111111",
        expectedHash: "1111111111111111",
        renderBox,
        loading: false,
      });
    });

    unmount();
  });

  it("批量状态 hash 与 expectedHash 不一致时忽略旧结果", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = getFetchUrl(input);
      if (url.includes("/api/screenshots/health")) {
        return jsonFetchResponse({ success: true });
      }
      if (url.includes("/api/screenshots/generate-batch")) {
        return jsonFetchResponse({
          success: true,
          data: {
            batchId: "batch_1",
            results: [
              {
                pageId: "page_1",
                hash: "1111111111111111",
                status: "pending",
              },
            ],
          },
        });
      }
      if (url.includes("/api/screenshots/status/proj_1/batch_1")) {
        return jsonFetchResponse({
          success: true,
          data: {
            status: "completed",
            cancelled: false,
            results: [
              {
                pageId: "page_1",
                url: "/api/screenshots/file/proj_1/page_1",
                hash: "2222222222222222",
                status: "done",
              },
            ],
          },
        });
      }
      if (url.includes("/api/screenshots/cancel/proj_1/batch_1")) {
        return jsonFetchResponse({ success: true });
      }
      return jsonFetchResponse({ success: false }, { status: 404 });
    }) as jest.Mock;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result, unmount } = renderHook(() =>
      useScreenshotGeneration({ projectId: "proj_1" }),
    );

    await act(async () => {
      await result.current.startBatchGeneration([
        {
          pageId: "page_1",
          code: "export default function Demo() { return null; }",
          configData: {},
        },
      ]);
    });
    await waitFor(() => {
      expect(result.current.pageScreenshots.page_1).toMatchObject({
        expectedHash: "1111111111111111",
      });
    });
    expect(result.current.pageScreenshots.page_1.screenshotUrl).toBeUndefined();
    expect(result.current.pageScreenshots.page_1.hash).toBeUndefined();

    unmount();
  });

  it("单页重新截图期间清除旧截图直到新 hash 返回", async () => {
    let resolveSecondGenerate: ((response: Response) => void) | undefined;
    let generateCount = 0;
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = getFetchUrl(input);
      if (url.includes("/api/screenshots/health")) {
        return jsonFetchResponse({ success: true });
      }
      if (url.includes("/api/screenshots/generate")) {
        generateCount += 1;
        if (generateCount === 1) {
          return jsonFetchResponse({
            success: true,
            data: {
              url: "/api/screenshots/file/proj_1/page_1",
              hash: "1111111111111111",
              renderBox,
            },
          });
        }

        return new Promise<Response>((resolve) => {
          resolveSecondGenerate = resolve;
        });
      }
      return jsonFetchResponse({ success: false }, { status: 404 });
    }) as jest.Mock;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result, unmount } = renderHook(() =>
      useScreenshotGeneration({ projectId: "proj_1" }),
    );

    await act(async () => {
      await result.current.regeneratePage(
        "page_1",
        "export default function Demo() { return null; }",
        { title: "old" },
      );
    });
    await waitFor(() => {
      expect(result.current.pageScreenshots.page_1).toMatchObject({
        screenshotUrl:
          "/api/screenshots/file/proj_1/page_1?hash=1111111111111111",
        hash: "1111111111111111",
        expectedHash: "1111111111111111",
        renderBox,
        loading: false,
      });
    });

    act(() => {
      void result.current.regeneratePage(
        "page_1",
        "export default function Demo() { return null; }",
        { title: "new" },
      );
    });

    await waitFor(() => {
      expect(result.current.pageScreenshots.page_1).toMatchObject({
        loading: true,
      });
    });
    expect(result.current.pageScreenshots.page_1.screenshotUrl).toBeUndefined();
    expect(result.current.pageScreenshots.page_1.hash).toBeUndefined();

    await act(async () => {
      resolveSecondGenerate?.(
        jsonFetchResponse({
          success: true,
          data: {
            url: "/api/screenshots/file/proj_1/page_1",
            hash: "2222222222222222",
            renderBox,
          },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.pageScreenshots.page_1).toMatchObject({
        screenshotUrl:
          "/api/screenshots/file/proj_1/page_1?hash=2222222222222222",
        hash: "2222222222222222",
        expectedHash: "2222222222222222",
        renderBox,
        loading: false,
      });
    });

    unmount();
  });

  it("截图失效后忽略旧单页请求返回", async () => {
    let resolveSecondGenerate: ((response: Response) => void) | undefined;
    let generateCount = 0;
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = getFetchUrl(input);
      if (url.includes("/api/screenshots/health")) {
        return jsonFetchResponse({ success: true });
      }
      if (url.includes("/api/screenshots/generate")) {
        generateCount += 1;
        if (generateCount === 1) {
          return jsonFetchResponse({
            success: true,
            data: {
              url: "/api/screenshots/file/proj_1/page_1",
              hash: "1111111111111111",
              renderBox,
            },
          });
        }

        return new Promise<Response>((resolve) => {
          resolveSecondGenerate = resolve;
        });
      }
      return jsonFetchResponse({ success: false }, { status: 404 });
    }) as jest.Mock;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result, unmount } = renderHook(() =>
      useScreenshotGeneration({ projectId: "proj_1" }),
    );

    await act(async () => {
      await result.current.regeneratePage(
        "page_1",
        "export default function Demo() { return null; }",
        { title: "old" },
      );
    });

    act(() => {
      void result.current.regeneratePage(
        "page_1",
        "export default function Demo() { return null; }",
        { title: "old request" },
      );
      result.current.invalidatePageScreenshot("page_1");
    });

    expect(result.current.pageScreenshots.page_1.screenshotUrl).toBeUndefined();
    expect(result.current.pageScreenshots.page_1.hash).toBeUndefined();

    await act(async () => {
      resolveSecondGenerate?.(
        jsonFetchResponse({
          success: true,
          data: {
            url: "/api/screenshots/file/proj_1/page_1",
            hash: "2222222222222222",
            renderBox,
          },
        }),
      );
    });

    expect(result.current.pageScreenshots.page_1.screenshotUrl).toBeUndefined();
    expect(result.current.pageScreenshots.page_1.hash).toBeUndefined();

    unmount();
  });

  it("单页截图请求会透传 fullPage", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = getFetchUrl(input);
      if (url.includes("/api/screenshots/health")) {
        return jsonFetchResponse({ success: true });
      }
      if (url.includes("/api/screenshots/generate")) {
        return jsonFetchResponse({
          success: true,
          data: {
            url: "/api/screenshots/file/proj_1/page_1",
            hash: "1111111111111111",
            renderBox,
          },
        });
      }
      return jsonFetchResponse({ success: false }, { status: 404 });
    }) as jest.Mock;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result, unmount } = renderHook(() =>
      useScreenshotGeneration({ projectId: "proj_1" }),
    );

    await act(async () => {
      await result.current.regeneratePage(
        "page_1",
        "export default function Demo() { return null; }",
        {},
        375,
        812,
        true,
      );
    });

    const generateCall = fetchMock.mock.calls.find(([input]) =>
      getFetchUrl(input).includes("/api/screenshots/generate"),
    );
    expect(generateCall).toBeTruthy();
    const requestInit = generateCall?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      projectId: "proj_1",
      pageId: "page_1",
      width: 375,
      height: 812,
      fullPage: true,
    });

    unmount();
  });

  it("批量截图请求会透传页面预览尺寸", async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = getFetchUrl(input);
      if (url.includes("/api/screenshots/health")) {
        return jsonFetchResponse({ success: true });
      }
      if (url.includes("/api/screenshots/generate-batch")) {
        return jsonFetchResponse({
          success: true,
          data: {
            batchId: "batch_1",
            results: [
              {
                pageId: "page_1",
                hash: "1111111111111111",
                status: "pending",
              },
            ],
          },
        });
      }
      if (url.includes("/api/screenshots/status/proj_1/batch_1")) {
        return jsonFetchResponse({
          success: true,
          data: {
            status: "completed",
            cancelled: false,
            results: [],
          },
        });
      }
      if (url.includes("/api/screenshots/cancel/proj_1/batch_1")) {
        return jsonFetchResponse({ success: true });
      }
      return jsonFetchResponse({ success: false }, { status: 404 });
    }) as jest.Mock;
    global.fetch = fetchMock;
    window.fetch = fetchMock;
    globalThis.fetch = fetchMock;

    const { result, unmount } = renderHook(() =>
      useScreenshotGeneration({ projectId: "proj_1" }),
    );

    await act(async () => {
      await result.current.startBatchGeneration([
        {
          pageId: "page_1",
          code: "export default function Demo() { return null; }",
          configData: {},
          width: 750,
          height: 1624,
        },
      ]);
    });

    const generateCall = fetchMock.mock.calls.find(([input]) =>
      getFetchUrl(input).includes("/api/screenshots/generate-batch"),
    );
    expect(generateCall).toBeTruthy();
    const requestInit = generateCall?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      projectId: "proj_1",
      pages: [
        {
          pageId: "page_1",
          width: 750,
          height: 1624,
        },
      ],
    });

    unmount();
  });
});
