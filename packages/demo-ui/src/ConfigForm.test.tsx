import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfigForm } from "./ConfigForm";

const schema = JSON.stringify({
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "页面标题",
    },
  },
});

const groupedSchema = JSON.stringify({
  type: "object",
  properties: {
    title: {
      type: "string",
      title: "页面标题",
      "ui:options": { group: "文本" },
    },
  },
});

const compactSchema = JSON.stringify({
  type: "object",
  properties: {
    count: { type: "number", title: "数量" },
    enabled: { type: "boolean", title: "启用" },
    color: { type: ["string", "null"], title: "背景色", format: "color", default: null },
  },
});

const optionGroupSchema = JSON.stringify({
  type: "object",
  properties: {
    layout: {
      type: "string",
      title: "布局",
      enum: ["list", "grid", "table"],
      enumNames: ["列表", "网格", "表格"],
      default: "grid",
      "ui:widget": "segmented",
    },
    density: {
      type: "string",
      title: "密度",
      enum: ["comfortable", "compact"],
      enumNames: ["舒适", "紧凑"],
      default: "comfortable",
      "ui:widget": "radio",
    },
  },
});

const imageSchema = JSON.stringify({
  type: "object",
  properties: {
    cover: { type: "string", title: "封面", format: "image" },
    gallery: { type: "array", title: "图库", "ui:widget": "imageList", items: { type: "string" } },
    attachment: { type: "string", title: "附件", format: "file" },
  },
});

const duplicatePositionArraySchema = JSON.stringify({
  type: "object",
  properties: {
    blanks: {
      type: "array",
      title: "空",
      $demo: { sortable: true },
      items: {
        type: "object",
        properties: {
          position: {
            type: "position",
            title: "位置",
            key: "blank",
            size: { width: 1920, height: 1080 },
          },
        },
      },
    },
  },
});

const nestedImageArraySchema = JSON.stringify({
  type: "object",
  properties: {
    blanks: {
      type: "array",
      title: "空",
      default: [{ image: "/default-blank.png", gallery: ["/default-detail.png"] }],
      items: {
        type: "object",
        properties: {
          image: { type: "string", title: "图片", format: "image" },
          gallery: { type: "array", title: "细节图", items: { type: "string", format: "image" } },
        },
      },
    },
  },
});

const nestedDefinitionSchema = JSON.stringify({
  type: "object",
  properties: {
    navColor: { type: ["string", "null"], title: "导航栏颜色", format: "color", default: null },
    modules: {
      type: "array",
      title: "内容模块",
      items: {
        oneOf: [{
          title: "图片模块",
          properties: {
            type: { const: "image" },
            image: { type: "string", title: "图片", format: "image" },
          },
        }],
      },
    },
  },
});

const conditionalArraySchema = JSON.stringify({
  type: "object",
  properties: {
    modules: {
      type: "array",
      title: "内容模块",
      $demo: { sortable: false },
      "ui:options": { collapsed: false },
      items: {
        oneOf: [{
          title: "优秀作品模块",
          properties: {
            type: { const: "excellentWorks" },
            showAd: {
              type: "boolean",
              title: "显示广告图",
              default: true,
            },
            adImage: {
              type: "string",
              format: "image",
              title: "广告图",
              visibleWhen: { field: "showAd", equals: true },
            },
          },
        }],
      },
    },
  },
});

const nestedOneOfPositionSchema = JSON.stringify({
  type: "object",
  properties: {
    modules: {
      type: "array",
      title: "模块",
      $demo: { sortable: true },
      items: {
        oneOf: [{
          title: "关卡模块",
          properties: {
            type: { const: "level" },
            levels: {
              type: "array",
              title: "关卡图",
              $demo: { sortable: false },
              items: {
                oneOf: [{
                  title: "关卡卡片",
                  properties: {
                    type: { const: "levelCard" },
                    position: {
                      type: "position",
                      title: "坐标",
                      key: "levelCard",
                      size: { width: 375, height: 656 },
                    },
                  },
                }],
              },
            },
          },
        }],
      },
    },
  },
});

const nonSortableObjectArraySchema = JSON.stringify({
  type: "object",
  properties: {
    levels: {
      type: "array",
      title: "关卡列表",
      $demo: { sortable: false },
      "ui:options": { itemTitleTemplate: "关卡 {index}" },
      items: {
        type: "object",
        properties: {
          label: { type: "string", title: "名称", default: "" },
        },
      },
      default: [{ label: "第一关" }, { label: "第二关" }],
    },
  },
});

const nestedNonSortableTreeSchema = JSON.stringify({
  type: "object",
  properties: {
    groups: {
      type: "array",
      title: "分组",
      $demo: { sortable: false },
      items: {
        type: "object",
        properties: {
          label: { type: "string", title: "名称" },
          children: {
            type: "array",
            title: "子项",
            $demo: { sortable: false },
            items: {
              type: "object",
              properties: { label: { type: "string", title: "名称" } },
            },
          },
        },
      },
    },
  },
});

describe("ConfigForm nested visibleWhen", () => {
  it("在 oneOf 数组项内按兄弟开关显隐并保留隐藏字段值", () => {
    const onChange = vi.fn();
    render(
      <ConfigForm
        schema={conditionalArraySchema}
        initialData={{
          modules: [{
            type: "excellentWorks",
            showAd: true,
            adImage: "banner.png",
          }],
        }}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("广告图")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.queryByText("广告图")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({
      modules: [{
        type: "excellentWorks",
        showAd: false,
        adImage: "banner.png",
      }],
    }, undefined);

    fireEvent.click(screen.getByRole("switch"));

    expect(screen.getByText("广告图")).toBeInTheDocument();
  });

  it("每个数组项独立解析条件，并使用当前项的字段默认值", () => {
    render(
      <ConfigForm
        schema={conditionalArraySchema}
        initialData={{
          modules: [
            { type: "excellentWorks", showAd: false, adImage: "hidden.png" },
            { type: "excellentWorks", adImage: "default-visible.png" },
          ],
        }}
        onChange={vi.fn()}
      />,
    );

    const itemHeaders = screen.getAllByRole("button", { name: "优秀作品模块" });
    fireEvent.click(itemHeaders[1]);

    expect(screen.getAllByText("广告图")).toHaveLength(1);
  });
});

describe("ConfigForm configuration-definition entry", () => {
  it("标题直接编辑配置项，规范和批注标签紧跟标题排列", () => {
    const onOpenDesignSpec = vi.fn();
    const onEditConfigDefinition = vi.fn();
    const onAddConfigComment = vi.fn();
    const spec = {
      docId: "doc-1",
      docTitle: "页面规范",
      entryId: "entry-1",
      entryTitle: "封面规范",
      markdown: "图片高度不超过 300px",
      scope: "page" as const,
      pageId: "page-1",
      fieldKey: "title",
    };

    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        designSpecEntries={[spec]}
        onOpenDesignSpec={onOpenDesignSpec}
        onEditConfigDefinition={onEditConfigDefinition}
        onAddConfigComment={onAddConfigComment}
        hasConfigComment={() => false}
        imageConfigScope="page"
        pageId="page-1"
      />,
    );

    expect(screen.getByText("规范")).toBeInTheDocument();
    const titleButton = screen.getByRole("button", { name: "编辑配置项：页面标题" });
    fireEvent.mouseEnter(titleButton);
    fireEvent.focus(titleButton);
    expect(screen.queryByText("添加批注")).not.toBeInTheDocument();
    fireEvent.click(titleButton);
    expect(onEditConfigDefinition).toHaveBeenCalledWith("title", expect.anything(), "title");
    fireEvent.click(screen.getByRole("button", { name: "查看设计规范：页面标题" }));
    expect(onOpenDesignSpec).toHaveBeenCalledWith(spec, "页面标题", undefined, expect.any(HTMLElement));
    const commentButton = screen.getByRole("button", { name: "查看或添加批注：页面标题" });
    expect(commentButton.closest(".group")).toHaveClass("group");
    expect(commentButton.parentElement).toHaveClass(
      "pointer-events-none",
      "opacity-0",
      "group-hover:pointer-events-auto",
      "group-hover:opacity-100",
      "group-focus-within:pointer-events-auto",
      "group-focus-within:opacity-100",
    );
    expect(commentButton).toHaveClass("bg-foreground/[0.08]");
    fireEvent.click(commentButton);
    expect(onAddConfigComment).toHaveBeenCalledWith(expect.objectContaining({
      kind: "config",
      fieldKey: "title",
    }), expect.any(HTMLElement));
  });

  it("没有非空设计规范时不显示规范标签", () => {
    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        designSpecEntries={[{
          docId: "doc-1",
          docTitle: "页面规范",
          entryId: "entry-1",
          entryTitle: "空规范",
          markdown: "  ",
          scope: "page",
          pageId: "page-1",
          fieldKey: "title",
        }]}
        onOpenDesignSpec={vi.fn()}
      />,
    );

    expect(screen.queryByText("规范")).not.toBeInTheDocument();
  });

  it("点击字段标题直接触发配置定义编辑", () => {
    const onEditConfigDefinition = vi.fn();

    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );

    const trigger = screen.getByRole("button", { name: "编辑配置项：页面标题" });
    fireEvent.click(trigger);

    expect(onEditConfigDefinition).toHaveBeenCalledWith(
      "title",
      expect.objectContaining({ key: "title", title: "页面标题" }),
      "title",
    );
  });

  it("嵌套对象数组字段标题也能打开配置定义编辑", () => {
    const onEditConfigDefinition = vi.fn();

    render(
      <ConfigForm
        schema={nestedDefinitionSchema}
        initialData={{ modules: [{ type: "image", image: "" }] }}
        onChange={vi.fn()}
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "图片模块" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑配置项：图片" }));

    expect(onEditConfigDefinition).toHaveBeenCalledWith(
      "image",
      expect.objectContaining({ key: "image", title: "图片" }),
      "modules[type=image].image",
    );
  });

  it("未提供回调或只读时保持静态字段标题", () => {
    const { rerender } = render(<ConfigForm schema={schema} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "编辑配置项：页面标题" })).not.toBeInTheDocument();

    rerender(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        readonly
        onEditConfigDefinition={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "编辑配置项：页面标题" })).not.toBeInTheDocument();
    expect(screen.getByText(/页面标题/).closest("label")?.tagName).toBe("LABEL");
  });

  it("不可编辑配置项仍显示批注入口但不显示定义编辑入口", () => {
    const onAddConfigComment = vi.fn();
    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        configItemCapabilities={{ canEditDefinition: false, canEditValue: false, canAddComment: true, reason: "template-page" }}
        onEditConfigDefinition={vi.fn()}
        onAddConfigComment={onAddConfigComment}
        imageConfigScope="page"
        pageId="page-1"
      />,
    );

    const title = screen.getByText("页面标题");
    expect(title.closest("label")).toBeTruthy();
    const commentButton = screen.getByRole("button", { name: "查看或添加批注：页面标题" });
    expect(commentButton).toBeVisible();
    expect(commentButton).toHaveClass("bg-foreground/[0.08]");
    fireEvent.click(commentButton);
    expect(onAddConfigComment).toHaveBeenCalledWith(expect.objectContaining({
      kind: "config",
      scope: "page",
      pageId: "page-1",
      fieldKey: "title",
    }), expect.anything());
    expect(screen.getByPlaceholderText("请输入页面标题")).toBeDisabled();
  });

  it("有批注时高亮批注标签且不显示数量", () => {
    render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        onAddConfigComment={vi.fn()}
        hasConfigComment={() => true}
        imageConfigScope="page"
        pageId="page-1"
      />,
    );

    const commentButton = screen.getByRole("button", { name: "查看或添加批注：页面标题" });
    expect(commentButton.parentElement).toHaveClass("pointer-events-auto", "opacity-100");
    expect(commentButton.parentElement).not.toHaveClass("opacity-0", "group-hover:opacity-100");
    expect(commentButton).toHaveClass("bg-amber-400", "text-amber-950");
    expect(screen.queryByText(/批注\s*\d/)).not.toBeInTheDocument();
  });

  it("浏览端没有批注时不显示标签，有批注时常驻显示", () => {
    const hasConfigComment = vi.fn().mockReturnValue(false);
    const { rerender } = render(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        onAddConfigComment={vi.fn()}
        hasConfigComment={hasConfigComment}
        hideEmptyConfigCommentTag
        imageConfigScope="page"
        pageId="page-1"
      />,
    );

    expect(screen.queryByRole("button", { name: "查看或添加批注：页面标题" })).not.toBeInTheDocument();

    hasConfigComment.mockReturnValue(true);
    rerender(
      <ConfigForm
        schema={schema}
        onChange={vi.fn()}
        onAddConfigComment={vi.fn()}
        hasConfigComment={hasConfigComment}
        hideEmptyConfigCommentTag
        imageConfigScope="page"
        pageId="page-1"
      />,
    );

    const commentButton = screen.getByRole("button", { name: "查看或添加批注：页面标题" });
    expect(commentButton.parentElement).toHaveClass("pointer-events-auto", "opacity-100");
  });

  it("分组始终展示字段，字段固定呈现完整编辑态", () => {
    render(<ConfigForm schema={groupedSchema} onChange={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "文本" })).toBeInTheDocument();
    const textInput = screen.getByPlaceholderText("请输入页面标题");
    expect(textInput).toBeVisible();
    expect(textInput.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("数字、开关和颜色保持紧凑的行内编辑布局", () => {
    render(<ConfigForm schema={compactSchema} onChange={vi.fn()} />);

    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    const colorValue = screen.getByRole("button", { name: "背景色选择器" });
    expect(colorValue).toHaveTextContent("无色");
    expect(colorValue).toHaveClass("w-full", "min-w-[132px]", "max-w-[220px]");
  });

  it("按 Schema 控件覆盖渲染枚举单选组和分段控件", () => {
    const onChange = vi.fn();
    render(<ConfigForm schema={optionGroupSchema} onChange={onChange} />);

    expect(screen.getByRole("radiogroup", { name: "布局" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "密度" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "网格" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "舒适" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "表格" }));
    expect(onChange).toHaveBeenLastCalledWith({ layout: "table" }, undefined);
  });

  it("折叠数组项时上下内边距保持一致，展开后才显示内容间距", () => {
    render(
      <ConfigForm
        schema={duplicatePositionArraySchema}
        initialData={{ blanks: [{ position: { x: 100, y: 200 } }] }}
        onChange={vi.fn()}
      />,
    );

    const item = screen.getByRole("button", { name: "项目 1" });
    expect(item).toHaveClass("flex-1");
    expect(item.parentElement).toHaveClass("flex-1");
    expect(screen.getByRole("button", { name: "拖动项目 1" })).toBeInTheDocument();
    const card = item.closest("div.min-h-9");
    expect(card).toHaveClass("gap-0");
    expect(card).not.toHaveClass("gap-2.5");

    fireEvent.click(item);
    expect(card).toHaveClass("gap-2.5");
  });

  it("将标准单图和当前图片列表项解析为无 IO 白板目标", () => {
    const onLaunchWhiteboard = vi.fn();
    render(
      <ConfigForm
        schema={imageSchema}
        initialData={{ cover: "/cover.png", gallery: ["/one.png", "/two.png"], attachment: "/file.pdf" }}
        onChange={vi.fn()}
        imageConfigScope="page"
        pageId="page-1"
        onLaunchWhiteboard={onLaunchWhiteboard}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "白板绘图" })[0]);
    expect(onLaunchWhiteboard).toHaveBeenLastCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldPath: "cover",
      currentValue: "/cover.png",
    });

    fireEvent.click(screen.getAllByRole("button", { name: "白板绘图" })[2]);
    expect(onLaunchWhiteboard).toHaveBeenLastCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldPath: "gallery",
      listItem: { index: 1, url: "/two.png" },
    });
    // Every image tile keeps its upload action alongside whiteboard drawing;
    // the ordinary file field contributes only its upload action.
    expect(screen.getAllByRole("button", { name: "上传图片" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "白板绘图" })).toHaveLength(3);
    expect(screen.queryAllByRole("button", { name: "AI绘图" })).toHaveLength(0);
  });

  it("只读表单不展示白板入口", () => {
    render(
      <ConfigForm
        schema={imageSchema}
        initialData={{ gallery: ["/one.png"] }}
        onChange={vi.fn()}
        readonly
        onLaunchWhiteboard={vi.fn()}
      />,
    );

    expect(screen.queryAllByRole("button", { name: "白板绘图" })).toHaveLength(0);
  });

  it("将嵌套数组图片解析为当前索引的白板目标，并保留默认图删除保护", () => {
    const onLaunchWhiteboard = vi.fn();
    render(
      <ConfigForm
        schema={nestedImageArraySchema}
        onChange={vi.fn()}
        imageConfigScope="page"
        pageId="page-1"
        onLaunchWhiteboard={onLaunchWhiteboard}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "项目 1" }));
    const whiteboardButtons = screen.getAllByRole("button", { name: "白板绘图" });
    fireEvent.click(whiteboardButtons[0]);
    expect(onLaunchWhiteboard).toHaveBeenLastCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldPath: "blanks[0].image",
      currentValue: "/default-blank.png",
    });
    fireEvent.click(whiteboardButtons[1]);
    expect(onLaunchWhiteboard).toHaveBeenLastCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldPath: "blanks[0].gallery",
      listItem: { index: 0, url: "/default-detail.png" },
    });
    // The only delete affordance belongs to the multi-image item; the nested
    // default single image remains protected.
    expect(screen.getAllByRole("button", { name: "删除图片" })).toHaveLength(1);
  });

  it("嵌套 oneOf 关卡图显示对象数组坐标控件而不是多图上传控件", () => {
    render(
      <ConfigForm
        schema={nestedOneOfPositionSchema}
        initialData={{
          modules: [{
            type: "level",
            levels: [{ type: "levelCard", position: { x: 14, y: 1 } }],
          }],
        }}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "关卡模块" }));
    fireEvent.click(screen.getByRole("button", { name: "关卡卡片" }));

    expect(screen.getAllByRole("button", { name: "拖动" })).toHaveLength(1);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(screen.queryByText(/\d+\s*\/\s*20/)).not.toBeInTheDocument();
  });

  it("不可排序的对象数组仍支持展开、添加和删除，但隐藏拖拽手柄", () => {
    const onChange = vi.fn();
    render(
      <ConfigForm
        schema={nonSortableObjectArraySchema}
        onChange={onChange}
      />,
    );

    expect(screen.getAllByRole("button", { name: /^关卡 \d{2}$/ })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /拖动/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(onChange).toHaveBeenLastCalledWith({
      levels: [{ label: "第一关" }, { label: "第二关" }, { label: "" }],
    }, undefined);

    fireEvent.click(screen.getByRole("button", { name: "删除关卡 01" }));
    expect(onChange).toHaveBeenLastCalledWith({
      levels: [{ label: "第二关" }, { label: "" }],
    }, undefined);
  });

  it("对象数组条目标题热区覆盖行内剩余宽度，删除操作保持独立", () => {
    render(<ConfigForm schema={nonSortableObjectArraySchema} onChange={vi.fn()} />);

    const titleButton = screen.getByRole("button", { name: "关卡 01" });
    const deleteButton = screen.getByRole("button", { name: "删除关卡 01" });
    expect(titleButton).toHaveClass("flex-1");
    expect(titleButton.parentElement).toHaveClass("flex-1");
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton.parentElement).toHaveClass(
      "pointer-events-none",
      "opacity-0",
      "group-hover:pointer-events-auto",
      "group-hover:opacity-100",
      "group-focus-within:pointer-events-auto",
      "group-focus-within:opacity-100",
    );
  });

  it("父子数组分别维护层级，新增父项会把子数组初始化为空数组", () => {
    const onChange = vi.fn();
    render(<ConfigForm schema={nestedNonSortableTreeSchema} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "添加" }));
    expect(onChange).toHaveBeenLastCalledWith({ groups: [{ label: "", children: [] }] }, undefined);
    expect(screen.queryByRole("button", { name: /拖动/ })).not.toBeInTheDocument();

    const addButtons = screen.getAllByRole("button", { name: "添加" });
    fireEvent.click(addButtons[0]!);
    expect(onChange).toHaveBeenLastCalledWith({ groups: [{ label: "", children: [{ label: "" }] }] }, undefined);
  });

  it("重复 DOM key 的数组定位项只激活当前实例并回传稳定路径", () => {
    const onEnterPositionEdit = vi.fn();
    const onExitPositionEdit = vi.fn();
    const { rerender } = render(
      <ConfigForm
        schema={duplicatePositionArraySchema}
        initialData={{
          blanks: [
            { position: { x: 100, y: 200 } },
            { position: { x: 300, y: 400 } },
          ],
        }}
        onChange={vi.fn()}
        onEnterPositionEdit={onEnterPositionEdit}
        onExitPositionEdit={onExitPositionEdit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "项目 1" }));
    fireEvent.click(screen.getByRole("button", { name: "项目 2" }));
    expect(screen.getAllByRole("button", { name: "拖动" })).toHaveLength(2);
    const firstDragButton = screen.getAllByRole("button", { name: "拖动" })[0];
    fireEvent.click(firstDragButton);

    expect(onEnterPositionEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: expect.stringContaining("blanks:blanks-sortable-"),
        fieldPath: "blanks[0].position",
        domKey: "blank",
        position: { x: 100, y: 200 },
      }),
    );
    const firstTarget = onEnterPositionEdit.mock.calls[0][0];
    rerender(
      <ConfigForm
        schema={duplicatePositionArraySchema}
        initialData={{
          blanks: [
            { position: { x: 100, y: 200 } },
            { position: { x: 300, y: 400 } },
          ],
        }}
        onChange={vi.fn()}
        onEnterPositionEdit={onEnterPositionEdit}
        onExitPositionEdit={onExitPositionEdit}
        positionEditActiveId={firstTarget.id}
      />,
    );
    expect(screen.getAllByRole("button", { name: "完成" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "拖动" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "拖动" }));
    expect(onEnterPositionEdit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fieldPath: "blanks[1].position",
        domKey: "blank",
        position: { x: 300, y: 400 },
      }),
    );
    const secondTarget = onEnterPositionEdit.mock.calls[1][0];
    expect(firstTarget.id).not.toBe(secondTarget.id);
    rerender(
      <ConfigForm
        schema={duplicatePositionArraySchema}
        initialData={{
          blanks: [
            { position: { x: 100, y: 200 } },
            { position: { x: 300, y: 400 } },
          ],
        }}
        onChange={vi.fn()}
        onEnterPositionEdit={onEnterPositionEdit}
        onExitPositionEdit={onExitPositionEdit}
        positionEditActiveId={secondTarget.id}
      />,
    );
    expect(screen.getAllByRole("button", { name: "完成" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "拖动" })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    expect(onExitPositionEdit).toHaveBeenCalledTimes(1);
    rerender(
      <ConfigForm
        schema={duplicatePositionArraySchema}
        initialData={{
          blanks: [
            { position: { x: 100, y: 200 } },
            { position: { x: 300, y: 400 } },
          ],
        }}
        onChange={vi.fn()}
        onEnterPositionEdit={onEnterPositionEdit}
        onExitPositionEdit={onExitPositionEdit}
        positionEditActiveId={null}
      />,
    );
    expect(screen.getAllByRole("button", { name: "拖动" })).toHaveLength(2);

  });

  it("仅对显式 detailPresentation=sheet 的数组项触发详情回调", () => {
    const onOpenItemDetail = vi.fn();
    const sheetSchema = JSON.stringify({
      type: "object",
      properties: {
        modules: {
          type: "array",
          title: "模块",
          $demo: { sortable: true },
          items: {
            oneOf: [{
              title: "关卡模块",
              properties: {
                type: { const: "level" },
                levels: {
                  type: "array",
                  title: "关卡列表",
                  $demo: { sortable: false },
                  "ui:options": { detailPresentation: "sheet", detailBreadcrumbTitle: "关卡列表", itemTitleTemplate: "关卡 {index}" },
                  items: {
                    oneOf: [{
                      title: "关卡卡片",
                      properties: {
                        type: { const: "levelCard" },
                        status: { type: "string", title: "状态", enum: ["locked", "open"] },
                      },
                    }],
                  },
                },
              },
            }],
          },
        },
      },
    });

    render(
      <ConfigForm
        schema={sheetSchema}
        initialData={{ modules: [{ type: "level", levels: [{ type: "levelCard", status: "open" }] }] }}
        onChange={vi.fn()}
        onOpenItemDetail={onOpenItemDetail}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "关卡模块" }));
    fireEvent.click(screen.getByRole("button", { name: "关卡 01" }));
    expect(onOpenItemDetail).toHaveBeenCalledWith(expect.objectContaining({
      title: "关卡 01",
      level: 3,
      breadcrumb: expect.arrayContaining([
        expect.objectContaining({ label: "关卡列表" }),
      ]),
    }));
  });
});
