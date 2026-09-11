import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InventoryQueryEntry } from "@workbench/shared";
import { ProjectInventoryView } from "./ProjectInventoryView";

const toast = jest.fn();

jest.mock("@/components/ui/toast-provider", () => ({
  useToast: () => ({ toast }),
}));

function makeEntry(
  resourceType: InventoryQueryEntry["resourceType"],
  name: string,
  canonicalUri: string,
  overrides: Partial<InventoryQueryEntry> = {},
): InventoryQueryEntry {
  return {
    canonicalUri,
    resourceType,
    scope: "local",
    parentUri: resourceType === "config" ? "wb://page/home" : null,
    refreshMode: "auto",
    native: {
      name,
      aliases: [],
      description: `${name}原生说明`,
      metadata: {},
    },
    generated: null,
    human: {
      summary: null,
      confirmedGeneratedHash: null,
      updatedAt: null,
    },
    resolved: {
      name,
      summary: `${name}摘要`,
      aliases: [],
    },
    matchedBy: [],
    targetAvailability: "available",
    sourceState: "active",
    generationState: "not_required",
    reviewState: "not_required",
    ...overrides,
  };
}

const projectEntry = makeEntry("project", "项目入口", "wb://project/project-1");
const pageEntry = makeEntry("page", "首页", "wb://page/home", {
  native: {
    ...makeEntry("page", "首页", "wb://page/home").native,
    metadata: { routeKey: "/" },
  },
});
const configEntry = makeEntry("config", "主标题", "wb://config/home/title");
const documentEntry = makeEntry("document", "使用指南", "wb://document/guide", {
  native: {
    ...makeEntry("document", "使用指南", "wb://document/guide").native,
  },
});

function payload(
  entries: InventoryQueryEntry[] = [projectEntry, pageEntry, configEntry, documentEntry],
  overrides: Record<string, unknown> = {},
) {
  return {
    success: true,
    data: {
      entries,
      overrides: { schemaVersion: 2, entries: overrides },
      orphanEntries: [],
      freshness: "fresh",
      hash: "inventory-hash",
      revision: 3,
    },
  };
}

function response(body: unknown, init: Partial<Response> = {}) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
    ...init,
  }) as Promise<Response>;
}

describe("ProjectInventoryView", () => {
  beforeEach(() => {
    toast.mockClear();
  });

  it("默认以单列分组概览展示层级，点击后才打开语义编辑面板", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("/inventory/overrides")) return response(payload());
      return response({ success: false }, { ok: false, status: 500 });
    }) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="editor" />);

    expect(await screen.findByText("首页")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目清单" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "页面" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "项目文档" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "展开页面：首页" })).toHaveAttribute("aria-expanded", "false");
    await user.selectOptions(screen.getByRole("combobox", { name: "按资源类型筛选" }), "config");
    expect(screen.getByText("主标题")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "收起页面：首页" })).toHaveAttribute("aria-expanded", "true");
    await user.selectOptions(screen.getByRole("combobox", { name: "按资源类型筛选" }), "all");
    expect(screen.getByText("主标题")).toBeInTheDocument();
    expect(screen.queryByLabelText("展示名称")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑简介：项目入口" }));
    expect(screen.getByTestId("inventory-editor-panel")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "简介" })).toBeInTheDocument();
    expect(screen.queryByLabelText("展示名称")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("职责")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("标签")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("摘要")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("使用说明")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/刷新模式/)).not.toBeInTheDocument();
    expect(screen.getByText("只修改 Agent 使用的语义覆盖，不会修改页面内容、配置值或文档正文。")).toBeInTheDocument();
  });

  it("保存语义覆盖并阻止有草稿时刷新索引", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/inventory/overrides") && init?.method === "PUT") {
        return response(payload());
      }
      if (String(input).includes("/inventory/overrides")) return response(payload());
      return response({ success: false }, { ok: false, status: 500 });
    }) as jest.Mock;

    const onDirtyChange = jest.fn();
    render(
      <ProjectInventoryView
        projectId="project-1"
        sessionId="session-1"
        userRole="editor"
        onDirtyChange={onDirtyChange}
      />,
    );

    await screen.findByText("首页");
    await user.click(screen.getByRole("button", { name: "编辑简介：项目入口" }));
    await user.type(screen.getByRole("textbox", { name: "简介" }), "（自定义）");
    await user.click(screen.getByRole("button", { name: "关闭" }));

    expect(screen.getByRole("button", { name: "保存覆盖" })).toBeEnabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "刷新项目清单" }));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "请先处理未保存修改" }));
    expect((global.fetch as jest.Mock).mock.calls.some(([input, init]) => String(input).includes("/inventory/reconcile") && init?.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "保存覆盖" }));
    await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(([input, init]) => String(input).includes("/inventory/overrides") && init?.method === "PUT")).toBe(true));
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "资源清单覆盖已保存" }));
  });

  it("CAS 冲突时重新读取服务端并保留本地修改，等待用户再次保存", async () => {
    const user = userEvent.setup();
    let putCount = 0;
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/inventory/overrides") && init?.method === "PUT") {
        putCount += 1;
        return response({ success: false, error: { message: "版本冲突" } }, { ok: false, status: 409 });
      }
      if (String(input).includes("/inventory/overrides") && putCount === 0) return response(payload());
      return response(payload([projectEntry, pageEntry, configEntry, documentEntry], {
        [projectEntry.canonicalUri]: { summary: "服务端简介" },
      }));
    }) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="editor" />);
    await screen.findByText("首页");
    await user.click(screen.getByRole("button", { name: "编辑简介：项目入口" }));
    await user.type(screen.getByRole("textbox", { name: "简介" }), "本地简介");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("button", { name: "保存覆盖" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("已保留本地修改");
    await user.click(screen.getByRole("button", { name: "编辑简介：项目入口" }));
    expect(screen.getByRole("textbox", { name: "简介" })).toHaveValue("本地简介");
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.getByRole("button", { name: "保存覆盖" })).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已保留本地修改" }));
  });

  it("只读角色只能浏览概览，不能打开编辑或刷新", async () => {
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("/inventory/overrides")) return response(payload());
      return response({ success: false }, { ok: false, status: 500 });
    }) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="creator" />);

    expect(await screen.findByText("当前为只读视图")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /编辑简介/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新项目清单" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "已保存" })).toBeDisabled();
  });
});
