import { fireEvent, render, screen } from "@testing-library/react";
import type { DemoPageMeta } from "@opencode-workbench/shared";
import type { ReactNode } from "react";

import { DemoPageTreeItem } from "./DemoPageTreeItem";

jest.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}));

jest.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => undefined,
    },
  },
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

function renderPageItem(
  page: DemoPageMeta,
  onRequestRuntimeConversion = jest.fn(),
) {
  render(
    <DemoPageTreeItem
      flatItem={{
        item: page,
        depth: 0,
        isExpanded: false,
        hasChildren: false,
      }}
      projectId="project_1"
      sessionId="session_1"
      activeDemoId={page.id}
      folders={[]}
      pages={[page]}
      isExpanded={false}
      activeDragId={null}
      onToggleFolder={jest.fn()}
      onPageSelect={jest.fn()}
      onPageRename={jest.fn()}
      onPageCopy={jest.fn()}
      onPageDelete={jest.fn()}
      onRequestRuntimeConversion={onRequestRuntimeConversion}
      onRenameFolder={jest.fn()}
      onDeleteFolder={jest.fn()}
      onCreateSubFolder={jest.fn()}
      onMovePageToFolder={jest.fn()}
    />,
  );
  return onRequestRuntimeConversion;
}

describe("DemoPageTreeItem", () => {
  it("页面列表 AI 转 HTML/CSS 原型入口直接发送 AI 任务", () => {
    const onRequestRuntimeConversion = renderPageItem({
      id: "page_1",
      name: "demo",
      order: 0,
      parentId: null,
      runtimeType: "high-fidelity-react",
    } as DemoPageMeta);

    fireEvent.click(screen.getByText("AI 转 HTML/CSS 原型"));

    expect(onRequestRuntimeConversion).toHaveBeenCalledWith(
      "page_1",
      "prototype-html-css",
      { skipStaticization: true },
    );
  });
});
