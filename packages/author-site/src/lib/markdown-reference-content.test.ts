/** @jest-environment node */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { encodeMarkdownReferenceUri } from "@workbench/shared/markdown-reference";
import sharp from "sharp";

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), "markdown-reference-read-"),
);

jest.mock("./markdown-references", () => ({
  buildMarkdownReferenceIndex: jest.fn(),
}));
jest.mock("./image-store", () => ({
  getImage: jest.fn(),
  getImageInfo: jest.fn(),
}));

import { buildMarkdownReferenceIndex } from "./markdown-references";
import {
  readMarkdownReferenceContent,
  readMarkdownReferenceImage,
} from "./markdown-reference-content";
import { getImage, getImageInfo } from "./image-store";

const pages = [{ id: "page-1", name: "首页" }];
const documents = [
  {
    id: "doc-1",
    title: "指南",
    source: "user",
    description: "",
    fileName: "guide.md",
    addedAt: "",
    updatedAt: "",
  },
];
const targets = [
  { kind: "project" as const, projectId: "source" },
  { kind: "page" as const, projectId: "source", pageId: "page-1" },
  { kind: "document" as const, projectId: "source", docId: "doc-1" },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "title",
  },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "中文字段",
  },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "cards[].image",
  },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "slides[type=图文].image",
  },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "choice[type=图文].image",
  },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "[type=根图].image",
  },
  {
    kind: "config" as const,
    projectId: "source",
    pageId: "page-1",
    fieldPath: "[oneOf#2].image",
  },
];

beforeAll(() => {
  fs.mkdirSync(path.join(workspace, "demos", "page-1"), { recursive: true });
  fs.mkdirSync(path.join(workspace, "knowledge"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "demos", "page-1", "requirements.md"),
    "需求 [指南](wb://document/source/doc-1)",
  );
  fs.writeFileSync(
    path.join(workspace, "demos", "page-1", "config.schema.json"),
    JSON.stringify({
      type: "object",
      properties: {
        title: { type: "string", title: "标题" },
        中文字段: { type: "string", title: "中文字段" },
        cards: {
          type: "array",
          items: {
            properties: { image: { type: "string", title: "卡片图片" } },
          },
        },
        slides: {
          type: "array",
          items: {
            oneOf: [
              {
                properties: {
                  type: { const: "图文" },
                  image: { type: "string", title: "图片" },
                },
              },
              {
                properties: {
                  type: { const: "视频" },
                  image: { type: "string", title: "视频封面" },
                },
              },
            ],
          },
        },
        choice: {
          oneOf: [
            {
              properties: {
                type: { const: "图文" },
                image: { type: "string", title: "选择图片" },
              },
            },
          ],
        },
      },
      oneOf: [
        {
          properties: {
            type: { const: "根图" },
            image: { type: "string", title: "根图片" },
          },
        },
        { properties: { image: { type: "string", title: "无判别图片" } } },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(workspace, "demos", "page-1", "config.values.json"),
    JSON.stringify({
      title: "Hello",
      中文字段: "中文值",
      cards: [
        { image: "/api/images/photo-one" },
        { image: "/api/images/photo-two" },
      ],
      slides: [
        { type: "图文", image: "/api/images/photo-one" },
        { type: "视频", image: "/api/images/photo-two" },
      ],
      choice: { type: "图文", image: "/api/images/choice" },
      type: "根图",
      image: "/api/images/root",
    }),
  );
  fs.writeFileSync(
    path.join(workspace, "knowledge", "guide.md"),
    "# 指南\n正文",
  );
});

beforeEach(() => {
  const entries = new Map(
    targets.map((target) => [
      encodeMarkdownReferenceUri(target),
      {
        target,
        label:
          target.kind === "project"
            ? "项目"
            : target.kind === "page"
              ? "首页"
              : target.kind === "document"
                ? "指南"
                : "标题",
        displayPath: "项目 / 目标",
      },
    ]),
  );
  jest.mocked(buildMarkdownReferenceIndex).mockReturnValue({
    directory: {
      get: (target: (typeof targets)[number]) =>
        entries.get(encodeMarkdownReferenceUri(target)) ?? null,
      values: () => [...entries.values()],
    },
    snapshot: { pages, documents, project: { id: "source", name: "项目" } },
  } as never);
});

const context = {
  projectId: "source",
  workspaceId: "workspace",
  workspacePath: workspace,
};

it.each(targets)(
  "reads the registered $kind target through canonical URI",
  (target) => {
    const result = readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(target),
    );
    expect(result.uri).toBe(encodeMarkdownReferenceUri(target));
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.content).not.toContain(workspace);
  },
);

it("deduplicates references and paginates output without recursion", () => {
  const page = readMarkdownReferenceContent(
    context,
    encodeMarkdownReferenceUri(targets[1]),
  );
  expect(page.references).toEqual([
    { uri: "wb://document/source/doc-1", label: "指南" },
  ]);
  expect(
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[1]),
      16,
    ).offset,
  ).toBe(16);
});

it("resolves Unicode fields and aggregates array/oneOf instances", () => {
  expect(
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[4]),
    ).content,
  ).toContain("中文值");
  expect(
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[5]),
    ).content,
  ).toContain("photo-one");
  expect(
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[5]),
    ).content,
  ).toContain("photo-two");
  const branch = readMarkdownReferenceContent(
    context,
    encodeMarkdownReferenceUri(targets[6]),
  );
  expect(branch.content).toContain("photo-one");
  expect(branch.content).not.toContain("photo-two");
  expect(
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[7]),
    ).content,
  ).toContain("choice");
  expect(
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[8]),
    ).content,
  ).toContain("root");
  const ambiguous = readMarkdownReferenceContent(
    context,
    encodeMarkdownReferenceUri(targets[9]),
  );
  expect(ambiguous.content).toContain("（未安全解析）");
  expect(ambiguous.warnings).toEqual(
    expect.arrayContaining([expect.stringContaining("无法安全定位")]),
  );
});

it("returns canonical project directory references and rejects a missing document", () => {
  const project = readMarkdownReferenceContent(
    context,
    encodeMarkdownReferenceUri(targets[0]),
  );
  expect(project.references).toEqual(
    expect.arrayContaining([
      { uri: "wb://page/source/page-1", label: "首页" },
      { uri: "wb://document/source/doc-1", label: "指南" },
    ]),
  );
  fs.unlinkSync(path.join(workspace, "knowledge", "guide.md"));
  expect(() =>
    readMarkdownReferenceContent(
      context,
      encodeMarkdownReferenceUri(targets[2]),
    ),
  ).toThrow("REFERENCE_NOT_FOUND");
  fs.writeFileSync(
    path.join(workspace, "knowledge", "guide.md"),
    "# 指南\n正文",
  );
});

it("returns raster pixels only for an asset owned by the target project", async () => {
  const buffer = await sharp({
    create: { width: 1, height: 1, channels: 4, background: "#fff" },
  })
    .png()
    .toBuffer();
  jest.mocked(getImageInfo).mockReturnValue({
    id: "photo-one",
    sha256: "hash",
    filename: "one.png",
    mimeType: "image/png",
    sizeBytes: buffer.length,
    sourceType: "user_upload",
    createdAt: 0,
    createdBy: "test",
    projectRefs: ["source"],
  });
  jest.mocked(getImage).mockReturnValue({
    buffer,
    mimeType: "image/png",
    sizeBytes: buffer.length,
  });
  const image = await readMarkdownReferenceImage(
    context,
    encodeMarkdownReferenceUri(targets[1]),
    "photo-one",
  );
  expect(
    (await sharp(Buffer.from(image.dataBase64, "base64")).metadata()).width,
  ).toBe(1);
  jest.mocked(getImageInfo).mockReturnValue({
    id: "photo-one",
    sha256: "hash",
    filename: "one.png",
    mimeType: "image/png",
    sizeBytes: buffer.length,
    sourceType: "user_upload",
    createdAt: 0,
    createdBy: "test",
    projectRefs: ["other"],
  });
  await expect(
    readMarkdownReferenceImage(
      context,
      encodeMarkdownReferenceUri(targets[1]),
      "photo-one",
    ),
  ).rejects.toThrow("IMAGE_NOT_SUPPORTED");
});

it("paginates every project entry beyond 100 without duplicates or lost targets", () => {
  const base = buildMarkdownReferenceIndex(context);
  const entries = Array.from({ length: 225 }, (_, index) => ({
    target: { kind: "document" as const, projectId: "source", docId: `doc-${index}` },
    label: `文档 ${index}`, displayPath: `项目 / 文档 ${index}`,
  }));
  jest.mocked(buildMarkdownReferenceIndex).mockReturnValue({ ...base,
    directory: { ...base.directory, values: () => entries },
  } as never);
  const first = readMarkdownReferenceContent(context, "wb://project/source");
  const second = readMarkdownReferenceContent(context, "wb://project/source", first.nextOffset);
  const third = readMarkdownReferenceContent(context, "wb://project/source", second.nextOffset);
  expect(first.references).toHaveLength(100);
  expect(second.references).toHaveLength(100);
  expect(third.references).toHaveLength(25);
  expect(third.truncated).toBe(false);
  expect(new Set([...first.references, ...second.references, ...third.references].map(ref => ref.uri)).size).toBe(225);
  expect(second.content).toContain("wb://document/source/doc-100");
  expect(second.content).not.toContain("wb://document/source/doc-0)");
});

it("extracts Markdown image ids without closing punctuation and limits page metadata", () => {
  const file = path.join(workspace, "knowledge", "guide.md");
  fs.writeFileSync(file, "![参考](/api/images/photo-one)\n" + "x".repeat(17000) + "\n![后页](/api/images/photo-two)");
  const first = readMarkdownReferenceContent(context, "wb://document/source/doc-1");
  expect(first.images).toEqual([{ assetId: "photo-one", label: "photo-one" }]);
  const second = readMarkdownReferenceContent(context, "wb://document/source/doc-1", first.nextOffset);
  expect(second.images).toEqual([{ assetId: "photo-two", label: "photo-two" }]);
  fs.writeFileSync(file, "# 指南\n正文");
});

it("reads a page without a values file and rejects a foreign image id", async () => {
  const file = path.join(workspace, "demos", "page-1", "config.values.json");
  const original = fs.readFileSync(file);
  fs.unlinkSync(file);
  try {
    expect(readMarkdownReferenceContent(context, "wb://page/source/page-1").content).toContain("页面需求");
    await expect(readMarkdownReferenceImage(context, "wb://page/source/page-1", "not-in-content")).rejects.toThrow("IMAGE_NOT_IN_REFERENCE");
  } finally { fs.writeFileSync(file, original); }
});

it("rejects symlink assets escaping the workspace", async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "reference-outside-"));
  const file = path.join(workspace, "knowledge", "guide.md");
  fs.mkdirSync(path.join(workspace, "assets"), { recursive: true });
  fs.writeFileSync(path.join(outside, "private.png"), "private");
  const link = path.join(workspace, "assets", "escape.png");
  fs.symlinkSync(path.join(outside, "private.png"), link);
  fs.writeFileSync(file, "![图片](assets/escape.png)");
  jest.mocked(getImageInfo).mockReturnValue(null);
  try {
    await expect(readMarkdownReferenceImage(context, "wb://document/source/doc-1", "assets/escape.png")).rejects.toThrow("REFERENCE_DIRECTORY_UNAVAILABLE");
  } finally {
    fs.unlinkSync(link);
    fs.rmSync(outside, { recursive: true, force: true });
    fs.writeFileSync(file, "# 指南\n正文");
  }
});

it("does not lose references spanning a text page boundary", () => {
  const file = path.join(workspace, "knowledge", "guide.md");
  fs.writeFileSync(file, "x".repeat(15960) + "\n[这是一个跨越分页边界的较长引用名称](wb://project/source)\nend");
  const first = readMarkdownReferenceContent(context, "wb://document/source/doc-1");
  const second = readMarkdownReferenceContent(context, "wb://document/source/doc-1", first.nextOffset);
  expect(second.references).toEqual([{ uri: "wb://project/source", label: "这是一个跨越分页边界的较长引用名称" }]);
  fs.writeFileSync(file, "# 指南\n正文");
});
