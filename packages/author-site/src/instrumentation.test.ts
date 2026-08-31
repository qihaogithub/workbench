const cleanupAllExpiredSessions = jest.fn(() => []);
const cleanupOrphanWorkspaces = jest.fn(() => []);
const scheduleStartupBackendProvidersSync = jest.fn();
const scheduleStartupImageDescriptionSync = jest.fn();
const scheduleStartupImageGenSync = jest.fn();
const purgeExpiredTrashedProjects = jest.fn(() => 0);

jest.mock("@/lib/session-manager", () => ({ cleanupAllExpiredSessions }));
jest.mock("@/lib/workspace-manager", () => ({ cleanupOrphanWorkspaces }));
jest.mock("@/lib/project-admin-service", () => ({
  getProjectAdminService: () => ({ purgeExpiredTrashedProjects }),
}));
jest.mock("@/lib/backend-providers-sync", () => ({
  scheduleStartupBackendProvidersSync,
}));
jest.mock("@/lib/image-description-sync", () => ({
  scheduleStartupImageDescriptionSync,
}));
jest.mock("@/lib/image-gen-sync", () => ({ scheduleStartupImageGenSync }));

describe("instrumentation register", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    process.env.NEXT_RUNTIME = "nodejs";
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.NEXT_RUNTIME;
  });

  it("runs the initial cleanup and schedules all startup services in Node runtime", async () => {
    const { register } = await import("./instrumentation");

    await register();

    expect(cleanupAllExpiredSessions).toHaveBeenCalledTimes(1);
    expect(cleanupOrphanWorkspaces).toHaveBeenCalledTimes(1);
    expect(purgeExpiredTrashedProjects).toHaveBeenCalledTimes(1);
    expect(scheduleStartupBackendProvidersSync).toHaveBeenCalledTimes(1);
    expect(scheduleStartupImageDescriptionSync).toHaveBeenCalledTimes(1);
    expect(scheduleStartupImageGenSync).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });
});
