import { describe, expect, it, vi } from "vitest";
import { Crepe } from "@milkdown/crepe";

import { buildCrepeConfig, type CrepeProjectActions } from "./crepe-config";
import { buildDocumentBlockMenuGroups } from "./document-block-menu";

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
    expect(groups[4]?.items[0]?.label).toBe("选择项目 / 页面 / 文档");
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
        { label: "H4", level: 4 },
        { label: "H5", level: 5 },
        { label: "H6", level: 6 },
      ],
    });
  });
});
