import {
  PROJECT_CLI_FALLBACK_AUTHOR_SITE_URL,
  getProjectCliAuthorSiteUrl,
  resolveProjectCliRequestOrigin,
} from "../project-cli-url";

describe("project-cli-url", () => {
  it("从当前请求头生成 Project Admin CLI 项目地址", () => {
    const headers = new Headers({
      "x-forwarded-host": "workbench.example.com",
      "x-forwarded-proto": "https",
    });

    expect(getProjectCliAuthorSiteUrl(headers)).toBe(
      "https://workbench.example.com",
    );
  });

  it("优先使用当前请求地址而不是静态环境变量", () => {
    const headers = new Headers({
      host: "10.130.33.131:3200",
    });

    expect(
      getProjectCliAuthorSiteUrl(headers, {
        AUTHOR_SITE_URL: "http://localhost:3200",
      }),
    ).toBe("http://10.130.33.131:3200");
  });

  it("缺少请求 host 时回退到部署环境变量", () => {
    expect(
      getProjectCliAuthorSiteUrl(new Headers(), {
        AUTHOR_SITE_URL: "https://configured.example.com///",
      }),
    ).toBe("https://configured.example.com");
  });

  it("没有可用配置时使用本地默认地址", () => {
    expect(getProjectCliAuthorSiteUrl(new Headers(), {})).toBe(
      PROJECT_CLI_FALLBACK_AUTHOR_SITE_URL,
    );
  });

  it("忽略无效 host，避免把异常请求头写入提示词", () => {
    const headers = new Headers({
      "x-forwarded-host": "https://evil.example.com/path",
      host: "localhost:3200",
    });

    expect(resolveProjectCliRequestOrigin(headers)).toBe(
      "http://localhost:3200",
    );
  });
});
