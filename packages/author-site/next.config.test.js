describe("author-site Next development origins", () => {
  const originalAllowedOrigins = process.env.NEXT_ALLOWED_DEV_ORIGINS;

  afterEach(() => {
    if (originalAllowedOrigins === undefined) {
      delete process.env.NEXT_ALLOWED_DEV_ORIGINS;
    } else {
      process.env.NEXT_ALLOWED_DEV_ORIGINS = originalAllowedOrigins;
    }
    jest.resetModules();
  });

  it("passes configured frpc hosts to Next without protocol or port rewriting", () => {
    process.env.NEXT_ALLOWED_DEV_ORIGINS =
      "39.104.66.49, 39.104.66.49, tunnel.example.test";
    jest.resetModules();

    const config = require("./next.config");

    expect(config.allowedDevOrigins).toEqual([
      "39.104.66.49",
      "tunnel.example.test",
    ]);
  });

  it("allows a 200MiB session asset plus its multipart envelope to reach route handlers", () => {
    const config = require("./next.config");

    expect(config.experimental?.proxyClientMaxBodySize).toBe(201 * 1024 * 1024);
  });
});
