import { render, waitFor } from "@testing-library/react";
import { act } from "react";
import { PreviewPanel } from "../../../../shared/src/demo/PreviewPanel";

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

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
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

  it("编译接口返回 HTML 时展示明确的非 JSON 错误", async () => {
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
      />,
    );

    await findByText("编译错误");
    await findByText(/编译服务返回非 JSON 响应（404 Not Found）/);

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("编译服务返回非 JSON 响应"),
      }),
    );
  });
});
