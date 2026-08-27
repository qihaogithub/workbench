describe("HTML sandbox deployment boundary", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  function subject() {
    let module: typeof import("../html-sandbox-execution");
    jest.isolateModules(() => {
      module = require("../html-sandbox-execution") as typeof import("../html-sandbox-execution");
    });
    return module!;
  }

  it("rejects a sandbox hosted on the author origin or its cookie domain", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.HTML_SANDBOX_PUBLIC_ORIGIN = "https://author.example.test";
    expect(subject().resolveHtmlSandboxPublicOrigin("https://author.example.test")).toBeNull();

    process.env.HTML_SANDBOX_PUBLIC_ORIGIN = "https://sandbox.author.example.test";
    expect(subject().resolveHtmlSandboxPublicOrigin("https://author.example.test")).toBeNull();
  });

  it("requires a distinct HTTPS sandbox origin in production", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.HTML_SANDBOX_PUBLIC_ORIGIN = "http://sandbox.example.test";
    expect(subject().resolveHtmlSandboxPublicOrigin("https://author.example.test")).toBeNull();

    process.env.HTML_SANDBOX_PUBLIC_ORIGIN = "https://sandbox.example.test";
    expect(subject().resolveHtmlSandboxPublicOrigin("https://author.example.test")).toBe("https://sandbox.example.test");
  });

  it("fails closed for malformed or non-HTTPS production frame ancestors", () => {
    Object.assign(process.env, { NODE_ENV: "production" });
    process.env.HTML_SANDBOX_FRAME_ANCESTORS = "https://author.example.test https://viewer.example.test/path";
    expect(subject().resolveHtmlSandboxFrameAncestors()).toEqual([]);

    process.env.HTML_SANDBOX_FRAME_ANCESTORS = "http://author.example.test";
    expect(subject().resolveHtmlSandboxFrameAncestors()).toEqual([]);

    process.env.HTML_SANDBOX_FRAME_ANCESTORS = "https://author.example.test https://viewer.example.test";
    expect(subject().resolveHtmlSandboxFrameAncestors()).toEqual([
      "https://author.example.test",
      "https://viewer.example.test",
    ]);
  });
});
