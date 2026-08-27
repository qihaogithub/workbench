import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SANDBOXED_HTML_CHANNEL } from "./sandboxed-html-protocol";
import { SandboxedHtmlFrame } from "./SandboxedHtmlFrame";

describe("SandboxedHtmlFrame", () => {
  it("uses only controlled URL and restrictive iframe attributes", () => {
    render(<SandboxedHtmlFrame executionUrl="https://sandbox.invalid/e/1" channelId="channel-1" title="Demo" />);
    const frame = screen.getByTitle("Demo");
    expect(frame).toHaveAttribute("src", "https://sandbox.invalid/e/1#workbenchGeneration=1");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(frame).toHaveAttribute("allow", "");
  });

  it("fills the available width when embedded as a centered flex item", () => {
    render(<SandboxedHtmlFrame executionUrl="/execution/1" channelId="channel-1" title="Flex demo" fillContainer />);

    expect(screen.getByTitle("Flex demo").parentElement?.parentElement).toHaveClass("w-full");
  });

  it("accepts only current frame source and generation telemetry", () => {
    const onStatusChange = vi.fn();
    render(<SandboxedHtmlFrame executionUrl="/execution/1" channelId="channel-1" title="Demo" onStatusChange={onStatusChange} />);
    const frame = screen.getByTitle("Demo") as HTMLIFrameElement;
    fireEvent.load(frame);
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      origin: "null",
      data: { type: "READY", channel: SANDBOXED_HTML_CHANNEL, channelId: "channel-1", loadGeneration: 1 },
    }));
    expect(onStatusChange).toHaveBeenCalledWith("ready");
    window.dispatchEvent(new MessageEvent("message", {
      source: window,
      data: { type: "RUNTIME_ERROR", channel: SANDBOXED_HTML_CHANNEL, channelId: "channel-1", loadGeneration: 1 },
    }));
    expect(onStatusChange).not.toHaveBeenCalledWith("runtime-error");
  });

  it("does not send host business messages", () => {
    const postMessage = vi.spyOn(window, "postMessage");
    render(<SandboxedHtmlFrame executionUrl="/execution/1" channelId="channel-1" title="Demo" />);
    expect(postMessage).not.toHaveBeenCalled();
    postMessage.mockRestore();
  });

  it("reports a navigation away from the controlled execution document", () => {
    const onStatusChange = vi.fn();
    render(<SandboxedHtmlFrame executionUrl="/execution/1" channelId="channel-1" title="Navigation demo" onStatusChange={onStatusChange} />);
    const frame = screen.getByTitle("Navigation demo") as HTMLIFrameElement;
    window.dispatchEvent(new MessageEvent("message", {
      source: frame.contentWindow,
      data: { type: "READY", channel: SANDBOXED_HTML_CHANNEL, channelId: "channel-1", loadGeneration: 1 },
    }));
    fireEvent.load(frame);
    expect(onStatusChange).toHaveBeenCalledWith("left-document");
  });

  it("固定画板忽略内容高度消息，保持持久化视口高度", () => {
    const onContentHeightChange = vi.fn();
    render(
      <SandboxedHtmlFrame
        executionUrl="/execution/1"
        channelId="channel-1"
        title="Fixed demo"
        previewSize={{ width: 800, height: 600 }}
        heightBehavior="fixed"
        onContentHeightChange={onContentHeightChange}
      />,
    );
    const frame = screen.getByTitle("Fixed demo") as HTMLIFrameElement;
    window.dispatchEvent(
      new MessageEvent("message", {
        source: frame.contentWindow,
        origin: "null",
        data: {
          type: "RESIZE",
          channel: SANDBOXED_HTML_CHANNEL,
          channelId: "channel-1",
          loadGeneration: 1,
          payload: { height: 1600 },
        },
      }),
    );

    expect(onContentHeightChange).not.toHaveBeenCalled();
    expect(frame.style.height).toBe("600px");
  });
});
