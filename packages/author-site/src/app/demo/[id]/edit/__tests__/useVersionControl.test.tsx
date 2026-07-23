import { act, renderHook } from "@testing-library/react";
import { flushWorkspaceCollab } from "@/lib/client-workspace-flush";
import { projectApiClient } from "@/lib/project-api";
import { useVersionControl } from "../hooks/useVersionControl";
import type { SketchPatchVersionSummary } from "@workbench/project-core";

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock("@/lib/client-workspace-flush", () => ({
  flushWorkspaceCollab: jest.fn(),
}));

jest.mock("@/lib/project-api", () => ({
  projectApiClient: {
    createPageVersion: jest.fn(),
    getPageVersionHistory: jest.fn(),
    getPublishStatus: jest.fn(),
    getVersionHistory: jest.fn(),
  },
}));

const mockedFlushWorkspaceCollab =
  flushWorkspaceCollab as jest.MockedFunction<typeof flushWorkspaceCollab>;
const mockedProjectApiClient =
  projectApiClient as jest.Mocked<typeof projectApiClient>;

describe("useVersionControl", () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockedFlushWorkspaceCollab.mockResolvedValue(undefined);
    mockedProjectApiClient.createPageVersion.mockResolvedValue({
      versionId: "pv-1",
      demoId: "page-1",
      savedAt: Date.now(),
      savedBy: "测试用户",
      sessionId: "session-1",
      snapshotPath: "/tmp/page-version",
      fileCount: 2,
    });
    mockedProjectApiClient.getPageVersionHistory.mockResolvedValue({
      projectId: "project-1",
      demoId: "page-1",
      currentVersion: "pv-1",
      versions: [],
      totalVersions: 0,
    });
    mockedProjectApiClient.getPublishStatus.mockResolvedValue({
      projectId: "project-1",
      status: "unpublished_changes",
      publishedVersion: null,
      publishedAt: null,
      currentVersion: "v1",
      hasUnpublishedChanges: true,
    });
    mockedProjectApiClient.getVersionHistory.mockResolvedValue({
      projectId: "project-1",
      currentVersion: "v1",
      versions: [],
      totalVersions: 0,
    });
    fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    } as Response)) as jest.MockedFunction<typeof fetch>;
    global.fetch = fetchMock;
  });

  it("命名页面版本时带上当前草图 patch 摘要", async () => {
    const sketchPatchSummary: SketchPatchVersionSummary = {
      operationCount: 3,
      hasBaseSceneKey: true,
      currentNodeCount: 2,
      targetNodeCount: 4,
    };
    const getSketchPatchSummary = jest.fn(() => sketchPatchSummary);

    const { result } = renderHook(() =>
      useVersionControl({
        demoId: "project-1",
        sessionId: "session-1",
        workspaceId: "workspace-1",
        activeDemoId: "page-1",
        activeDemoIdRef: { current: "page-1" },
        currentUsername: "测试用户",
        code: "export default function Demo() {}",
        schema: "{}",
        validationResult: { isValid: true, errors: [] },
        demoPages: [{ id: "page-1", name: "首页", order: 0, parentId: null, runtimeType: "high-fidelity-react" as const }],
        hasUnsavedChanges: true,
        hasUnsavedCanvasChanges: false,
        isSaving: false,
        applyDemoSnapshot: jest.fn(),
        flushCanvasState: jest.fn().mockResolvedValue(undefined),
        markCanvasChangesSaved: jest.fn(),
        setActiveDemoId: jest.fn(),
        setDemoPages: jest.fn(),
        setDemoFolders: jest.fn(),
        setProjectConfigSchema: jest.fn(),
        setPageCodes: jest.fn(),
        setHasUnsavedChanges: jest.fn(),
        setIsSaving: jest.fn(),
        getSketchPatchSummary,
      }),
    );

    await act(async () => {
      await result.current.handleCreateVersion();
    });

    expect(getSketchPatchSummary).toHaveBeenCalledWith("page-1");
    expect(mockedProjectApiClient.createPageVersion).toHaveBeenCalledWith(
      "project-1",
      "page-1",
      {
        sessionId: "session-1",
        note: "修改了首页",
        sketchPatchSummary,
      },
    );
  });
});
