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
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
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
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

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
