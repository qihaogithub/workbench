import { describe, expect, it, vi } from "vitest";
import { Crepe } from "@milkdown/crepe";

import { buildCrepeConfig, type CrepeProjectActions } from "./crepe-config";
import {
  buildDocumentBlockMenuGroups,
  buildDocumentInsertGroups,
} from "./document-block-menu";
import { LUCIDE_ICONS } from "./lucide-icons";

function createActions(): CrepeProjectActions {
  return {
    uploadImage: vi.fn(async () => "/image.png"),
    uploadVideo: vi.fn(),
    uploadFile: vi.fn(),
    insertReference: vi.fn(),
    openProjectReference: vi.fn(),
  };
}

describe("buildCrepeConfig", () => {
  it("保留标准编辑能力与原生 TopBar，并关闭 Crepe 原生浮层", () => {
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
    });

    expect(config.features?.[Crepe.Feature.Cursor]).toBe(true);
    expect(config.features?.[Crepe.Feature.ImageBlock]).toBe(true);
    expect(config.features?.[Crepe.Feature.BlockEdit]).toBe(false);
    expect(config.features?.[Crepe.Feature.Toolbar]).toBe(false);
    expect(config.features?.[Crepe.Feature.Latex]).toBe(false);
    expect(config.features?.[Crepe.Feature.TopBar]).toBe(true);
    expect(config.features?.[Crepe.Feature.AI]).toBe(false);
  });

  it("允许批注编辑器隐藏固定 TopBar，同时保留本地选区 feature", () => {
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
      showTopBar: false,
    });

    expect(config.features?.[Crepe.Feature.TopBar]).toBe(false);
    expect(config.features?.[Crepe.Feature.Toolbar]).toBe(false);
  });

  it("将块菜单的中文分组与项目操作交给本地 menu API", () => {
    const actions = createActions();
    const groups = buildDocumentBlockMenuGroups({} as never, {
      actions,
      enableUploads: true,
      enableProjectReferences: true,
      referenceCandidates: [{ key: "theme.primary", label: "主题色" }],
    });

    expect(groups.slice(0, 3).map((group) => group.label)).toEqual([
      "文本",
      "列表",
      "插入",
    ]);
    expect(groups.map((group) => group.key)).toEqual([
      "text",
      "list",
      "advanced",
      "project-references",
      "entity-references",
      "more",
    ]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual([
      "正文",
      "H1",
      "H2",
      "H3",
      "引用",
      "分隔线",
    ]);
    expect(groups[3]?.items[0]?.label).toBe("主题色");
    expect(groups[4]?.items[0]?.label).toBe("选择页面 / 配置项 / 文档");
    expect(groups[5]?.label).toBe("更多");
    expect(groups[5]?.items.map((item) => item.label)).toEqual([
      "H4",
      "H5",
      "H6",
      "上传视频",
      "上传附件",
    ]);
  });

  it("支持菜单搜索，并保留原生 TopBar 的中文标题选择器", () => {
    const actions = createActions();
    const filtered = buildDocumentBlockMenuGroups(
      {} as never,
      { actions },
      "列表",
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.items.map((item) => item.label)).toEqual([
      "无序列表",
      "有序列表",
      "任务列表",
    ]);

    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions,
    });
    expect(config.featureConfigs?.[Crepe.Feature.TopBar]).toMatchObject({
      headingOptions: [
        { label: "正文", level: null },
        { label: "H1", level: 1 },
        { label: "H2", level: 2 },
        { label: "H3", level: 3 },
      ],
    });
  });

  it("为 TopBar 提供基础、通用、引用三类插入项，并按能力过滤", () => {
    const actions = createActions();
    const groups = buildDocumentInsertGroups({} as never, {
      actions,
      enableUploads: true,
      enableProjectReferences: true,
      referenceCandidates: [{ key: "theme.primary", label: "主题色" }],
    });

    expect(groups.map((group) => group.label)).toEqual([
      "基础",
      "通用",
      "引用",
    ]);
    expect(groups[0]?.items.map((item) => item.key)).toEqual([
      "text",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "link",
      "bullet-list",
      "ordered-list",
      "task-list",
      "quote",
      "divider",
    ]);
    expect(groups[0]?.items[0]?.icon).toBe(LUCIDE_ICONS.text);
    expect(groups[0]?.items.find((item) => item.key === "h1")?.icon).toBe(
      LUCIDE_ICONS.h1,
    );
    expect(groups[1]?.items.find((item) => item.key === "code")?.icon).toBe(
      LUCIDE_ICONS.codeBlock,
    );
    expect(groups[2]?.items[0]?.icon).toBe(LUCIDE_ICONS.link);
    expect(groups[1]?.items.map((item) => item.key)).toEqual([
      "image",
      "table",
      "code",
      "upload-video",
      "upload-file",
    ]);
    expect(groups[2]?.items.map((item) => item.key)).toEqual([
      "reference-theme.primary",
      "insert-project-reference",
    ]);

    const noUploadGroups = buildDocumentInsertGroups({} as never, {
      actions,
      referenceCandidates: [{ key: "theme.primary", label: "主题色" }],
    });
    expect(noUploadGroups[1]?.items.map((item) => item.key)).toEqual([
      "image",
      "table",
      "code",
    ]);
    expect(
      buildDocumentInsertGroups({} as never, { actions }, "不存在"),
    ).toEqual([]);
    const referenceFiltered = buildDocumentInsertGroups(
      {} as never,
      {
        actions,
        referenceCandidates: [{ key: "theme.primary", label: "主题色" }],
      },
      "配置项",
    );
    expect(referenceFiltered).toHaveLength(1);
    expect(referenceFiltered[0]?.items.map((item) => item.label)).toEqual([
      "主题色",
    ]);
  });

  it("把插入置于 TopBar 首项，并保留链接和块引用直达项", () => {
    type TestGroup = {
      clear: () => TestGroup;
      addItem: (key: string, item?: unknown) => TestGroup;
    };
    type TestBuilder = {
      getGroup: (key: string) => TestGroup;
    };
    const itemGroups = new Map(
      ["heading", "insert", "block", "more"].map((key) => [
        key,
        [] as string[],
      ]),
    );
    const builder: TestBuilder = {
      getGroup(key) {
        const items = itemGroups.get(key)!;
        const group: TestGroup = {
          clear() {
            items.length = 0;
            return group;
          },
          addItem(itemKey) {
            items.push(itemKey);
            return group;
          },
        };
        return group;
      },
    };
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
    });
    const topBar = config.featureConfigs?.[Crepe.Feature.TopBar] as unknown as {
      buildTopBar?: (builder: TestBuilder) => void;
    };
    topBar.buildTopBar?.(builder);

    expect(itemGroups.get("heading")).toEqual([
      "document-insert",
      "document-heading",
    ]);
    expect(itemGroups.get("insert")).toEqual(["link"]);
    expect(itemGroups.get("block")).toEqual([]);
    expect(itemGroups.get("more")).toEqual(["quote"]);
  });
});
