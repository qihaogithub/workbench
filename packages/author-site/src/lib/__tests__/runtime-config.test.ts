import {
  DEFAULT_AGENT_SERVICE_URL,
  DEFAULT_SCREENSHOT_SERVICE_URL,
  getBrowserAgentServiceUrl,
  getInternalApiToken,
  getModelEnvConfig,
  getScreenshotProxyTimeoutMs,
  getScreenshotServiceUrl,
  getServerAgentServiceUrl,
} from "../runtime-config";

describe("runtime-config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AGENT_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_AGENT_SERVICE_URL;
    delete process.env.INTERNAL_API_TOKEN;
    delete process.env.SCREENSHOT_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL;
    delete process.env.SCREENSHOT_PROXY_TIMEOUT_MS;
    delete process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES;
    delete process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS;
    delete process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS;
    delete process.env.NEXT_PUBLIC_MODEL_BLACKLIST;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("为 agent-service URL 提供服务端和浏览器默认值", () => {
    expect(getServerAgentServiceUrl()).toBe(DEFAULT_AGENT_SERVICE_URL);
    expect(getBrowserAgentServiceUrl()).toBe(DEFAULT_AGENT_SERVICE_URL);
  });

  it("读取并规整 agent-service URL", () => {
    process.env.AGENT_SERVICE_URL = "http://agent.local///";
    process.env.NEXT_PUBLIC_AGENT_SERVICE_URL = "http://agent.public///";

    expect(getServerAgentServiceUrl()).toBe("http://agent.local");
    expect(getBrowserAgentServiceUrl()).toBe("http://agent.public");
  });

  it("开发环境缺省使用 dev internal token，生产环境缺省为空", () => {
    process.env = { ...process.env, NODE_ENV: "development" };
    expect(getInternalApiToken()).toBe("dev-internal-token");

    process.env = { ...process.env, NODE_ENV: "production" };
    expect(getInternalApiToken()).toBe("");

    process.env.INTERNAL_API_TOKEN = "secret";
    expect(getInternalApiToken()).toBe("secret");
  });

  it("读取截图服务 URL 和代理超时", () => {
    expect(getScreenshotServiceUrl()).toBe(DEFAULT_SCREENSHOT_SERVICE_URL);
    expect(getScreenshotProxyTimeoutMs()).toBe(30000);

    process.env.SCREENSHOT_SERVICE_URL = "http://screenshot.local/";
    process.env.SCREENSHOT_PROXY_TIMEOUT_MS = "5000";

    expect(getScreenshotServiceUrl()).toBe("http://screenshot.local");
    expect(getScreenshotProxyTimeoutMs()).toBe(5000);
  });

  it("集中解析模型相关浏览器公开环境变量", () => {
    process.env.NEXT_PUBLIC_ALLOWED_MODEL_PREFIXES = "foo/, bar/ ";
    process.env.NEXT_PUBLIC_MODEL_NAME_FILTERS = "foo:pro,bar:free";
    process.env.NEXT_PUBLIC_DEFAULT_MODEL_IDS = "foo/a, bar/b";
    process.env.NEXT_PUBLIC_MODEL_BLACKLIST = "foo/old,bar/test";

    expect(getModelEnvConfig()).toEqual({
      allowedPrefixes: ["foo/", "bar/"],
      nameFilters: ["foo:pro", "bar:free"],
      defaultModelIds: ["foo/a", "bar/b"],
      blacklist: ["foo/old", "bar/test"],
    });
  });
});
