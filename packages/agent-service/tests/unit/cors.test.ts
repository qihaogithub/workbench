import { describe, expect, it } from "vitest";

import {
  DOCKER_CORS_ORIGINS,
  LOCAL_CORS_ORIGINS,
  formatCorsOriginWarning,
  getDefaultCorsOrigins,
  parseCorsOrigins,
  resolveCorsConfiguration,
} from "../../src/utils/cors";

describe("agent-service CORS 配置", () => {
  it("按监听端口选择本地和 Docker 默认来源", () => {
    expect(getDefaultCorsOrigins(4201)).toEqual([...LOCAL_CORS_ORIGINS]);
    expect(getDefaultCorsOrigins(3201)).toEqual([...DOCKER_CORS_ORIGINS]);
  });

  it("显式配置作为安全白名单，并去重、清理空白项", () => {
    expect(
      resolveCorsConfiguration({
        port: 4201,
        configuredOrigins:
          " http://example.test, http://example.test,,http://other.test ",
      }).origins,
    ).toEqual(["http://example.test", "http://other.test"]);
  });

  it("空配置回退到端口对应的默认来源", () => {
    expect(resolveCorsConfiguration({ port: 4201, configuredOrigins: "" }).origins).toEqual(
      [...LOCAL_CORS_ORIGINS],
    );
    expect(resolveCorsConfiguration({ port: 3201 }).origins).toEqual([
      ...DOCKER_CORS_ORIGINS,
    ]);
  });

  it("检测本地 agent 端口误用 Docker 来源并指出缺失来源", () => {
    const configuration = resolveCorsConfiguration({
      port: 4201,
      configuredOrigins: DOCKER_CORS_ORIGINS.join(","),
    });

    expect(configuration.warning).toMatchObject({
      expectedProfile: "local",
      conflictingOrigins: [...DOCKER_CORS_ORIGINS],
      missingOrigins: [...LOCAL_CORS_ORIGINS],
    });
    expect(formatCorsOriginWarning(configuration.warning!)).toContain(
      "http://localhost:4200",
    );
  });

  it("不对未知端口的自定义来源发出本地/Docker 错配警告", () => {
    expect(
      resolveCorsConfiguration({
        port: 9001,
        configuredOrigins: "https://app.example.test",
      }).warning,
    ).toBeUndefined();
  });

  it("解析函数对只有分隔符的配置保持默认来源", () => {
    expect(parseCorsOrigins(" ,  , ")).toEqual([]);
    expect(resolveCorsConfiguration({ port: 4201, configuredOrigins: " , " }).origins).toEqual(
      [...LOCAL_CORS_ORIGINS],
    );
  });
});
