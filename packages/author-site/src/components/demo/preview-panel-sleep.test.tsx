import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { PreviewPanel } from "@workbench/demo-ui";

function dispatchIframeMessage(
  iframe: HTMLIFrameElement,
  payload: Record<string, unknown>,
) {
  const event = new MessageEvent("message", { data: payload });
  Object.defineProperty(event, "source", {
    value: iframe.contentWindow,
  });
  window.dispatchEvent(event);
}

describe("PreviewPanel iframe sleep", () => {
  const originalFetch = global.fetch;
  const originalResizeObserver = window.ResizeObserver;

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
    jest.restoreAllMocks();
  });

  it("fillContainer 在画布缩放下使用未变换的布局尺寸", async () => {
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class MockResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1133);
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(749);
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 487,
        bottom: 322,
        width: 487,
        height: 322,
        toJSON: () => ({}),
      } as DOMRect);

    const { getByTitle } = render(
      <PreviewPanel
        compiledJsUrl="/compiled.js"
        previewSize={{ width: 1133, height: 749 }}
        fillContainer
      />,
    );

    const iframe = getByTitle("预览") as HTMLIFrameElement;

    await waitFor(() => {
      expect(iframe.style.width).toBe("1133px");
      expect(iframe.style.height).toBe("749px");
      expect(iframe.style.transform).toBe("scale(1)");
    });
  });

  it("sleeping 时不推送配置，wake 后补发最新 code/config", async () => {
    const { rerender, getByTitle } = render(
      <PreviewPanel
        compiledJsUrl="/compiled.js"
        configData={{ title: "old" }}
        activityState="sleeping"
        fillContainer
      />,
    );

    const iframe = getByTitle("预览") as HTMLIFrameElement;
    const postMessage = jest.fn();
    Object.defineProperty(iframe, "contentWindow", {
      value: { postMessage },
      configurable: true,
    });

    act(() => {
      dispatchIframeMessage(iframe, { type: "READY" });
    });

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: "SLEEP" }, "*");
    });
    expect(
      postMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === "UPDATE_CONFIG",
      ),
    ).toBe(false);
    expect(
      postMessage.mock.calls.some(
        ([message]) => (message as { type?: string }).type === "UPDATE_CODE",
      ),
    ).toBe(false);

    rerender(
      <PreviewPanel
        compiledJsUrl="/compiled.js"
        configData={{ title: "new" }}
        activityState="active"
        fillContainer
      />,
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith({ type: "WAKE" }, "*");
      expect(
        postMessage.mock.calls.some(([message]) => {
          const payload = message as {
            type?: string;
            code?: string;
            isUrl?: boolean;
            configData?: { title?: string };
          };
          return (
            payload.type === "UPDATE_CODE" &&
            payload.code === "/compiled.js" &&
            payload.isUrl === true &&
            payload.configData?.title === "new"
          );
        }),
      ).toBe(true);
    });
  });

  it("编译接口返回 HTML 时回传明确的非 JSON 错误", async () => {
    const onError = jest.fn();
    global.fetch = jest.fn().mockResolvedValue(
      {
        status: 404,
        statusText: "Not Found",
        ok: false,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-type" ? "text/html" : null,
        },
        text: async () => "<!DOCTYPE html><html><body>not found</body></html>",
        json: async () => {
          throw new Error("json should not be called");
        },
      },
    ) as typeof fetch;

    const { findByText } = render(
      <PreviewPanel
        code="export default function Demo() { return <div>Demo</div>; }"
        configData={{}}
        onError={onError}
        fillContainer
        isAutoRepairing
      />,
    );

    await findByText("正在修复预览");

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("编译服务返回非 JSON 响应"),
      }),
    );
  });
});
