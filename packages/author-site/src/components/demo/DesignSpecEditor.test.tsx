import { fireEvent, render, screen } from "@testing-library/react";
import { DesignSpecEditor } from "./DesignSpecEditor";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";

const mockDocumentEditor = jest.fn();

jest.mock("@workbench/demo-ui", () => ({
  DocumentEditor: ({
    value,
    onChange,
    placeholder,
    localizeRemoteImage,
    scrollable,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    localizeRemoteImage?: (url: string) => Promise<string>;
    scrollable?: boolean;
  }) => {
    mockDocumentEditor({ localizeRemoteImage, scrollable });
    return (
      <textarea
        aria-label="设计规范说明"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  },
}));

jest.mock("./DesignSpecWorkspace", () => ({
  useDesignSpecWorkspace: jest.fn(),
}));

jest.mock("./DesignSpecVisuals", () => ({
  formatSize: () => "—",
  KIND_META: {},
  KindThumb: () => <span />,
  pageLabel: () => "",
  refToPoolId: () => "",
}));

const useWorkspace = useDesignSpecWorkspace as jest.Mock;

describe("DesignSpecEditor", () => {
  beforeEach(() => {
    mockDocumentEditor.mockClear();
  });

  it("加载状态切换为文档后保持 Hook 调用顺序", () => {
    const workspace: any = {
      loading: true,
      doc: null,
      setActiveDocId: jest.fn(),
      openIds: new Set<string>(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      addEntryWithPage: jest.fn(),
    };
    useWorkspace.mockReturnValue(workspace);
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(<DesignSpecEditor docId="spec-1" />);
    workspace.loading = false;
    workspace.doc = { id: "spec-1", entries: [] };
    rerender(<DesignSpecEditor docId="spec-1" />);

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "change in the order of Hooks",
    );
    consoleError.mockRestore();
  });

  it("使用共享 DocumentEditor 编辑条目说明、写回 Markdown，并本地化外网图片", async () => {
    const setMarkdown = jest.fn();
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { editPreviewUrl: "/api/images/img_local" },
      }),
    } as Response);
    useWorkspace.mockReturnValue({
      loading: false,
      sessionId: "session-1",
      doc: {
        id: "spec-1",
        entries: [
          {
            id: "entry-1",
            title: "主视觉图片",
            markdown: "初始说明",
            target: { type: "page", pageIds: [] },
          },
        ],
      },
      pool: [],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      setMarkdown,
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    const editor = screen.getByLabelText("设计规范说明");
    expect(editor).toHaveValue("初始说明");
    expect(screen.queryByRole("button", { name: "预览" })).not.toBeInTheDocument();

    fireEvent.change(editor, { target: { value: "更新说明" } });
    expect(setMarkdown).toHaveBeenCalledWith("entry-1", "更新说明");
    expect(mockDocumentEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        localizeRemoteImage: expect.any(Function),
        scrollable: false,
      }),
    );
    const localizeRemoteImage = mockDocumentEditor.mock.calls[0][0]
      .localizeRemoteImage as (url: string) => Promise<string>;
    await expect(localizeRemoteImage("https://cdn.example.com/hero.png")).resolves.toBe(
      "/api/images/img_local",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/session-1/assets/localize",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          source: {
            kind: "selected-image",
            src: "https://cdn.example.com/hero.png",
            currentSrc: "https://cdn.example.com/hero.png",
          },
        }),
      }),
    );
    fetchMock.mockRestore();
  });

  it("点击新建按钮直接创建空白页面规范", () => {
    const addEntry = jest.fn();
    useWorkspace.mockReturnValue({
      loading: false,
      doc: { id: "spec-1", entries: [] },
      pool: [],
      openIds: new Set(),
      setActiveDocId: jest.fn(),
      addEntry,
      addEntryWithItem: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    const addButton = screen.getByTitle("新建页面规范");
    expect(screen.getByTestId("design-spec-scroll-area")).not.toContainElement(
      addButton,
    );
    expect(addButton.closest(".relative")).not.toBeNull();

    fireEvent.click(addButton);
    expect(addEntry).toHaveBeenCalledWith();
    expect(screen.queryByRole("button", { name: "空白页面规范" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "说明" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "资源索引" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "往期资源参考" })).not.toBeInTheDocument();
  });

  it("从右侧拖入页面时创建页面绑定条目", () => {
    const addEntryWithPage = jest.fn();
    useWorkspace.mockReturnValue({
      loading: false,
      doc: { id: "spec-1", entries: [] },
      pool: [],
      pages: [{ id: "page-a", name: "页面 A" }],
      openIds: new Set(),
      setActiveDocId: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithPage,
      addEntryWithItem: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);
    fireEvent.drop(screen.getByTestId("design-spec-scroll-area"), {
      dataTransfer: { getData: () => "page:page-a" },
    });

    expect(addEntryWithPage).toHaveBeenCalledWith("page-a");
  });

  it("拖入 oneOf 分支父节点时绑定单个稳定引用", () => {
    const bindRef = jest.fn();
    const branch = {
      id: "page:page-a:modules[type=participant]",
      scope: "page" as const,
      pageId: "page-a",
      pageName: "页面 A",
      key: "modules[type=participant]",
      title: "参与人数模块",
      breadcrumbs: ["内容模块", "参与人数模块"],
      kind: "text" as const,
      isBranch: true,
    };
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [{
          id: "entry-1",
          title: "参与人数规范",
          markdown: "",
          target: { type: "config", refs: [] },
        }],
      },
      pool: [branch],
      pages: [],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      setMarkdown: jest.fn(),
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef,
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    const entryCard = screen.getByDisplayValue("参与人数规范").closest(".group");
    expect(entryCard).not.toBeNull();
    fireEvent.drop(entryCard!, {
      dataTransfer: {
        types: ["text/plain"],
        getData: () => `pool:${branch.id}`,
      },
    });
    expect(bindRef).toHaveBeenCalledWith(branch.id, "entry-1");
  });

  it("显示绑定页面名称且不提供手动展示位置选择器", () => {
    const unbindPage = jest.fn();
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [{
          id: "entry-1",
          title: "玩法介绍",
          markdown: "正文",
          target: { type: "page", pageIds: ["page-a"] },
        }],
      },
      pool: [],
      pages: [{ id: "page-a", name: "页面 A" }],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      setMarkdown: jest.fn(),
      bindPage: jest.fn(),
      unbindPage,
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    expect(screen.queryByLabelText("玩法介绍的展示位置")).not.toBeInTheDocument();
    expect(screen.queryByText("绑定页面")).not.toBeInTheDocument();
    expect(screen.queryByText("页面规范")).not.toBeInTheDocument();
    expect(screen.queryByText("显示在已绑定页面的配置侧边栏顶部")).not.toBeInTheDocument();
    expect(screen.getByLabelText("绑定页面：页面 A")).toHaveTextContent("页面 A");
    expect(screen.getByLabelText("解绑页面：页面 A")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("解绑页面：页面 A"));
    expect(unbindPage).toHaveBeenCalledWith("page-a", "entry-1");
    expect(screen.getByTitle("删除条目").closest(".group")).not.toBeNull();
    expect(screen.getByText("1 个页面")).toBeInTheDocument();
  });

  it("将每个解绑按钮置于表格单元格中", () => {
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          {
            id: "entry-1",
            title: "主视觉图片",
            markdown: "",
            target: { type: "config", refs: [{ scope: "project", fieldKey: "hero" }] },
          },
        ],
      },
      pool: [],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      setMarkdown: jest.fn(),
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    const unbindButton = screen.getByTitle("解绑");
    expect(unbindButton.parentElement?.tagName).toBe("TD");
  });

  it("有效绑定配置项显示编辑按钮并传递引用目标", () => {
    const onEditConfigDefinition = jest.fn();
    const toggleEntry = jest.fn();
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          {
            id: "entry-1",
            title: "主视觉图片",
            markdown: "",
            target: { type: "config", refs: [{ scope: "page", pageId: "page-1", fieldKey: "hero" }] },
          },
        ],
      },
      pool: [
        {
          id: "",
          scope: "page",
          pageId: "page-1",
          pageName: "页面一",
          key: "hero",
          title: "主视觉图片",
          kind: "image",
          format: "image",
        },
      ],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      setMarkdown: jest.fn(),
      toggleEntry,
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    render(
      <DesignSpecEditor
        docId="spec-1"
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );

    fireEvent.click(screen.getByTitle("编辑配置项"));
    expect(onEditConfigDefinition).toHaveBeenCalledWith({
      scope: "page",
      pageId: "page-1",
      fieldKey: "hero",
    });
    expect(toggleEntry).not.toHaveBeenCalled();
  });

  it("失效引用和只读模式不显示配置项编辑按钮", () => {
    const onEditConfigDefinition = jest.fn();
    const workspace = {
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          {
            id: "entry-1",
            title: "主视觉图片",
            markdown: "",
            target: { type: "config", refs: [{ scope: "page", pageId: "page-1", fieldKey: "hero" }] },
          },
        ],
      },
      pool: [],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      setMarkdown: jest.fn(),
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    };

    useWorkspace.mockReturnValue(workspace);
    const { unmount } = render(
      <DesignSpecEditor
        docId="spec-1"
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );
    expect(screen.queryByTitle("编辑配置项")).not.toBeInTheDocument();
    unmount();

    useWorkspace.mockReturnValue({
      ...workspace,
      pool: [{
        id: "",
        scope: "page",
        pageId: "page-1",
        pageName: "页面一",
        key: "hero",
        title: "主视觉图片",
        kind: "image",
        format: "image",
      }],
    });
    render(
      <DesignSpecEditor
        docId="spec-1"
        readOnly
        onEditConfigDefinition={onEditConfigDefinition}
      />,
    );
    expect(screen.queryByTitle("编辑配置项")).not.toBeInTheDocument();
  });

  it("仅允许从拖拽手柄排序，说明编辑器仍可正常框选文字", () => {
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          { id: "entry-1", title: "主视觉图片", markdown: "说明", target: { type: "page", pageIds: [] } },
        ],
      },
      pool: [],
      openIds: new Set(["entry-1"]),
      setActiveDocId: jest.fn(),
      setMarkdown: jest.fn(),
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    const editor = screen.getByLabelText("设计规范说明");
    expect(editor.closest("[draggable='true']")).toBeNull();

    const dragHandle = screen.getByRole("button", { name: "拖动排序主视觉图片" });
    expect(dragHandle).not.toHaveAttribute("draggable");
  });

  it("排序入口由 dnd-kit 接管，不写入原生 DataTransfer", () => {
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          { id: "entry-1", title: "第一条", markdown: "", target: { type: "page", pageIds: [] } },
          { id: "entry-2", title: "第二条", markdown: "", target: { type: "page", pageIds: [] } },
        ],
      },
      pool: [],
      openIds: new Set(),
      setActiveDocId: jest.fn(),
      toggleEntry: jest.fn(),
      renameEntry: jest.fn(),
      deleteEntry: jest.fn(),
      bindRef: jest.fn(),
      unbindRef: jest.fn(),
      reorderEntry: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });
    render(<DesignSpecEditor docId="spec-1" />);

    const dragHandle = screen.getByRole("button", { name: "拖动排序第一条" });
    expect(dragHandle).not.toHaveAttribute("draggable");
    expect(dragHandle).toHaveClass("cursor-grab");
    expect(screen.queryByTestId(/design-spec-drop-indicator/)).not.toBeInTheDocument();
  });
});
