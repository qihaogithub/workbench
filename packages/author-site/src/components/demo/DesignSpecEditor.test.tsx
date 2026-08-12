import { fireEvent, render, screen } from "@testing-library/react";
import { DesignSpecEditor } from "./DesignSpecEditor";
import { useDesignSpecWorkspace } from "./DesignSpecWorkspace";

jest.mock("@workbench/demo-ui", () => ({
  DocumentEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="设计规范说明"
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
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
  it("使用共享 DocumentEditor 编辑条目说明并写回 Markdown", () => {
    const setMarkdown = jest.fn();
    useWorkspace.mockReturnValue({
      loading: false,
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
  });
});
