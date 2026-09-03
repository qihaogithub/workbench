import { EventEmitter } from "node:events";
import * as dns from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { Readable } from "node:stream";

jest.mock("node:dns/promises", () => ({ lookup: jest.fn() }));
jest.mock("node:http", () => ({ request: jest.fn() }));
jest.mock("node:https", () => ({ request: jest.fn() }));

type FakeRequest = EventEmitter & {
  destroy: jest.Mock;
  end: jest.Mock;
  setTimeout: jest.Mock;
};

function fakeRequest(): FakeRequest {
  const request = new EventEmitter() as FakeRequest;
  request.destroy = jest.fn((error?: Error) => {
    if (error) request.emit("error", error);
    return request;
  });
  request.end = jest.fn();
  request.setTimeout = jest.fn();
  return request;
}

function fakeResponse(statusCode: number, body: Readable, headers: Record<string, string> = {}): Readable & { statusCode: number; headers: Record<string, string>; destroy: jest.Mock } {
  const response = body as Readable & { statusCode: number; headers: Record<string, string>; destroy: jest.Mock };
  response.statusCode = statusCode;
  response.headers = headers;
  const destroy = response.destroy.bind(response);
  response.destroy = jest.fn((error?: Error) => destroy(error));
  return response;
}

describe("whiteboard remote image transport", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  function mockDnsHttps(addresses: string[] = ["104.21.95.83"], statusCode = 200) {
    return jest.spyOn(https, "request").mockImplementation(((options: https.RequestOptions, callback: (value: ReturnType<typeof fakeResponse>) => void) => {
      const isDns = options.hostname === "1.1.1.1";
      const type = new URL(`https://cloudflare-dns.com${options.path}`).searchParams.get("type");
      const response = isDns
        ? fakeResponse(statusCode, Readable.from([JSON.stringify({
          Status: 0,
          Answer: type === "1" ? addresses.map((data) => ({ type: 1, data })) : [],
        })]))
        : fakeResponse(200, Readable.from([Buffer.from("image")]), { "content-type": "image/png" });
      process.nextTick(() => callback(response));
      return fakeRequest();
    }) as unknown as typeof https.request);
  }

  it("resolves proxy Fake-IP names independently and connects only to the verified public address", async () => {
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "198.18.3.20", family: 4 }]);
    const requestMock = mockDnsHttps();
    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await expect(downloadWhiteboardImage("https://img.onlywnn.cn/figma/image.png")).resolves.toMatchObject({ buffer: Buffer.from("image") });
    const calls = requestMock.mock.calls.map(([options]) => options as https.RequestOptions);
    expect(calls).toHaveLength(3);
    expect(calls.slice(0, 2)).toEqual(expect.arrayContaining([
      expect.objectContaining({ hostname: "1.1.1.1", servername: "cloudflare-dns.com", path: "/dns-query?name=img.onlywnn.cn&type=1" }),
      expect.objectContaining({ hostname: "1.1.1.1", servername: "cloudflare-dns.com", path: "/dns-query?name=img.onlywnn.cn&type=28" }),
    ]));
    expect(calls[2]).toMatchObject({ hostname: "104.21.95.83", servername: "img.onlywnn.cn", path: "/figma/image.png" });
  });

  it.each([["127.0.0.1"], ["198.18.3.20"], ["104.21.95.83", "10.0.0.1"], []])("rejects unsafe or empty independent DNS answers: %j", async (...addresses) => {
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "198.18.3.20", family: 4 }]);
    const requestMock = mockDnsHttps(addresses);
    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it("does not follow redirects from the fixed DNS provider", async () => {
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "198.19.0.1", family: 4 }]);
    const requestMock = mockDnsHttps([], 302);
    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "DNS_RESOLUTION_FAILED" });
    expect(requestMock).toHaveBeenCalledTimes(2);
  });

  it.each(["http://198.18.3.20/image.png", "http://127.0.0.1/image.png"])("keeps literal non-public addresses blocked: %s", async (url) => {
    const requestMock = mockDnsHttps();
    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await expect(downloadWhiteboardImage(url)).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("does not use public DNS to override real private or mixed local DNS answers", async () => {
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "198.18.3.20", family: 4 }, { address: "10.0.0.1", family: 4 }]);
    const requestMock = mockDnsHttps();
    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
    expect(requestMock).not.toHaveBeenCalled();
  });

  it("bounds the independent DNS response size", async () => {
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "198.18.3.20", family: 4 }]);
    mockDnsHttps(["x".repeat(65 * 1024)]);
    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "DNS_RESOLUTION_FAILED" });
  });

  it("aborts stalled independent DNS requests within the total deadline", async () => {
    jest.useFakeTimers();
    try {
      (dns.lookup as jest.Mock).mockResolvedValue([{ address: "198.18.3.20", family: 4 }]);
      const requests: FakeRequest[] = [];
      jest.spyOn(https, "request").mockImplementation((() => {
        const request = fakeRequest();
        requests.push(request);
        return request;
      }) as unknown as typeof https.request);
      const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
      const pending = expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "DOWNLOAD_TIMEOUT" });
      await jest.advanceTimersByTimeAsync(10_000);
      await pending;
      expect(requests).toHaveLength(2);
      expect(requests.every((request) => request.destroy.mock.calls.length > 0)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it("subtracts DNS time from the remaining image download budget", async () => {
    jest.useFakeTimers();
    try {
      (dns.lookup as jest.Mock).mockImplementation(async () => {
        jest.setSystemTime(Date.now() + 9_000);
        return [{ address: "93.184.216.34", family: 4 }];
      });
      const request = fakeRequest();
      jest.spyOn(https, "request").mockReturnValue(request as unknown as http.ClientRequest);
      const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
      const pending = expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "DOWNLOAD_TIMEOUT" });
      await jest.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(request.destroy).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("stops reading a chunked response as soon as it exceeds 10MB", async () => {
    const response = fakeResponse(
      200,
      Readable.from([Buffer.alloc(9 * 1024 * 1024), Buffer.alloc(2 * 1024 * 1024)]),
      { "content-type": "image/png" },
    );
    const request = fakeRequest();
    jest.spyOn(https, "request").mockImplementation(((options: unknown, callback: (value: typeof response) => void) => {
      process.nextTick(() => callback(response));
      return request;
    }) as unknown as typeof https.request);

    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");

    await expect(downloadWhiteboardImage("https://example.com/image.png")).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
    expect(response.destroy).toHaveBeenCalled();
  });

  it("uses the validated DNS address for the actual HTTPS connection", async () => {
    const response = fakeResponse(200, Readable.from([Buffer.from("image")]), { "content-type": "image/png" });
    const request = fakeRequest();
    const requestMock = jest.spyOn(https, "request").mockImplementation(((options: any, callback: (value: typeof response) => void) => {
      process.nextTick(() => callback(response));
      return request;
    }) as unknown as typeof https.request);

    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
    await downloadWhiteboardImage("https://example.com/image.png");

    const options = requestMock.mock.calls[0]?.[0] as any;
    expect(options.hostname).toBe("93.184.216.34");
    expect(options.servername).toBe("example.com");
    const dnsCallsBeforeSocketLookup = (dns.lookup as jest.Mock).mock.calls.length;
    const lookupCallback = jest.fn();
    options.lookup("example.com", {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
    expect((dns.lookup as jest.Mock).mock.calls.length).toBe(dnsCallsBeforeSocketLookup);
  });

  it("rejects a redirect to a private address before opening another connection", async () => {
    const response = fakeResponse(302, Readable.from([]), { location: "http://127.0.0.1/secret" });
    const request = fakeRequest();
    const requestMock = jest.spyOn(http, "request").mockImplementation(((options: unknown, callback: (value: typeof response) => void) => {
      process.nextTick(() => callback(response));
      return request;
    }) as unknown as typeof http.request);

    const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");

    await expect(downloadWhiteboardImage("http://example.com/redirect")).rejects.toMatchObject({ code: "PRIVATE_NETWORK_BLOCKED" });
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("shares one timeout deadline across redirect hops", async () => {
    jest.useFakeTimers();
    try {
      const firstResponse = fakeResponse(302, Readable.from([]), { location: "http://example.com/next" });
      const firstRequest = fakeRequest();
      const secondRequest = fakeRequest();
      const requestMock = jest.spyOn(http, "request").mockImplementation(((options: any, callback: (value: typeof firstResponse) => void) => {
        if (requestMock.mock.calls.length === 1) callback(firstResponse);
        return requestMock.mock.calls.length === 1 ? firstRequest : secondRequest;
      }) as unknown as typeof http.request);

      const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
      const pending = downloadWhiteboardImage("http://example.com/start");
      await jest.advanceTimersByTimeAsync(0);

      expect(requestMock).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(9_999);
      expect(secondRequest.destroy).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      await expect(pending).rejects.toMatchObject({ code: "DOWNLOAD_TIMEOUT" });
    } finally {
      jest.useRealTimers();
    }
  });

  it("includes DNS resolution in the same total timeout", async () => {
    jest.useFakeTimers();
    try {
      (dns.lookup as jest.Mock).mockImplementation(() => new Promise(() => undefined));
      const { downloadWhiteboardImage } = await import("./whiteboard-image-assets");
      const pending = downloadWhiteboardImage("http://example.com/start");
      await Promise.resolve();
      jest.advanceTimersByTime(10_000);
      await expect(pending).rejects.toMatchObject({ code: "DOWNLOAD_TIMEOUT" });
    } finally {
      jest.useRealTimers();
    }
  });
});
