import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
  parseMarkdownReferences,
  type MarkdownReferenceTarget,
} from "@workbench/shared/markdown-reference";
import { readConfigDefinitionFieldAtPath } from "@workbench/shared/demo/config-schema-definition";
import { enumerateSchemaFields } from "@workbench/shared/demo/config-schema-fields";
import {
  buildMarkdownReferenceIndex,
  type MarkdownReferenceWorkspaceContext,
} from "./markdown-references";
import { getImage, getImageInfo } from "./image-store";
import { referenceFile } from "./markdown-reference-directory-io";

export const MAX_REFERENCE_FILE_BYTES = 1024 * 1024;
export const MAX_REFERENCE_OUTPUT_CHARS = 16_000;
export const MAX_REFERENCE_DIRECTORY_ENTRIES = 100;
export const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface MarkdownReferenceReadRequest {
  ownerUserId: string;
  sourceProjectId: string;
  sessionId: string;
  uri: string;
  mode?: "content" | "image";
  assetId?: string;
  offset?: number;
}

export interface MarkdownReferenceContent {
  uri: string;
  kind: MarkdownReferenceTarget["kind"];
  label: string;
  displayPath: string;
  content: string;
  contentHash: string;
  offset: number;
  nextOffset?: number;
  truncated: boolean;
  references: Array<{ uri: string; label: string }>;
  images: Array<{ assetId: string; label: string }>;
  warnings: string[];
}

export interface MarkdownReferenceImage {
  uri: string;
  assetId: string;
  mimeType: string;
  dataBase64: string;
}

type ReadFileResult = { text: string; truncated: boolean; warning?: string };

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function readBounded(
  root: string,
  relativePath: string,
): ReadFileResult | null {
  const file = referenceFile(root, relativePath);
  if (!file) return null;
  const stat = fs.statSync(file);
  if (stat.size > MAX_REFERENCE_FILE_BYTES) {
    return {
      text: "",
      truncated: true,
      warning: `已跳过超过 1MB 的文件：${path.basename(relativePath)}`,
    };
  }
  const text = fs.readFileSync(file, "utf8");
  return { text, truncated: false };
}

function boundedSection(
  sections: string[],
  name: string,
  root: string,
  relativePath: string,
  warnings: string[],
): boolean {
  try {
    const result = readBounded(root, relativePath);
    if (!result) return false;
    if (result.warning) warnings.push(result.warning);
    if (result.text) sections.push(`## ${name}\n\n${result.text}`);
    return true;
  } catch {
    warnings.push(`无法读取受管文件：${name}`);
    return false;
  }
}

function tokenizeFieldPath(fieldPath: string): Array<{
  key: string;
  array?: boolean;
  selector?: string;
  selected?: string;
}> | null {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < fieldPath.length; index += 1) {
    if (fieldPath[index] === "[") depth += 1;
    if (fieldPath[index] === "]") depth -= 1;
    if (depth < 0) return null;
    if (fieldPath[index] === "." && depth === 0) {
      parts.push(fieldPath.slice(start, index));
      start = index + 1;
    }
  }
  if (depth !== 0) return null;
  parts.push(fieldPath.slice(start));
  const tokens: Array<{
    key: string;
    array?: boolean;
    selector?: string;
    selected?: string;
  }> = [];
  for (const part of parts) {
    const bracket = part.indexOf("[");
    const key = bracket < 0 ? part : part.slice(0, bracket);
    if ((!key && bracket !== 0) || (bracket >= 0 && !part.endsWith("]")))
      return null;
    if (bracket < 0) {
      tokens.push({ key });
      continue;
    }
    const selector = part.slice(bracket + 1, -1);
    if (!selector) tokens.push({ key, array: true });
    else {
      const separator = selector.indexOf("=");
      tokens.push(
        separator < 0
          ? { key, selector }
          : {
              key,
              selector: selector.slice(0, separator),
              selected: selector.slice(separator + 1),
            },
      );
    }
  }
  return tokens;
}

function valueAtSchemaPath(
  value: unknown,
  fieldPath: string,
): { value?: unknown; warning?: string } {
  const tokens = tokenizeFieldPath(fieldPath);
  if (!tokens) return { warning: "配置字段路径格式无法安全解析" };
  let current: unknown[] = [value];
  for (const token of tokens) {
    const next: unknown[] = [];
    for (const item of current) {
      if (!item || typeof item !== "object") continue;
      const candidate = token.key
        ? (item as Record<string, unknown>)[token.key]
        : item;
      if (token.selector && token.selected === undefined)
        return {
          warning: "oneOf 分支没有 const/discriminator，无法安全定位当前值",
        };
      if (!token.selector && !token.array) next.push(candidate);
      else if (token.array && Array.isArray(candidate)) next.push(...candidate);
      else if (Array.isArray(candidate)) {
        const matches =
          token.selected === undefined
            ? candidate
            : candidate.filter(
                (entry) =>
                  entry &&
                  typeof entry === "object" &&
                  String(
                    (entry as Record<string, unknown>)[token.selector!],
                  ) === token.selected,
              );
        next.push(...matches);
      } else if (
        token.selector &&
        token.selected !== undefined &&
        typeof candidate === "object" &&
        candidate !== null &&
        String((candidate as Record<string, unknown>)[token.selector]) ===
          token.selected
      ) {
        next.push(candidate);
      }
    }
    if (!next.length)
      return { warning: `配置字段路径未能在当前值中定位：${fieldPath}` };
    current = next;
  }
  return {
    value: current.length === 1 ? current[0] : current,
    ...(current.length > 1
      ? { warning: "数组字段返回了所有匹配实例的聚合值" }
      : {}),
  };
}

function imageRefs(text: string): Array<{ assetId: string; label: string }> {
  const ids = new Set<string>();
  const result: Array<{ assetId: string; label: string }> = [];
  const patterns = [
    /\/api\/images\/([A-Za-z0-9_-]{1,240}(?:\.[A-Za-z0-9]{1,8})?)/g,
    /["']?(?:assetId|imageId)["']?\s*[:=]\s*["']([^"'<>\s]{1,240})["']/g,
    /\b(assets\/[^"'`<>\r\n)]+?)(?=["'`<>\r\n)]|$)/g,
  ];
  for (const pattern of patterns)
    for (const match of text.matchAll(pattern)) {
      const assetId = match[1];
      if (!assetId || ids.has(assetId)) continue;
      ids.add(assetId);
      result.push({ assetId, label: assetId });
    }
  return result;
}

function referenceRefs(text: string): Array<{ uri: string; label: string }> {
  const seen = new Set<string>();
  const result: Array<{ uri: string; label: string }> = [];
  for (const item of parseMarkdownReferences(text).references) {
    const uri = encodeMarkdownReferenceUri(item.target);
    if (seen.has(uri)) continue;
    seen.add(uri);
    result.push({ uri, label: item.labelSnapshot });
  }
  return result;
}

function pageName(
  result: ReturnType<typeof buildMarkdownReferenceIndex>,
  pageId: string,
): string {
  return (
    result.snapshot.pages?.find((page) => page.id === pageId)?.name ?? pageId
  );
}

function ensureTarget(
  result: ReturnType<typeof buildMarkdownReferenceIndex>,
  target: MarkdownReferenceTarget,
) {
  const entry = result.directory.get(target);
  if (!entry || entry.state === "missing")
    throw new Error("REFERENCE_NOT_FOUND");
  return entry;
}

function readContent(
  context: MarkdownReferenceWorkspaceContext,
  target: MarkdownReferenceTarget,
): MarkdownReferenceContent {
  const result = buildMarkdownReferenceIndex(context, {
    readMarkdown: false,
    maxResourceBytes: MAX_REFERENCE_FILE_BYTES,
  });
  const entry = ensureTarget(result, target);
  const warnings: string[] = [];
  const sections: string[] = [];
  let content = "";

  if (target.kind === "project") {
    const entries = result.directory
      .values()
      .filter((item) => item.target.kind !== "project" && item.state !== "missing");
    sections.push(`# ${entry.label}\n\n项目概述：${entry.displayPath}`);
    sections.push(
      `## 内容目录\n\n${entries.map((item) => `- ${JSON.stringify(item.label)} (${encodeMarkdownReferenceUri(item.target)})`).join("\n") || "（无）"}`,
    );
    warnings.push("项目目标仅返回概述和分页目录，页面或文档正文尚未读取");
  } else if (target.kind === "page") {
    const base = path.join("demos", target.pageId);
    sections.push(`# ${pageName(result, target.pageId)}`);
    boundedSection(
      sections,
      "页面需求",
      context.workspacePath,
      path.join(base, "requirements.md"),
      warnings,
    );
    boundedSection(
      sections,
      "页面配置 Schema",
      context.workspacePath,
      path.join(base, "config.schema.json"),
      warnings,
    );
    boundedSection(
      sections,
      "页面配置值",
      context.workspacePath,
      path.join(base, "config.values.json"),
      warnings,
    );
  } else if (target.kind === "document") {
    const kind = target.documentKind ?? "knowledge";
    const relativePath =
      kind === "knowledge"
        ? result.snapshot.documents?.find((doc) => doc.id === target.docId)
            ?.fileName &&
          path.join(
            "knowledge",
            result.snapshot.documents.find((doc) => doc.id === target.docId)!
              .fileName,
          )
        : kind === "memory"
          ? "memory.md"
          : kind === "project-convention"
            ? "convention.md"
            : kind === "page-convention"
              ? path.join("demos", target.docId, "convention.md")
              : path.join("design-spec", `spec-${target.docId}.json`);
    if (!relativePath) throw new Error("REFERENCE_NOT_FOUND");
    const found = boundedSection(
      sections,
      entry.label,
      context.workspacePath,
      relativePath,
      warnings,
    );
    if (!found) throw new Error("REFERENCE_NOT_FOUND");
  } else {
    const page = result.snapshot.pages?.find(
      (item) => item.id === target.pageId,
    );
    if (!page) throw new Error("REFERENCE_NOT_FOUND");
    const schemaPath = path.join("demos", target.pageId, "config.schema.json");
    const valuesPath = path.join("demos", target.pageId, "config.values.json");
    const schemaResult = readBounded(context.workspacePath, schemaPath);
    const valuesResult = readBounded(context.workspacePath, valuesPath);
    const definition = schemaResult?.text
      ? readConfigDefinitionFieldAtPath(schemaResult.text, target.fieldPath)
      : undefined;
    const catalogField = schemaResult?.text
      ? enumerateSchemaFields(schemaResult.text).find(
          (field) => field.key === target.fieldPath,
        )
      : undefined;
    if (!schemaResult?.text || (!definition && !catalogField))
      throw new Error("REFERENCE_NOT_FOUND");
    let resolvedValue: { value?: unknown; warning?: string } = {
      warning: "配置值文件不可用，未读取当前值",
    };
    try {
      if (valuesResult?.text)
        resolvedValue = valueAtSchemaPath(
          JSON.parse(valuesResult.text),
          target.fieldPath,
        );
    } catch {
      resolvedValue = { warning: "配置值不是有效 JSON，未读取当前值" };
    }
    if (resolvedValue.warning) warnings.push(resolvedValue.warning);
    content = `# ${entry.label}\n\n字段路径：${target.fieldPath}\n\n定义：\n${json(definition ?? catalogField)}\n\n当前值：\n${resolvedValue.value === undefined ? "（未安全解析）" : json(resolvedValue.value)}`;
  }

  if (!content) content = sections.join("\n\n");
  const refs =
    target.kind === "project"
      ? result.directory
          .values()
          .filter((item) => item.target.kind !== "project" && item.state !== "missing")
          .map((item) => ({
            uri: encodeMarkdownReferenceUri(item.target),
            label: item.label,
          }))
      : referenceRefs(content);
  if (/https?:\/\//.test(content)) warnings.push("外部图片 URL 不会自动下载；请先转为受管图片素材");
  const images = imageRefs(content);
  return {
    uri: encodeMarkdownReferenceUri(target),
    kind: target.kind,
    label: entry.label,
    displayPath: entry.displayPath,
    content,
    contentHash: hash(content),
    offset: 0,
    truncated: false,
    references: refs,
    images,
    warnings,
  };
}

function paginate(
  value: MarkdownReferenceContent,
  offset = 0,
): MarkdownReferenceContent {
  const start = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  if (value.kind === "project") {
    let content = `# ${value.label.slice(0, 200)}\n\n项目内容目录（未读取正文）\n`;
    const references: MarkdownReferenceContent["references"] = [];
    for (const reference of value.references.slice(start, start + MAX_REFERENCE_DIRECTORY_ENTRIES)) {
      const label = reference.label.slice(0, 200);
      const line = `\n- ${JSON.stringify(label)} (${reference.uri})`;
      if (content.length + line.length > MAX_REFERENCE_OUTPUT_CHARS) break;
      content += line;
      references.push({ ...reference, label });
    }
    const end = start + references.length;
    return { ...value, content, references, images: [], offset: start,
      truncated: end < value.references.length,
      ...(end < value.references.length ? { nextOffset: end } : {}) };
  }
  const content = value.content;
  let end = Math.min(start + MAX_REFERENCE_OUTPUT_CHARS, content.length);
  // Keep links intact across pages so their targets/assets remain discoverable.
  const parsed = parseMarkdownReferences(content);
  for (const link of [...parsed.links, ...parsed.references]) {
    if (link.start > start && link.start < end && link.end > end) end = link.start;
  }
  const pageContent = content.slice(start, end);
  return {
    ...value,
    content: pageContent,
    offset: start,
    references: parsed.references
      .filter((item) => item.start >= start && item.end <= end)
      .map((item) => ({ uri: encodeMarkdownReferenceUri(item.target), label: item.labelSnapshot }))
      .slice(0, MAX_REFERENCE_DIRECTORY_ENTRIES),
    images: imageRefs(pageContent).slice(0, MAX_REFERENCE_DIRECTORY_ENTRIES),
    ...(end < content.length
      ? { nextOffset: end, truncated: true }
      : { nextOffset: undefined, truncated: false }),
  };
}

export function readMarkdownReferenceContent(
  context: MarkdownReferenceWorkspaceContext,
  uri: string,
  offset = 0,
): MarkdownReferenceContent {
  const target = decodeMarkdownReferenceUri(uri);
  if (!target || target.projectId !== context.projectId || encodeMarkdownReferenceUri(target) !== uri)
    throw new Error("REFERENCE_NOT_FOUND");
  return paginate(readContent(context, target), offset);
}

export async function readMarkdownReferenceImage(
  context: MarkdownReferenceWorkspaceContext,
  uri: string,
  assetId: string,
): Promise<MarkdownReferenceImage> {
  const target = decodeMarkdownReferenceUri(uri);
  if (!target || target.projectId !== context.projectId || encodeMarkdownReferenceUri(target) !== uri || !assetId)
    throw new Error("IMAGE_NOT_FOUND");
  const content = readContent(context, target);
  if (!content.images.some((item) => item.assetId === assetId))
    throw new Error("IMAGE_NOT_IN_REFERENCE");

  const info = getImageInfo(assetId);
  if (info && info.projectRefs.includes(target.projectId)) {
    if (info.sizeBytes > MAX_REFERENCE_IMAGE_BYTES)
      throw new Error("IMAGE_TOO_LARGE");
    const image = getImage(assetId);
    if (!image.buffer || !image.mimeType) throw new Error("IMAGE_NOT_FOUND");
    if (
      image.buffer.length > MAX_REFERENCE_IMAGE_BYTES ||
      !new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]).has(
        image.mimeType,
      )
    )
      throw new Error("IMAGE_NOT_SUPPORTED");
    const globalMetadata = await sharp(image.buffer).metadata();
    if (
      !globalMetadata.format ||
      !new Set(["png", "jpeg", "gif", "webp"]).has(globalMetadata.format)
    )
      throw new Error("IMAGE_NOT_SUPPORTED");
    return {
      uri: encodeMarkdownReferenceUri(target),
      assetId,
      mimeType: globalMetadata.format === "jpeg" ? "image/jpeg" : `image/${globalMetadata.format}`,
      dataBase64: image.buffer.toString("base64"),
    };
  }

  if (assetId.startsWith("assets/")) {
    const file = referenceFile(context.workspacePath, assetId);
    if (!file) throw new Error("IMAGE_NOT_FOUND");
    const stat = fs.statSync(file);
    if (stat.size > MAX_REFERENCE_IMAGE_BYTES)
      throw new Error("IMAGE_TOO_LARGE");
    const buffer = fs.readFileSync(file);
    if (buffer.length > MAX_REFERENCE_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
    const metadata = await sharp(buffer).metadata();
    if (
      !metadata.format ||
      !new Set(["png", "jpeg", "gif", "webp"]).has(metadata.format)
    )
      throw new Error("IMAGE_NOT_SUPPORTED");
    const mimeType =
      metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`;
    return {
      uri: encodeMarkdownReferenceUri(target),
      assetId,
      mimeType,
      dataBase64: buffer.toString("base64"),
    };
  }
  throw new Error("IMAGE_NOT_SUPPORTED");
}
