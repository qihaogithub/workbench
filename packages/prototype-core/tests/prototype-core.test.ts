import { describe, expect, it } from "vitest";
import { applyPrototypeCommand, applyTextPatches } from "../src/index";

describe("prototype-core source patches", () => {
  it("edits the selected repeated text by stable id and preserves formatting", () => {
    const source = '<section>\n  <span data-ow-id="ow_a">Same</span>\n  <span>Same</span>\n</section>';
    const result = applyPrototypeCommand(source, { type: "set-text", target: { nodeId: "ow_a" }, text: "Changed & <ok>" });
    expect(result.nextSource).toBe('<section>\n  <span data-ow-id="ow_a">Changed &amp; &lt;ok&gt;</span>\n  <span>Same</span>\n</section>');
    expect(result.forwardPatches).toHaveLength(1);
  });

  it("resolves a prototype-root path and inserts a persistent id in one operation", () => {
    const source = '<div>\n  <p>Same</p>\n  <p>Same</p>\n</div>';
    const result = applyPrototypeCommand(source, { type: "set-text", target: { domPath: "prototype-root > div:nth-of-type(1) > p:nth-of-type(2)" }, text: "Second" }, { createNodeId: () => "ow_test" });
    expect(result.nextSource).toContain('<p data-ow-id="ow_test">Second</p>');
    expect(result.resolvedNodeId).toBe("ow_test");
  });

  it("rejects mixed nested content", () => {
    expect(() => applyPrototypeCommand('<p>Hello <strong>world</strong></p>', { type: "set-text", target: { domPath: "prototype-root > p" }, text: "Nope" })).toThrow(/single direct text node/);
  });

  it("adds, replaces and deletes attributes with escaped values", () => {
    const source = '<a class="link">Go</a>';
    const added = applyPrototypeCommand(source, { type: "set-attribute", target: { domPath: "prototype-root > a" }, name: "href", value: '/x?a=1&b="2"' }, { createNodeId: () => "ow_a" });
    expect(added.nextSource).toBe('<a class="link" href="/x?a=1&amp;b=&quot;2&quot;" data-ow-id="ow_a">Go</a>');
    const replaced = applyPrototypeCommand(added.nextSource, { type: "set-attribute", target: { nodeId: "ow_a" }, name: "class", value: "button" });
    expect(replaced.nextSource).toContain('class="button"');
    const removed = applyPrototypeCommand(replaced.nextSource, { type: "set-attribute", target: { nodeId: "ow_a" }, name: "href", value: null });
    expect(removed.nextSource).not.toContain("href=");
  });

  it("restores a command using inverse patches", () => {
    const source = '<div><span>old</span></div>';
    const result = applyPrototypeCommand(source, { type: "set-text", target: { domPath: "prototype-root > div > span" }, text: "a longer value" }, { createNodeId: () => "ow_x" });
    expect(applyTextPatches(result.nextSource, result.inversePatches)).toBe(source);
  });

  it("supports empty text elements", () => {
    const result = applyPrototypeCommand('<h1></h1>', { type: "set-text", target: { domPath: "prototype-root > h1" }, text: "Title" }, { createNodeId: () => "ow_h" });
    expect(result.nextSource).toBe('<h1 data-ow-id="ow_h">Title</h1>');
  });
});
