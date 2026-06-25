import { fetchScreenshotService, isAbortError } from "../screenshot-service";

describe("screenshot-service proxy helpers", () => {
  const originalFetch = global.fetch;
  const originalTimeout = process.env.SCREENSHOT_PROXY_TIMEOUT_MS;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.SCREENSHOT_PROXY_TIMEOUT_MS;
    } else {
      process.env.SCREENSHOT_PROXY_TIMEOUT_MS = originalTimeout;
    }
    jest.useRealTimers();
  });

  it("请求超时时中止下游 fetch 并透传 requestId", async () => {
    jest.useFakeTimers();
    process.env.SCREENSHOT_PROXY_TIMEOUT_MS = "5";

    const fetchMock = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    global.fetch = fetchMock;

    const request = fetchScreenshotService("/health", { requestId: "req_1" });
    const handledRequest = request.catch((error) => error);
    await jest.advanceTimersByTimeAsync(5);

    const error = await handledRequest;
    expect(error).toMatchObject({ name: "AbortError" });
    expect(isAbortError(error)).toBe(true);
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("x-request-id")).toBe("req_1");
  });
});
