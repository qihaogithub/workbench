import { parseFragment } from "parse5";

interface Location {
  startOffset: number;
  endOffset: number;
  startTag?: Location & { attrs?: Record<string, Location> };
  endTag?: Location;
  attrs?: Record<string, Location>;
}
interface Attr { name: string; value: string }
interface Node {
  nodeName: string;
  childNodes: Node[];
  sourceCodeLocation?: Location;
}
interface Element extends Node {
  tagName: string;
  attrs: Attr[];
}
interface ParentNode extends Node {}

export interface TextPatch {
  start: number;
  end: number;
  text: string;
}

export interface PrototypeTarget {
  nodeId?: string;
  domPath?: string;
}

export interface SetTextCommand {
  type: "set-text";
  target: PrototypeTarget;
  text: string;
}

export interface SetAttributeCommand {
  type: "set-attribute";
  target: PrototypeTarget;
  name: string;
  value?: string | null;
}

export type PrototypeCommand = SetTextCommand | SetAttributeCommand;

export interface ApplyCommandOptions {
  createNodeId?: () => string;
}

export interface CommandResult {
  nextSource: string;
  forwardPatches: TextPatch[];
  inversePatches: TextPatch[];
  resolvedNodeId: string;
}

const DEFAULT_ID_FACTORY = () => {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  const randomUuid = cryptoApi?.randomUUID?.();
  return `ow_${randomUuid ?? fallbackId()}`;
};

let fallbackCounter = 0;
function fallbackId(): string {
  fallbackCounter += 1;
  return `${Date.now().toString(36)}_${fallbackCounter.toString(36)}`;
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}

function locationStart(node: Node): number | undefined {
  return node.sourceCodeLocation?.startOffset;
}

function locationEnd(node: Node): number | undefined {
  return node.sourceCodeLocation?.endOffset;
}

function assertLocation(value: number | undefined, message: string): number {
  if (value === undefined) throw new Error(message);
  return value;
}

function elementAttrs(node: Element): Map<string, { value: string; start: number; end: number }> {
  const result = new Map<string, { value: string; start: number; end: number }>();
  const attrsLocation = node.sourceCodeLocation?.attrs;
  for (const attr of node.attrs) {
    const location = attrsLocation?.[attr.name];
    if (location) {
      result.set(attr.name, {
        value: attr.value,
        start: location.startOffset,
        end: location.endOffset,
      });
    }
  }
  return result;
}

function findById(node: Node, nodeId: string): Element | undefined {
  if (node.nodeName === "#document-fragment") {
    for (const child of node.childNodes) {
      const found = findById(child, nodeId);
      if (found) return found;
    }
    return undefined;
  }
  if (node.nodeName !== "#text" && node.nodeName !== "#comment") {
    const element = node as Element;
    if (element.attrs.some((attr) => attr.name === "data-ow-id" && attr.value === nodeId)) return element;
    for (const child of element.childNodes) {
      const found = findById(child, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}

function elementChildren(parent: ParentNode): Element[] {
  return parent.childNodes.filter((child) => child.nodeName !== "#text" && child.nodeName !== "#comment") as Element[];
}

function findByDomPath(root: ParentNode, path: string): Element | undefined {
  const parts = path.split(">").map((part) => part.trim()).filter(Boolean);
  if (parts[0]?.toLowerCase() === "prototype-root") parts.shift();
  let parent: ParentNode = root;
  for (const part of parts) {
    const match = /^([a-z][\w:-]*)(?::nth-of-type\((\d+)\))?$/i.exec(part);
    if (!match) return undefined;
    const tag = match[1].toLowerCase();
    const wantedIndex = Number(match[2] ?? 1);
    const candidates = elementChildren(parent).filter((child) => child.tagName.toLowerCase() === tag);
    const next = candidates[wantedIndex - 1];
    if (!next) return undefined;
    parent = next;
  }
  return parent === root ? undefined : (parent as Element);
}

function resolveTarget(root: ParentNode, target: PrototypeTarget): Element {
  const found = target.nodeId ? findById(root, target.nodeId) : undefined;
  const byPath = found ?? (target.domPath ? findByDomPath(root, target.domPath) : undefined);
  if (!byPath) throw new Error("Prototype target not found");
  return byPath;
}

function idOf(node: Element): string | undefined {
  return node.attrs.find((attr) => attr.name === "data-ow-id")?.value;
}

function identityPatch(source: string, node: Element, nodeId: string): TextPatch {
  const startTag = node.sourceCodeLocation?.startTag;
  const start = assertLocation(startTag?.endOffset, "Target start tag location unavailable") - 1;
  const insertion = source[start - 1] === "/" ? start - 1 : start;
  return { start: insertion, end: insertion, text: ` data-ow-id="${escapeAttribute(nodeId)}"` };
}

function startTagEnd(node: Element): number {
  return assertLocation(node.sourceCodeLocation?.startTag?.endOffset, "Target start tag location unavailable");
}

function makeAttributePatch(source: string, node: Element, name: string, value: string | null | undefined): TextPatch {
  const attrs = elementAttrs(node);
  const existing = attrs.get(name);
  if (value === null || value === undefined) {
    if (!existing) return { start: 0, end: 0, text: "" };
    return { start: existing.start, end: existing.end, text: "" };
  }
  const replacement = `${name}="${escapeAttribute(value)}"`;
  if (existing) return { start: existing.start, end: existing.end, text: replacement };
  const tagEnd = startTagEnd(node);
  const closeIndex = source[tagEnd - 2] === "/" ? tagEnd - 2 : tagEnd - 1;
  return { start: closeIndex, end: closeIndex, text: ` ${replacement}` };
}

function applyTextPatchesInternal(source: string, patches: TextPatch[]): string {
  const ordered = [...patches].sort((a, b) => b.start - a.start);
  let result = source;
  for (const patch of ordered) {
    if (patch.start < 0 || patch.end < patch.start || patch.end > result.length) throw new Error("Invalid text patch");
    result = result.slice(0, patch.start) + patch.text + result.slice(patch.end);
  }
  return result;
}

export function applyTextPatches(source: string, patches: TextPatch[]): string {
  const ordered = [...patches].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].end > ordered[index].start) throw new Error("Overlapping text patches");
  }
  return applyTextPatchesInternal(source, patches);
}

function invertPatches(source: string, patches: TextPatch[]): TextPatch[] {
  let delta = 0;
  return [...patches].sort((a, b) => a.start - b.start).map((patch) => {
    const start = patch.start + delta;
    const inverse = { start, end: start + patch.text.length, text: source.slice(patch.start, patch.end) };
    delta += patch.text.length - (patch.end - patch.start);
    return inverse;
  });
}

function applySetText(source: string, node: Element, text: string): TextPatch {
  const children = node.childNodes;
  if (children.length === 0) {
    const start = assertLocation(node.sourceCodeLocation?.startTag?.endOffset, "Target start tag location unavailable");
    return { start, end: start, text: escapeHtmlText(text) };
  }
  if (children.length !== 1 || children[0].nodeName !== "#text") {
    throw new Error("set-text only supports a single direct text node or an empty text element");
  }
  const textNode = children[0];
  const start = assertLocation(locationStart(textNode), "Text node location unavailable");
  const end = assertLocation(locationEnd(textNode), "Text node location unavailable");
  return { start, end, text: escapeHtmlText(text) };
}

export function applyPrototypeCommand(source: string, command: PrototypeCommand, options: ApplyCommandOptions = {}): CommandResult {
  const root = parseFragment(source, { sourceCodeLocationInfo: true }) as unknown as ParentNode;
  const node = resolveTarget(root, command.target);
  const existingId = idOf(node);
  const resolvedNodeId = existingId ?? options.createNodeId?.() ?? DEFAULT_ID_FACTORY();
  const patches: TextPatch[] = [];
  if (!existingId) patches.push(identityPatch(source, node, resolvedNodeId));

  if (command.type === "set-text") {
    patches.push(applySetText(source, node, command.text));
  } else {
    const patch = makeAttributePatch(source, node, command.name, command.value);
    if (patch.start !== patch.end || patch.text !== "") patches.push(patch);
  }

  const forwardPatches = patches;
  const nextSource = applyTextPatches(source, forwardPatches);
  return {
    nextSource,
    forwardPatches,
    inversePatches: invertPatches(source, forwardPatches),
    resolvedNodeId,
  };
}
