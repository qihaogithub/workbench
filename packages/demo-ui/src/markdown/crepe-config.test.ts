import { describe, expect, it, vi } from "vitest";
import { Crepe } from "@milkdown/crepe";
import { buildCrepeConfig, type CrepeProjectActions } from "./crepe-config";

function createActions(): CrepeProjectActions {
  return {
    uploadImage: vi.fn(async () => "/image.png"),
    uploadVideo: vi.fn(),
    uploadFile: vi.fn(),
    insertReference: vi.fn(),
  };
}

describe("buildCrepeConfig", () => {
  it("启用标准编辑能力与原生 TopBar，并明确关闭 Latex 与 AI", () => {
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
    });

    expect(config.features?.[Crepe.Feature.Cursor]).toBe(true);
    expect(config.features?.[Crepe.Feature.ImageBlock]).toBe(true);
    expect(config.features?.[Crepe.Feature.BlockEdit]).toBe(true);
    expect(config.features?.[Crepe.Feature.Latex]).toBe(false);
    expect(config.features?.[Crepe.Feature.TopBar]).toBe(true);
    expect(config.features?.[Crepe.Feature.AI]).toBe(false);
  });

  it("允许批注编辑器隐藏固定 TopBar，同时保留选区浮动 Toolbar", () => {
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
      showTopBar: false,
    });

    expect(config.features?.[Crepe.Feature.TopBar]).toBe(false);
    expect(config.features?.[Crepe.Feature.Toolbar]).toBe(true);
  });

  it("只在能力可用时向 Crepe 块菜单追加项目操作", () => {
    const actions = createActions();
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions,
      enableUploads: true,
      referenceCandidates: [{ key: "theme.primary", label: "主题色" }],
    });
    const groups: Array<{
      key: string;
      label: string;
      items: Array<{ key: string; label: string; onRun?: () => void }>;
    }> = [];
    const builder = {
      addGroup(key: string, label: string) {
        const group = {
          key,
          label,
          items: [] as (typeof groups)[number]["items"],
        };
        groups.push(group);
        return {
          addItem(
            itemKey: string,
            item: Omit<(typeof group.items)[number], "key">,
          ) {
            group.items.push({ key: itemKey, ...item });
            return this;
          },
        };
      },
    };

    config.featureConfigs?.[Crepe.Feature.BlockEdit]?.buildMenu?.(
      builder as never,
    );

    expect(groups.map((group) => group.key)).toEqual([
      "project-references",
      "project-uploads",
    ]);
    expect(groups[0]?.items.map((item) => item.label)).toEqual(["主题色"]);
    expect(groups[1]?.items.map((item) => item.label)).toEqual([
      "上传视频",
      "上传附件",
    ]);
    groups[0]?.items[0]?.onRun?.();
    expect(actions.insertReference).toHaveBeenCalledWith({
      key: "theme.primary",
      label: "主题色",
    });
  });

  it("将 Crepe 默认块菜单的分组和菜单项完整本地化为中文", () => {
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
    });
    const blockEdit = config.featureConfigs?.[Crepe.Feature.BlockEdit];

    expect(blockEdit?.textGroup).toMatchObject({
      label: "文本",
      text: { label: "正文" },
      h1: { label: "H1" },
      h2: { label: "H2" },
      h3: { label: "H3" },
      h4: { label: "H4" },
      h5: { label: "H5" },
      h6: { label: "H6" },
      quote: { label: "引用" },
      divider: { label: "分隔线" },
    });
    expect(blockEdit?.listGroup).toMatchObject({
      label: "列表",
      bulletList: { label: "无序列表" },
      orderedList: { label: "有序列表" },
      taskList: { label: "任务列表" },
    });
    expect(blockEdit?.advancedGroup).toMatchObject({
      label: "插入",
      image: { label: "图片" },
      codeBlock: { label: "代码块" },
      table: { label: "表格" },
      math: null,
    });
  });

  it("将原生 TopBar 的标题选择器本地化为中文", () => {
    const config = buildCrepeConfig({
      placeholder: "输入内容...",
      actions: createActions(),
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
