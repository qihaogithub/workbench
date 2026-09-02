import { isCollabDocumentSyncedForDescriptor } from "./useCollabDocument";

describe("isCollabDocumentSyncedForDescriptor", () => {
  it("拒绝在页面切换过渡期消费旧资源的 synced 值", () => {
    expect(
      isCollabDocumentSyncedForDescriptor({
        status: "synced",
        descriptorKey: "project\u0000workspace\u0000session\u0000demos/page-b/config.schema.json\u0000page-schema",
        syncedDescriptorKey:
          "project\u0000workspace\u0000session\u0000demos/page-a/config.schema.json\u0000page-schema",
      }),
    ).toBe(false);
  });

  it("只接受已完成当前资源同步的值", () => {
    const descriptorKey =
      "project\u0000workspace\u0000session\u0000demos/page-b/config.schema.json\u0000page-schema";

    expect(
      isCollabDocumentSyncedForDescriptor({
        status: "synced",
        descriptorKey,
        syncedDescriptorKey: descriptorKey,
      }),
    ).toBe(true);
  });
});
