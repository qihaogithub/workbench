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
const memoryEntry = makeEntry("document", "AI 记忆", "wb://document/project-1/memory/memory", {
  native: {
    ...makeEntry("document", "AI 记忆", "wb://document/project-1/memory/memory").native,
    metadata: { documentKind: "memory" },
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
      projectionSource: "derived",
      projectionState: "ready",
      generationActivity: "idle",
      reconcileRequired: false,
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

  it("默认以单列分组概览展示层级，点击后在资源行内展开简介编辑", async () => {
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
    expect(screen.queryByText("只修改 Agent 使用的语义覆盖，不会修改页面内容、配置值或文档正文。")).not.toBeInTheDocument();
  });

  it("简介为空时预填 AI 内容，已有简介时折叠 AI 内容", async () => {
    const user = userEvent.setup();
    const generatedSummary = "AI 生成的页面简介";
    const aiPage = makeEntry("page", "AI 页面", "wb://page/ai", {
      native: {
        ...makeEntry("page", "AI 页面", "wb://page/ai").native,
        description: null,
      },
      generated: {
        summary: generatedSummary,
        sourceFingerprint: "source-ai",
        contentHash: "content-ai",
        generatorVersion: "test",
        generatedAt: "2026-09-11T00:00:00.000Z",
        evidenceRefs: [],
      },
      resolved: { name: "AI 页面", summary: generatedSummary, aliases: [] },
    });
    const existingPage = makeEntry("page", "已有简介页面", "wb://page/existing", {
      native: {
        ...makeEntry("page", "已有简介页面", "wb://page/existing").native,
        description: "已有原生简介",
      },
      generated: {
        summary: "另一条 AI 简介",
        sourceFingerprint: "source-existing",
        contentHash: "content-existing",
        generatorVersion: "test",
        generatedAt: "2026-09-11T00:00:00.000Z",
        evidenceRefs: [],
      },
      resolved: { name: "已有简介页面", summary: "已有原生简介", aliases: [] },
    });
    global.fetch = jest.fn().mockImplementation(() => response(payload([aiPage, existingPage]))) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="editor" />);

    await screen.findByText("AI 页面");
    await user.click(screen.getByRole("button", { name: "编辑简介：AI 页面" }));
    expect(screen.getByRole("textbox", { name: "简介" })).toHaveValue(generatedSummary);
    expect(screen.queryByText("查看 AI 生成简介")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "关闭简介编辑" }));
    await user.click(screen.getByRole("button", { name: "编辑简介：已有简介页面" }));
    expect(screen.getByRole("textbox", { name: "简介" })).toHaveValue("");
    const aiDisclosure = screen.getByText("查看 AI 生成简介").closest("details");
    expect(aiDisclosure).not.toHaveAttribute("open");
    await user.click(screen.getByText("查看 AI 生成简介"));
    expect(aiDisclosure).toHaveAttribute("open");
    expect(aiDisclosure?.querySelector("p")).toHaveTextContent("另一条 AI 简介");
  });

  it("编辑后自动保存，刷新前先 flush 当前草稿", async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/inventory/overrides") && init?.method === "PUT") {
        return response(payload());
      }
      if (String(input).includes("/inventory/overrides")) return response(payload());
      if (String(input).includes("/inventory/reconcile") && init?.method === "POST") return response({ success: true, data: {} });
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
    await user.click(screen.getByRole("button", { name: "关闭简介编辑" }));

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "刷新项目清单" }));
    await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some(([input, init]) => String(input).includes("/inventory/overrides") && init?.method === "PUT")).toBe(true));
    expect((global.fetch as jest.Mock).mock.calls.some(([input, init]) => String(input).includes("/inventory/reconcile") && init?.method === "POST")).toBe(true);
  });

  it("CAS 同字段冲突时保留本地草稿并进入显式重试状态", async () => {
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
    await user.click(screen.getByRole("button", { name: "关闭简介编辑" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("检测到 1 个字段同时被修改");
    await user.click(screen.getByRole("button", { name: "编辑简介：项目入口" }));
    expect(screen.getByRole("textbox", { name: "简介" })).toHaveValue("本地简介");
    await user.click(screen.getByRole("button", { name: "关闭简介编辑" }));
    expect(screen.getByRole("button", { name: "重试保存" })).toBeEnabled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "清单存在同字段冲突，当前修改已保留。" }));
  });

  it("只读角色只能浏览概览，不能打开编辑或刷新", async () => {
    global.fetch = jest.fn().mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("/inventory/overrides")) return response(payload());
      return response({ success: false }, { ok: false, status: 500 });
    }) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="creator" />);

    expect(await screen.findByText("只读视图")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /编辑简介/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "刷新项目清单" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /保存/ })).not.toBeInTheDocument();
  });

  it("将治理文档与用户项目文档分组展示", async () => {
    global.fetch = jest.fn().mockImplementation(() => response(payload([
      projectEntry,
      documentEntry,
      memoryEntry,
    ]))) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="editor" />);

    expect(await screen.findByRole("heading", { name: "项目文档" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "治理文档" })).toBeInTheDocument();
    expect(screen.getByText("AI 记忆")).toBeInTheDocument();
  });

  it("fallback 的 pending 只显示待生成且不会进入轮询", async () => {
    const pending = makeEntry("page", "待生成页面", "wb://page/pending", {
      generationState: "pending",
      reviewState: "unreviewed",
    });
    const body = payload([projectEntry, pending]);
    Object.assign(body.data, {
      projectionSource: "workspace",
      projectionState: "stale",
      generationActivity: "idle",
      reconcileRequired: true,
    });
    global.fetch = jest.fn().mockImplementation(() => response(body)) as jest.Mock;

    render(<ProjectInventoryView projectId="project-1" sessionId="session-1" userRole="editor" />);

    expect(await screen.findByText("待生成")).toBeInTheDocument();
    expect(screen.queryByText("生成中")).not.toBeInTheDocument();
    expect(screen.getByText("派生清单与当前工作空间不一致，当前展示实时目录。请刷新索引。")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
