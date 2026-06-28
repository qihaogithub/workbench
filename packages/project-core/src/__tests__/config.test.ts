import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_AGENT_SERVICE_URL,
  DEFAULT_PROJECT_ADMIN_MAX_BATCH_SIZE,
  DEFAULT_SCREENSHOT_SERVICE_URL,
  getAgentServiceUrl,
  getProjectAdminActorEnv,
  getProjectAdminAuditDir,
  getProjectAdminDataDir,
  getProjectAdminMaxBatchSize,
  getProjectAdminMode,
  getScreenshotServiceUrl,
  getViewerBaseUrl,
} from "../config.js";

describe("project-core config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AGENT_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_AGENT_SERVICE_URL;
    delete process.env.SCREENSHOT_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL;
    delete process.env.VIEWER_CLOUDFLARE_URL;
    delete process.env.VIEWER_LAN_URL;
    delete process.env.DATA_DIR;
    delete process.env.PROJECT_ADMIN_AUDIT_DIR;
    delete process.env.PROJECT_ADMIN_MAX_BATCH_SIZE;
    delete process.env.PROJECT_ADMIN_CLI_MODE;
    delete process.env.PROJECT_ADMIN_ROLE;
    delete process.env.PROJECT_ADMIN_ALLOWED_PROJECTS;
  });

  it("提供 agent 和 screenshot 服务默认地址", () => {
    delete process.env.AGENT_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_AGENT_SERVICE_URL;
    delete process.env.SCREENSHOT_SERVICE_URL;
    delete process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL;

    expect(getAgentServiceUrl()).toBe(DEFAULT_AGENT_SERVICE_URL);
    expect(getScreenshotServiceUrl()).toBe(DEFAULT_SCREENSHOT_SERVICE_URL);
  });

  it("优先读取服务端 URL 并规整尾部斜杠", () => {
    process.env.AGENT_SERVICE_URL = "http://agent.local///";
    process.env.NEXT_PUBLIC_AGENT_SERVICE_URL = "http://agent.public";
    process.env.SCREENSHOT_SERVICE_URL = "http://shot.local///";
    process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL = "http://shot.public";

    expect(getAgentServiceUrl()).toBe("http://agent.local");
    expect(getScreenshotServiceUrl()).toBe("http://shot.local");
  });

  it("读取 viewer 发布地址并规整尾部斜杠", () => {
    process.env.VIEWER_LAN_URL = "http://viewer.lan///";
    expect(getViewerBaseUrl()).toBe("http://viewer.lan");

    process.env.VIEWER_CLOUDFLARE_URL = "https://viewer.example.com///";
    expect(getViewerBaseUrl()).toBe("https://viewer.example.com");
  });

  it("集中读取 Project Admin 运行配置", () => {
    process.env.DATA_DIR = "/tmp/ow-data";
    process.env.PROJECT_ADMIN_AUDIT_DIR = "/tmp/ow-audit";
    process.env.PROJECT_ADMIN_MAX_BATCH_SIZE = "7";
    process.env.PROJECT_ADMIN_CLI_MODE = "local";
    process.env.PROJECT_ADMIN_ROLE = "readonly";
    process.env.PROJECT_ADMIN_ALLOWED_PROJECTS = "proj_a, proj_b";

    expect(getProjectAdminDataDir()).toBe("/tmp/ow-data");
    expect(getProjectAdminAuditDir("/tmp/ow-data")).toBe("/tmp/ow-audit");
    expect(getProjectAdminMaxBatchSize()).toBe(7);
    expect(getProjectAdminMode(true)).toBe("local");
    expect(getProjectAdminActorEnv()).toEqual(
      expect.objectContaining({
        id: process.env.USER ?? "local-codex",
        name: process.env.USER ?? "local-codex",
        role: "readonly",
        allowedProjectIds: ["proj_a", "proj_b"],
      }),
    );
  });

  it("Project Admin 配置缺省值保持兼容", () => {
    expect(getProjectAdminMaxBatchSize()).toBe(
      DEFAULT_PROJECT_ADMIN_MAX_BATCH_SIZE,
    );
    expect(getProjectAdminMode(true)).toBe("cli");
    expect(getProjectAdminMode(false)).toBe("readonly");
  });
});
