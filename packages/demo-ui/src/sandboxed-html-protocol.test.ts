import { describe, expect, it } from "vitest";
import {
  createSandboxedHtmlRateLimiter,
  isSandboxedHtmlMessage,
  readSandboxedHtmlHeight,
  SANDBOXED_HTML_CHANNEL,
} from "./sandboxed-html-protocol";

const message = (extra: Record<string, unknown> = {}) => ({
  type: "READY",
  channel: SANDBOXED_HTML_CHANNEL,
  channelId: "channel-1",
  loadGeneration: 3,
  ...extra,
});

describe("sandboxed html message protocol", () => {
  it("只接受受控类型、channel、generation 与有限结构", () => {
    expect(isSandboxedHtmlMessage(message(), "channel-1", 3)).toBe(true);
    expect(isSandboxedHtmlMessage(message({ channel: "other" }), "channel-1", 3)).toBe(false);
    expect(isSandboxedHtmlMessage(message({ channelId: "other" }), "channel-1", 3)).toBe(false);
    expect(isSandboxedHtmlMessage(message({ loadGeneration: 2 }), "channel-1", 3)).toBe(false);
    expect(isSandboxedHtmlMessage(message({ type: "APP_ACTION" }), "channel-1", 3)).toBe(false);
    expect(isSandboxedHtmlMessage(message({ payload: { a: { b: { c: { d: { e: { f: 1 } } } } } } }), "channel-1", 3)).toBe(false);
  });

  it("不把 null origin 当作身份，身份由父窗口 source 在组件层校验", () => {
    expect(isSandboxedHtmlMessage(message(), "channel-1", 3)).toBe(true);
    expect(readSandboxedHtmlHeight({ ...message({ type: "RESIZE", payload: { height: 480 } }) } as never)).toBe(480);
  });

  it("拒绝超大消息并限制洪泛", () => {
    expect(isSandboxedHtmlMessage(message({ text: "x".repeat(5000) }), "channel-1", 3)).toBe(false);
    const limiter = createSandboxedHtmlRateLimiter();
    for (let i = 0; i < 10; i += 1) expect(limiter.accept(100)).toBe(true);
    expect(limiter.accept(100)).toBe(false);
    expect(limiter.accept(1100)).toBe(true);
  });
});
