import { describe, expect, it } from "vitest";

import { assertWorkspaceAuthorityInstancePolicy } from "../../src/workspace/workspace-authority-instance-policy";

describe("Workspace Authority instance policy", () => {
  it("默认和显式单实例配置允许启动", () => {
    expect(assertWorkspaceAuthorityInstancePolicy({})).toEqual({ mode: "single", replicaCount: 1 });
    expect(assertWorkspaceAuthorityInstancePolicy({
      WORKSPACE_AUTHORITY_INSTANCE_MODE: "single",
      WORKSPACE_AUTHORITY_REPLICA_COUNT: "1",
    })).toEqual({ mode: "single", replicaCount: 1 });
  });

  it("拒绝多实例、非法副本数和通用 worker 并发", () => {
    expect(() => assertWorkspaceAuthorityInstancePolicy({ WORKSPACE_AUTHORITY_REPLICA_COUNT: "2" }))
      .toThrow("WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED");
    expect(() => assertWorkspaceAuthorityInstancePolicy({ WORKSPACE_AUTHORITY_INSTANCE_MODE: "multi" }))
      .toThrow("WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED");
    expect(() => assertWorkspaceAuthorityInstancePolicy({ WEB_CONCURRENCY: "4" }))
      .toThrow("WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED");
  });
});
