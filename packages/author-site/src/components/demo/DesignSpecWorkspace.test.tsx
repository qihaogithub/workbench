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

function EntryProbe() {
  const workspace = useDesignSpecWorkspace();
  return (
    <>
      <button type="button" onClick={() => workspace.setActiveDocId("spec-1")}>
        打开规范
      </button>
      <button
        type="button"
        onClick={() => workspace.addEntry("  页面规范 A  ")}
      >
        新建条目
      </button>
      <button
        type="button"
        onClick={() => {
          const entryId = workspace.doc?.entries[0]?.id;
          if (entryId) workspace.setMarkdown(entryId, "正文更新");
        }}
      >
        编辑正文
      </button>
      <span data-testid="doc-loaded">{workspace.doc ? "yes" : "no"}</span>
      <span data-testid="entry-title">
        {workspace.doc?.entries[0]?.title ?? ""}
      </span>
      <span data-testid="entry-markdown">
        {workspace.doc?.entries[0]?.markdown ?? ""}
      </span>
    </>
  );
}

describe("DesignSpecWorkspace 配置素材池刷新", () => {
  it("addEntry 只接受已确认的标题，不调用原生 prompt", async () => {
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
              data: { pool: [], pages: [] },
            }),
          } as Response;
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });
    const promptSpy = jest.spyOn(window, "prompt").mockImplementation(() => {
      throw new Error("window.prompt must not be used");
    });

    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <EntryProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开规范" }));
    await waitFor(() =>
      expect(screen.getByTestId("doc-loaded")).toHaveTextContent("yes"),
    );
    fireEvent.click(screen.getByRole("button", { name: "新建条目" }));
    expect(screen.getByTestId("entry-title")).toHaveTextContent("页面规范 A");
    expect(promptSpy).not.toHaveBeenCalled();

    promptSpy.mockRestore();
    fetchMock.mockRestore();
  });

  it("自动保存按快照串行执行，不会让旧正文覆盖后续更新", async () => {
    const putDocs: Array<{ entries: Array<{ markdown: string }> }> = [];
    let resolveFirstSave: (response: Response) => void = () => undefined;
    const firstSave = new Promise<Response>((resolve) => {
      resolveFirstSave = resolve;
    });
    const response = (body: unknown) =>
      ({
        ok: true,
        json: async () => body,
      }) as Response;
    const fetchMock = jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (
          url.startsWith("/api/design-specs/spec-1") &&
          init?.method === "PUT"
        ) {
          const payload = JSON.parse(String(init.body)) as {
            doc: { entries: Array<{ markdown: string }> };
          };
          putDocs.push(payload.doc);
          if (putDocs.length === 1) return firstSave;
          return response({ success: true, data: payload.doc });
        }
        if (url.startsWith("/api/design-specs/spec-1")) {
          return response({
            success: true,
            data: { id: "spec-1", entries: [] },
          });
        }
        if (url.startsWith("/api/design-specs/config-pool")) {
          return response({ success: true, data: { pool: [], pages: [] } });
        }
        return {
          ok: false,
          json: async () => ({ success: false }),
        } as Response;
      });

    jest.useFakeTimers();
    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <EntryProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开规范" }));
    await waitFor(() =>
      expect(screen.getByTestId("doc-loaded")).toHaveTextContent("yes"),
    );

    fireEvent.click(screen.getByRole("button", { name: "新建条目" }));
    act(() => {
      jest.advanceTimersByTime(800);
    });
    await waitFor(() => expect(putDocs).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "编辑正文" }));
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(putDocs).toHaveLength(1);

    act(() => {
      resolveFirstSave(response({ success: true, data: putDocs[0] }));
    });
    await waitFor(() => expect(putDocs).toHaveLength(2));
    expect(putDocs[0].entries[0].markdown).toBe("");
    expect(putDocs[1].entries[0].markdown).toBe("正文更新");
    await waitFor(() =>
      expect(screen.getByTestId("entry-markdown")).toHaveTextContent(
        "正文更新",
      ),
    );

    fetchMock.mockRestore();
    jest.useRealTimers();
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
});
