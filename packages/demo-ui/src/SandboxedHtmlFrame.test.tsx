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
});
