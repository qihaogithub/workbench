import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  DesignSpecWorkspaceProvider,
  useDesignSpecWorkspace,
} from "./DesignSpecWorkspace";

function PoolProbe() {
  const workspace = useDesignSpecWorkspace();
  return (
    <>
      <button type="button" onClick={() => workspace.setActiveDocId("spec-1")}>
        打开规范
      </button>
      <span data-testid="pool-size">{workspace.pool[0]?.size?.w ?? ""}</span>
    </>
  );
}

function FilterProbe() {
  const workspace = useDesignSpecWorkspace();
  return (
    <>
      <button type="button" onClick={() => workspace.setActiveDocId("spec-1")}>
        打开筛选规范
      </button>
      <button type="button" onClick={() => workspace.setPageFilter("page-2")}>
        筛选页面二
      </button>
      <button
        type="button"
        onClick={() => workspace.setPageFilter("missing-page")}
      >
        筛选失效页面
      </button>
      <span data-testid="filtered-pages">
        {workspace.filteredPages.map((page) => page.id).join(",")}
      </span>
      <span data-testid="filtered-pool">
        {workspace.filteredPool.map((item) => item.id).join(",")}
      </span>
      <span data-testid="pool-groups">
        {workspace.poolGroups
          .map(
            ([name, items]) =>
              `${name}:${items.map((item) => item.id).join("|")}`,
          )
          .join(",")}
      </span>
    </>
  );
}

function BindingProbe() {
  const workspace = useDesignSpecWorkspace();
  return (
    <>
      <button
        type="button"
        onClick={() => workspace.setActiveDocId("spec-branch")}
      >
        打开分支规范
      </button>
      <button
        type="button"
        onClick={() => workspace.bindRef(
          "page:page-1:modules[type=participant]",
          "entry-1",
        )}
      >
        绑定分支
      </button>
      <span data-testid="binding-refs">
        {workspace.doc?.entries[0]?.target.type === "config"
          ? workspace.doc.entries[0].target.refs.map((ref) => ref.fieldKey).join(",")
          : ""}
      </span>
      <span data-testid="binding-pool-size">{workspace.pool.length}</span>
    </>
  );
}

function TitleProbe() {
  const workspace = useDesignSpecWorkspace();
  return (
    <>
      <button type="button" onClick={() => workspace.setActiveDocId("spec-1")}>
        打开标题规范
      </button>
      <button type="button" onClick={() => workspace.renameEntry("entry-1", "本地条目改动")}>
        修改条目
      </button>
      <span data-testid="document-title">{workspace.doc?.title ?? ""}</span>
      <span data-testid="entry-title">{workspace.doc?.entries[0]?.title ?? ""}</span>
      <span data-testid="document-dirty">{String(workspace.dirty)}</span>
    </>
  );
}

describe("DesignSpecWorkspace 配置素材池刷新", () => {
  it("侧边栏重命名只更新标题，不覆盖未保存的条目草稿", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("/api/design-specs/spec-1")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                id: "spec-1",
                title: "旧文档名",
                createdAt: "2026-08-12T00:00:00.000Z",
                updatedAt: "2026-08-12T00:00:00.000Z",
                entries: [{
                  id: "entry-1",
                  title: "原条目名",
                  markdown: "",
                  target: { type: "page", pageIds: [] },
                }],
              },
            }),
          } as Response;
        }
        if (url.startsWith("/api/design-specs/config-pool")) {
          return {
            ok: true,
            json: async () => ({ success: true, data: { pages: [], pool: [] } }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });

    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <TitleProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开标题规范" }));
    await waitFor(() =>
      expect(screen.getByTestId("document-title")).toHaveTextContent("旧文档名"),
    );
    fireEvent.click(screen.getByRole("button", { name: "修改条目" }));
    expect(screen.getByTestId("entry-title")).toHaveTextContent("本地条目改动");
    expect(screen.getByTestId("document-dirty")).toHaveTextContent("true");

    act(() => {
      window.dispatchEvent(
        new CustomEvent("design-spec-updated", {
          detail: { docId: "spec-1", title: "新文档名" },
        }),
      );
    });

    expect(screen.getByTestId("document-title")).toHaveTextContent("新文档名");
    expect(screen.getByTestId("entry-title")).toHaveTextContent("本地条目改动");
    expect(screen.getByTestId("document-dirty")).toHaveTextContent("true");
    fetchMock.mockRestore();
  });

  it("已提交 Schema 事件立即投影，但服务端刷新不会被本地状态永久覆盖", async () => {
    const stalePool = {
      pool: [
        {
          id: "page:page-1:hero",
          scope: "page",
          pageId: "page-1",
          key: "hero",
          title: "背景图",
          kind: "image",
          size: { w: "1920", h: "1080" },
        },
      ],
      pages: [{ id: "page-1", name: "页面一" }],
    };
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("/api/design-specs/spec-1")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { id: "spec-1", entries: [] },
            }),
          } as Response;
        }
        if (url.startsWith("/api/design-specs/config-pool")) {
          return {
            ok: true,
            json: async () => ({ success: true, data: stalePool }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });

    jest.useFakeTimers();
    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <PoolProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开规范" }));
    await waitFor(() =>
      expect(screen.getByTestId("pool-size")).toHaveTextContent("1920"),
    );

    act(() => {
      window.dispatchEvent(
        new CustomEvent("config-schema-updated", {
          detail: {
            scope: "page",
            pageId: "page-1",
            committed: true,
            schema: JSON.stringify({
              type: "object",
              properties: {
                hero: {
                  title: "背景图",
                  type: "string",
                  format: "image",
                  "ui:options": {
                    widthRule: { operator: "=", value: 1440 },
                    heightRule: { operator: "=", value: 900 },
                  },
                },
              },
            }),
          },
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId("pool-size")).toHaveTextContent("1440"),
    );

    act(() => {
      jest.advanceTimersByTime(2200);
    });
    await waitFor(() =>
      expect(screen.getByTestId("pool-size")).toHaveTextContent("1920"),
    );

    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it("收到 Schema 更新事件后刷新已绑定配置项的尺寸投影", async () => {
    const poolResponses = [
      {
        pool: [
          {
            id: "page:page-1:hero",
            scope: "page",
            pageId: "page-1",
            key: "hero",
            title: "背景图",
            kind: "image",
            size: { w: "1920", h: "1080" },
          },
        ],
        pages: [{ id: "page-1", name: "页面一" }],
      },
      {
        pool: [
          {
            id: "page:page-1:hero",
            scope: "page",
            pageId: "page-1",
            key: "hero",
            title: "背景图",
            kind: "image",
            size: { w: "1440", h: "900" },
          },
        ],
        pages: [{ id: "page-1", name: "页面一" }],
      },
    ];
    const refreshedPool = poolResponses[1];
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("/api/design-specs/spec-1")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { id: "spec-1", entries: [] },
            }),
          } as Response;
        }
        if (url.startsWith("/api/design-specs/config-pool")) {
          const data = poolResponses.shift() ?? refreshedPool;
          return {
            ok: true,
            json: async () => ({ success: true, data }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });

    jest.useFakeTimers();
    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <PoolProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开规范" }));
    await waitFor(() =>
      expect(screen.getByTestId("pool-size")).toHaveTextContent("1920"),
    );

    act(() => {
      window.dispatchEvent(new Event("config-schema-updated"));
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() =>
      expect(screen.getByTestId("pool-size")).toHaveTextContent("1440"),
    );

    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it("按 pageId 过滤页面与配置项，并在失效时回退全部页面", async () => {
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("/api/design-specs/spec-1")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: { id: "spec-1", entries: [] },
            }),
          } as Response;
        }
        if (url.startsWith("/api/design-specs/config-pool")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                pages: [
                  { id: "page-1", name: "页面一" },
                  { id: "page-2", name: "页面二" },
                ],
                pool: [
                  {
                    id: "project:shared",
                    scope: "project",
                    key: "shared",
                    title: "共享",
                    kind: "text",
                    pageIds: ["page-1", "page-2"],
                  },
                  {
                    id: "page:page-1:title",
                    scope: "page",
                    pageId: "page-1",
                    pageName: "页面一",
                    key: "title",
                    title: "标题",
                    kind: "text",
                  },
                  {
                    id: "page:page-2:title",
                    scope: "page",
                    pageId: "page-2",
                    pageName: "页面二",
                    key: "title",
                    title: "标题",
                    kind: "text",
                  },
                ],
              },
            }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });

    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <FilterProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开筛选规范" }));
    await waitFor(() => {
      expect(screen.getByTestId("filtered-pool")).toHaveTextContent(
        "project:shared",
      );
      expect(screen.getByTestId("pool-groups")).toHaveTextContent(
        "页面一:project:shared|page:page-1:title",
      );
      expect(screen.getByTestId("pool-groups")).toHaveTextContent(
        "页面二:project:shared|page:page-2:title",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "筛选页面二" }));
    await waitFor(() => {
      expect(screen.getByTestId("filtered-pages")).toHaveTextContent("page-2");
      expect(screen.getByTestId("filtered-pool")).toHaveTextContent(
        "project:shared,page:page-2:title",
      );
      expect(screen.getByTestId("pool-groups")).toHaveTextContent(
        "页面二:project:shared|page:page-2:title",
      );
      expect(screen.getByTestId("pool-groups")).not.toHaveTextContent(
        "页面一:",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "筛选失效页面" }));
    await waitFor(() => {
      expect(screen.getByTestId("filtered-pages")).toHaveTextContent(
        "page-1,page-2",
      );
      expect(screen.getByTestId("pool-groups")).toHaveTextContent("页面一:");
      expect(screen.getByTestId("pool-groups")).toHaveTextContent("页面二:");
    });
    fetchMock.mockRestore();
  });

  it("重复绑定 oneOf 分支父节点只保留一个稳定引用", async () => {
    const branch = {
      id: "page:page-1:modules[type=participant]",
      scope: "page",
      pageId: "page-1",
      pageName: "页面一",
      key: "modules[type=participant]",
      title: "参与人数模块",
      kind: "text",
      isBranch: true,
    };
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("/api/design-specs/spec-branch")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                id: "spec-branch",
                entries: [{
                  id: "entry-1",
                  title: "参与人数规范",
                  markdown: "",
                  target: { type: "config", refs: [] },
                }],
              },
            }),
          } as Response;
        }
        if (url.startsWith("/api/design-specs/config-pool")) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              data: {
                pages: [{ id: "page-1", name: "页面一" }],
                pool: [branch],
              },
            }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });

    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <BindingProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开分支规范" }));
    await waitFor(() =>
      expect(screen.getByTestId("binding-pool-size")).toHaveTextContent("1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "绑定分支" }));
    fireEvent.click(screen.getByRole("button", { name: "绑定分支" }));
    await waitFor(() =>
      expect(screen.getByTestId("binding-refs")).toHaveTextContent(
        "modules[type=participant]",
      ),
    );
    expect(screen.getByTestId("binding-refs").textContent).toBe(
      "modules[type=participant]",
    );
    fetchMock.mockRestore();
  });
});
