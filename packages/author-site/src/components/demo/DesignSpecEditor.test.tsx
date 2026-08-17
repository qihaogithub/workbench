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
            refs: [],
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

  it("将新建条目按钮置于滚动区外，保持在面板右下角", () => {
    useWorkspace.mockReturnValue({
      loading: false,
      doc: { id: "spec-1", entries: [] },
      pool: [],
      openIds: new Set(),
      setActiveDocId: jest.fn(),
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
    });

    render(<DesignSpecEditor docId="spec-1" />);

    const addButton = screen.getByTitle("新建条目");
    expect(screen.getByTestId("design-spec-scroll-area")).not.toContainElement(
      addButton,
    );
    expect(addButton.parentElement).toHaveClass("relative");
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
            refs: [{ scope: "project", fieldKey: "hero" }],
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

  it("仅允许从拖拽手柄排序，说明编辑器仍可正常框选文字", () => {
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          { id: "entry-1", title: "主视觉图片", markdown: "说明", refs: [] },
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
    expect(dragHandle).toHaveAttribute("draggable", "true");
  });

  it("通过专用手柄拖动时仍会重排规范条目", () => {
    const reorderEntry = jest.fn();
    useWorkspace.mockReturnValue({
      loading: false,
      doc: {
        id: "spec-1",
        entries: [
          { id: "entry-1", title: "第一条", markdown: "", refs: [] },
          { id: "entry-2", title: "第二条", markdown: "", refs: [] },
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
      reorderEntry,
      addEntry: jest.fn(),
      addEntryWithItem: jest.fn(),
      setHoverPop: jest.fn(),
      setZoomed: jest.fn(),
    });
    const dataTransfer = {
      setData: jest.fn(),
      getData: jest.fn(() => "entry:entry-1"),
    };

    render(<DesignSpecEditor docId="spec-1" />);

    fireEvent.dragStart(
      screen.getByRole("button", { name: "拖动排序第一条" }),
      { dataTransfer },
    );
    const targetCard = screen
      .getByDisplayValue("第二条")
      .closest(".overflow-hidden");
    expect(targetCard).not.toBeNull();
    fireEvent.drop(targetCard!, { dataTransfer });

    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "entry:entry-1");
    expect(reorderEntry).toHaveBeenCalledWith("entry-1", "entry-2");
  });
});
