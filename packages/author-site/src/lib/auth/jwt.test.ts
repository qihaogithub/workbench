import { cookies, headers } from "next/headers";

import {
  extractBearerToken,
  getAuthCookie,
  getAuthCookieName,
} from "./jwt";

jest.mock("next/headers", () => ({
  cookies: jest.fn(),
  headers: jest.fn(),
}));

// jwt.test.ts exercises token extraction only; keep the ESM-only jose module
// out of Jest's CommonJS transform path.
jest.mock("jose", () => ({
  SignJWT: jest.fn(),
  jwtVerify: jest.fn(),
}));

const mockCookies = jest.mocked(cookies);
const mockHeaders = jest.mocked(headers);

describe("request authentication token extraction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AUTH_COOKIE_NAME;
    mockCookies.mockResolvedValue({
      get: jest.fn(() => undefined),
    } as never);
    mockHeaders.mockResolvedValue({
      get: jest.fn(() => null),
    } as never);
  });

  it("parses only a non-empty Bearer authorization value", () => {
    expect(extractBearerToken("Bearer abc")).toBe("abc");
    expect(extractBearerToken("bearer abc")).toBe("abc");
    expect(extractBearerToken("Basic abc")).toBeUndefined();
    expect(extractBearerToken("Bearer ")).toBeUndefined();
  });

  it("prefers the configured cookie and falls back to Bearer", async () => {
    const cookieGet = jest.fn((name: string) =>
      name === "auth_token" ? { value: "cookie-token" } : undefined,
    );
    mockCookies.mockResolvedValue({ get: cookieGet } as never);
    mockHeaders.mockResolvedValue({
      get: jest.fn(() => "Bearer bearer-token"),
    } as never);

    await expect(getAuthCookie()).resolves.toBe("cookie-token");
    expect(cookieGet).toHaveBeenCalledWith(getAuthCookieName());
    expect(mockHeaders).not.toHaveBeenCalled();

    mockCookies.mockResolvedValue({ get: jest.fn(() => undefined) } as never);
    await expect(getAuthCookie()).resolves.toBe("bearer-token");
    expect(mockHeaders).toHaveBeenCalledTimes(1);
  });

  it("uses AUTH_COOKIE_NAME before falling back to Bearer", async () => {
    process.env.AUTH_COOKIE_NAME = "auth_token_docker";
    const cookieGet = jest.fn(() => ({ value: "docker-cookie" }));
    mockCookies.mockResolvedValue({ get: cookieGet } as never);

    await expect(getAuthCookie()).resolves.toBe("docker-cookie");
    expect(cookieGet).toHaveBeenCalledWith("auth_token_docker");
  });
});
