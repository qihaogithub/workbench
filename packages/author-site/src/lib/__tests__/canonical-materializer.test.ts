import {
  ensureCanonicalRevisionMaterializer,
  getGlobalMaterializer,
  materializeCanonicalWorkspace,
} from "../canonical-materializer";
import { syncActiveWorkspaceToCanonical } from "../workspace-manager";

jest.mock("../workspace-manager", () => ({
  syncActiveWorkspaceToCanonical: jest.fn(() => ({
    success: true,
    workspacePath: "/tmp/project/workspace",
  })),
}));

describe("canonical-materializer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(syncActiveWorkspaceToCanonical).mockReturnValue({
      success: true,
      workspacePath: "/tmp/project/workspace",
    });
  });

  describe("materializeCanonicalWorkspace (同步 API)", () => {
    it("直接调用底层同步实现", () => {
      const result = materializeCanonicalWorkspace({
        projectId: "proj-1",
        workspaceId: "ws-1",
        metadata: { revision: 5, rootHash: "hash-5" },
      });

      expect(result.success).toBe(true);
      expect(result.workspacePath).toBe("/tmp/project/workspace");
      expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledWith(
        "proj-1",
        "ws-1",
        { revision: 5, rootHash: "hash-5" },
      );
    });

    it("不传 metadata 时调用底层同步实现", () => {
      materializeCanonicalWorkspace({
        projectId: "proj-1",
        workspaceId: "ws-1",
      });

      expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledWith(
        "proj-1",
        "ws-1",
      );
    });
  });

  describe("ensureCanonicalRevisionMaterializer (async coalesce)", () => {
    it("单次请求触发一次物化", async () => {
      const result = await ensureCanonicalRevisionMaterializer(
        { projectId: "proj-1", workspaceId: "ws-1", metadata: { revision: 3, rootHash: "h3" } },
        3,
      );

      expect(result.success).toBe(true);
      expect(result.workspacePath).toBe("/tmp/project/workspace");
      expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledTimes(1);
    });

    it("多个并发请求合并为单次物化 (coalesce)", async () => {
      const [r1, r2, r3] = await Promise.all([
        ensureCanonicalRevisionMaterializer(
          { projectId: "proj-1", workspaceId: "ws-1", metadata: { revision: 1, rootHash: "h1" } },
          1,
        ),
        ensureCanonicalRevisionMaterializer(
          { projectId: "proj-1", workspaceId: "ws-1", metadata: { revision: 3, rootHash: "h3" } },
          3,
        ),
        ensureCanonicalRevisionMaterializer(
          { projectId: "proj-1", workspaceId: "ws-1", metadata: { revision: 2, rootHash: "h2" } },
          2,
        ),
      ]);

      // All three should resolve with the same result (coalesced to revision 3)
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);
      expect(r3.success).toBe(true);
      // Only one materialization call should have been made
      expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledTimes(1);
    });

    it("物化失败时所有请求都收到失败结果", async () => {
      jest.mocked(syncActiveWorkspaceToCanonical).mockReturnValue({
        success: false,
        code: "WORKSPACE_STALE",
        error: "当前工作区已过期",
      });

      const [r1, r2] = await Promise.all([
        ensureCanonicalRevisionMaterializer(
          { projectId: "proj-1", workspaceId: "ws-1" },
          1,
        ),
        ensureCanonicalRevisionMaterializer(
          { projectId: "proj-1", workspaceId: "ws-1" },
          2,
        ),
      ]);

      expect(r1.success).toBe(false);
      expect(r1.code).toBe("WORKSPACE_STALE");
      expect(r2.success).toBe(false);
      expect(r2.code).toBe("WORKSPACE_STALE");
    });

    it("不传 targetRevision 时使用默认值 0", async () => {
      await ensureCanonicalRevisionMaterializer({
        projectId: "proj-1",
        workspaceId: "ws-1",
      });

      expect(syncActiveWorkspaceToCanonical).toHaveBeenCalledTimes(1);
    });
  });

  describe("getGlobalMaterializer", () => {
    it("返回全局 materializer 实例", () => {
      const materializer = getGlobalMaterializer();
      expect(materializer).toBeDefined();
      expect(typeof materializer.getCurrentRevision).toBe("function");
    });
  });
});
