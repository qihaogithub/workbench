import { act, renderHook, waitFor } from "@testing-library/react";
import { encodeMarkdownReferenceUri } from "@workbench/shared/markdown-reference";
import { useAuthorReferenceDeepLink } from "./use-author-reference-deep-link";

const target = { kind: "config" as const, projectId: "project", pageId: "page", fieldPath: "cards[].title" };

describe("Author 深链消费生命周期", () => {
  beforeEach(() => {
    window.history.replaceState({ retained: true }, "", "/demo/project/edit?" + new URLSearchParams({ reference: encodeMarkdownReferenceUri(target) }));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { candidates: [{ target, displayPath: "标题" }] } }) });
  });
  it("等待启动完成；页面选择更新上下文时不取消或重放正在执行的定位", async () => {
    let complete!: () => void;
    const pending = new Promise<void>((resolve) => { complete = resolve; });
    let signal: AbortSignal | undefined;
    const navigate = jest.fn(async (_target: unknown, nextSignal: AbortSignal) => { signal = nextSignal; await pending; });
    const onError = jest.fn();
    const props = { ready: false, projectId: "project", sessionId: "session", workspaceId: "workspace", navigate, onError };
    const hook = renderHook((options) => useAuthorReferenceDeepLink(options), { initialProps: props });
    expect(global.fetch).not.toHaveBeenCalled();
    hook.rerender({ ...props, ready: true });
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    const changedProjection = jest.fn(async (_target: unknown, _signal: AbortSignal) => {});
    hook.rerender({ ...props, ready: true, navigate: changedProjection });
    expect(signal?.aborted).toBe(false);
    await act(async () => { complete(); await pending; });
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(window.history.state).toEqual({ retained: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(changedProjection).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
  it("会话身份变更时取消旧请求", async () => {
    let signal: AbortSignal | undefined;
    const navigate = jest.fn(async (_target: unknown, nextSignal: AbortSignal) => {
      signal = nextSignal;
      await new Promise<void>(() => {});
    });
    const props = { ready: true, projectId: "project", sessionId: "session", workspaceId: "workspace", navigate, onError: jest.fn() };
    const hook = renderHook((options) => useAuthorReferenceDeepLink(options), { initialProps: props });
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    hook.rerender({ ...props, ready: false, sessionId: "other-session" });
    expect(signal?.aborted).toBe(true);
  });
});
