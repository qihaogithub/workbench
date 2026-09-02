import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("DesignSpecWorkspace 配置素材池刷新", () => {
  it("已提交 Schema 事件立即投影，但服务端刷新不会被本地状态永久覆盖", async () => {
    const stalePool = {
      pool: [{ id: "page:page-1:hero", scope: "page", pageId: "page-1", key: "hero", title: "背景图", kind: "image", size: { w: "1920", h: "1080" } }],
      pages: [{ id: "page-1", name: "页面一" }],
    };
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/design-specs/spec-1")) {
        return { ok: true, json: async () => ({ success: true, data: { id: "spec-1", entries: [] } }) } as Response;
      }
      if (url.startsWith("/api/design-specs/config-pool")) {
        return { ok: true, json: async () => ({ success: true, data: stalePool }) } as Response;
      }
      return { ok: false, json: async () => ({ success: false }) } as Response;
    });

    jest.useFakeTimers();
    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <PoolProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开规范" }));
    await waitFor(() => expect(screen.getByTestId("pool-size")).toHaveTextContent("1920"));

    act(() => {
      window.dispatchEvent(new CustomEvent("config-schema-updated", {
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
      }));
    });

    await waitFor(() => expect(screen.getByTestId("pool-size")).toHaveTextContent("1440"));

    act(() => {
      jest.advanceTimersByTime(2200);
    });
    await waitFor(() => expect(screen.getByTestId("pool-size")).toHaveTextContent("1920"));

    fetchMock.mockRestore();
    jest.useRealTimers();
  });

  it("收到 Schema 更新事件后刷新已绑定配置项的尺寸投影", async () => {
    const poolResponses = [
      {
        pool: [{ id: "page:page-1:hero", scope: "page", pageId: "page-1", key: "hero", title: "背景图", kind: "image", size: { w: "1920", h: "1080" } }],
        pages: [{ id: "page-1", name: "页面一" }],
      },
      {
        pool: [{ id: "page:page-1:hero", scope: "page", pageId: "page-1", key: "hero", title: "背景图", kind: "image", size: { w: "1440", h: "900" } }],
        pages: [{ id: "page-1", name: "页面一" }],
      },
    ];
    const refreshedPool = poolResponses[1];
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/design-specs/spec-1")) {
        return { ok: true, json: async () => ({ success: true, data: { id: "spec-1", entries: [] } }) } as Response;
      }
      if (url.startsWith("/api/design-specs/config-pool")) {
        const data = poolResponses.shift() ?? refreshedPool;
        return { ok: true, json: async () => ({ success: true, data }) } as Response;
      }
      return { ok: false, json: async () => ({ success: false }) } as Response;
    });

    jest.useFakeTimers();
    render(
      <DesignSpecWorkspaceProvider projectId="project-1">
        <PoolProbe />
      </DesignSpecWorkspaceProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "打开规范" }));
    await waitFor(() => expect(screen.getByTestId("pool-size")).toHaveTextContent("1920"));

    act(() => {
      window.dispatchEvent(new Event("config-schema-updated"));
      jest.advanceTimersByTime(1000);
    });
    await waitFor(() => expect(screen.getByTestId("pool-size")).toHaveTextContent("1440"));

    fetchMock.mockRestore();
    jest.useRealTimers();
  });
});
