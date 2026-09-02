import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MarkdownReferenceLinksPanel } from "./MarkdownReferenceLinksPanel";

const source = {
  kind: "knowledge-document",
  projectId: "project-1",
  workspaceId: "workspace-1",
  docId: "doc-1",
} as const;

const target = {
  kind: "document",
  projectId: "project-1",
  docId: "doc-1",
} as const;

const mentionTarget = {
  kind: "document",
  projectId: "project-1",
  docId: "doc-2",
} as const;

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    json: async () => data,
  } as Response;
}

describe("MarkdownReferenceLinksPanel", () => {
  beforeEach(() => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/outgoing?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { records: [{ source, target: { kind: "document", projectId: "project-1", docId: "doc-2" }, labelSnapshot: "需求说明", line: 3 }] } }),
        } as Response);
      }
      if (url.includes("/mentions?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { mentions: [{ target: mentionTarget, label: "闯关活动", start: 0, end: 4, line: 8, column: 1 }] } }),
        } as Response);
      }
      if (url.includes("/backlinks?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ data: { records: [{ source, sourceLabel: "项目说明", labelSnapshot: "项目说明", line: 12 }] } }),
        } as Response);
      }
      return Promise.resolve(jsonResponse({ data: {} }));
    }) as jest.Mock;
  });

  it("默认折叠，展开后以 Tab 展示三类关系并显示数量", async () => {
    const user = userEvent.setup();
    const onMentionNavigate = jest.fn();
    const onMentionClick = jest.fn();
    render(
      <MarkdownReferenceLinksPanel
        projectId="project-1"
        sessionId="session-1"
        source={source}
        target={target}
        onMentionNavigate={onMentionNavigate}
        onMentionClick={onMentionClick}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("markdown-reference-tray-toggle")).toHaveTextContent("出链 1"));
    expect(screen.getByTestId("markdown-reference-tray-toggle")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("markdown-reference-tray-toggle")).toHaveTextContent("出链 1 • 反向 1 • 提及 1");
    expect(screen.queryByText("链接关系")).not.toBeInTheDocument();
    expect(screen.queryByTestId("markdown-reference-tray-content")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("markdown-reference-tray-toggle"));
    expect(screen.getByTestId("markdown-reference-tray-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("tab", { name: /此文档链接到/ })).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: /链接到此文档/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /提及但未链接/ })).toBeInTheDocument();
    expect(screen.getByText("需求说明")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /提及但未链接/ }));
    expect(screen.getByText("正文中出现了已知文档名称，但尚未建立链接。")).toBeInTheDocument();
    const mentionLabel = screen.getByText("闯关活动");
    expect(mentionLabel.tagName).toBe("SPAN");
    expect(screen.queryByText("第 8 行")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "跳转" }));
    expect(onMentionNavigate).toHaveBeenCalledWith(expect.objectContaining({ label: "闯关活动" }));
    await user.click(screen.getByRole("button", { name: "转为链接" }));
    expect(onMentionClick).toHaveBeenCalledWith(expect.objectContaining({ label: "闯关活动" }));

    await user.click(screen.getByTestId("markdown-reference-tray-toggle"));
    expect(screen.queryByTestId("markdown-reference-tray-content")).not.toBeInTheDocument();
  });

  it("切换文档后重置为折叠和默认 Tab", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <MarkdownReferenceLinksPanel projectId="project-1" source={source} target={target} />,
    );

    await waitFor(() => expect(screen.getByTestId("markdown-reference-tray-toggle")).toBeInTheDocument());
    await user.click(screen.getByTestId("markdown-reference-tray-toggle"));
    await user.click(screen.getByRole("tab", { name: /提及但未链接/ }));

    rerender(
      <MarkdownReferenceLinksPanel
        projectId="project-1"
        source={{ ...source, docId: "doc-2" }}
        target={{ ...target, docId: "doc-2" }}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("markdown-reference-tray-toggle")).toHaveAttribute("aria-expanded", "false"));
    await user.click(screen.getByTestId("markdown-reference-tray-toggle"));
    expect(screen.getByRole("tab", { name: /此文档链接到/ })).toHaveAttribute("data-state", "active");
  });

  it("只有目标时默认回退到反向链接 Tab", async () => {
    const user = userEvent.setup();
    render(<MarkdownReferenceLinksPanel projectId="project-1" target={target} />);

    await user.click(await screen.findByTestId("markdown-reference-tray-toggle"));
    expect(screen.getByRole("tab", { name: /链接到此文档/ })).toHaveAttribute("data-state", "active");
    expect(screen.queryByRole("tab", { name: /此文档链接到/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /提及但未链接/ })).not.toBeInTheDocument();
  });

  it("不会把当前文档自身显示为提及候选", async () => {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/mentions?")) {
        return Promise.resolve(jsonResponse({ data: { mentions: [{ target, label: "闯关活动", start: 0, end: 4, line: 1, column: 1 }] } }));
      }
      return Promise.resolve(jsonResponse({ data: { records: [] } }));
    }) as jest.Mock;
    const user = userEvent.setup();
    render(<MarkdownReferenceLinksPanel projectId="project-1" source={source} target={target} />);

    await waitFor(() => expect(screen.getByTestId("markdown-reference-tray-toggle")).toHaveTextContent("提及 0"));
    await user.click(screen.getByTestId("markdown-reference-tray-toggle"));
    await user.click(screen.getByRole("tab", { name: /提及但未链接/ }));
    expect(screen.getByText("暂无可转换提及")).toBeInTheDocument();
  });
});
