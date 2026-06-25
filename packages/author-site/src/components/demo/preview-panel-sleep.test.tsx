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
});
