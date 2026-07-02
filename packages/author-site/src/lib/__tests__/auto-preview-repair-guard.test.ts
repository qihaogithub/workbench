import {
  AUTO_PREVIEW_REPAIR_HISTORY_KEY,
  buildAutoPreviewRepairFingerprint,
  getAutoPreviewRepairAttemptCount,
  recordAutoPreviewRepairAttempt,
} from "../auto-preview-repair-guard";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("auto preview repair guard", () => {
  it("persists attempts by project page and diagnostic fingerprint across remounts", () => {
    const storage = new MemoryStorage();
    const memoryCounts = new Map<string, number>();
    const fingerprint = buildAutoPreviewRepairFingerprint({
      projectId: "proj-1",
      pageId: "page-1",
      diagnostic: {
        source: "post_generation_validation",
        stage: "module_parse",
        code: "DUPLICATE_TOP_LEVEL_DECLARATION",
        file: "demos/page-1/index.tsx",
        message: "顶层声明 phoneAssetBase 重复，浏览器会拒绝导入该模块",
        codeHash: "hash-a",
      },
    });

    expect(
      getAutoPreviewRepairAttemptCount(fingerprint, memoryCounts, {
        storage,
        now: 1000,
      }),
    ).toBe(0);

    expect(
      recordAutoPreviewRepairAttempt(fingerprint, memoryCounts, {
        storage,
        now: 1000,
      }),
    ).toBe(1);
    expect(
      recordAutoPreviewRepairAttempt(fingerprint, memoryCounts, {
        storage,
        now: 2000,
      }),
    ).toBe(2);

    expect(
      getAutoPreviewRepairAttemptCount(fingerprint, new Map(), {
        storage,
        now: 3000,
      }),
    ).toBe(2);
  });

  it("uses code hash changes as a new repair fingerprint", () => {
    const first = buildAutoPreviewRepairFingerprint({
      projectId: "proj-1",
      pageId: "page-1",
      diagnostic: {
        code: "DUPLICATE_TOP_LEVEL_DECLARATION",
        message: "顶层声明 phoneAssetBase 重复",
        codeHash: "hash-a",
      },
    });
    const second = buildAutoPreviewRepairFingerprint({
      projectId: "proj-1",
      pageId: "page-1",
      diagnostic: {
        code: "DUPLICATE_TOP_LEVEL_DECLARATION",
        message: "顶层声明 phoneAssetBase 重复",
        codeHash: "hash-b",
      },
    });

    expect(first).not.toBe(second);
  });

  it("ignores expired stored attempts", () => {
    const storage = new MemoryStorage();
    const fingerprint = "proj-1::page-1::hash-a";
    storage.setItem(
      AUTO_PREVIEW_REPAIR_HISTORY_KEY,
      JSON.stringify({
        version: 1,
        entries: {
          [fingerprint]: {
            count: 2,
            updatedAt: 1000,
          },
        },
      }),
    );

    expect(
      getAutoPreviewRepairAttemptCount(fingerprint, new Map(), {
        storage,
        now: 8 * 24 * 60 * 60 * 1000,
      }),
    ).toBe(0);
  });
});
