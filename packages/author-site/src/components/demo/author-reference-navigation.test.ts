import { encodeMarkdownReferenceUri, type MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";
import { buildAuthorReferenceUrl, resolveAuthorReference, openAuthorReference, fetchAuthorReferenceCandidates } from "./markdown-reference-navigation";

const projectId = "项目 &%/?";
const destinations: MarkdownReferenceTarget[] = [
  { kind: "page", projectId, pageId: "页 &%/#" },
  { kind: "config", projectId, pageId: "页面", fieldPath: "cards[].title" },
  { kind: "config", projectId, pageId: "页面", fieldPath: "cards[type=图文].image" },
  { kind: "document", projectId, docId: "知识 &%/#" },
  { kind: "document", projectId, documentKind: "memory", docId: "memory" },
  { kind: "document", projectId, documentKind: "project-convention", docId: "convention" },
  { kind: "document", projectId, documentKind: "page-convention", docId: "页面" },
  { kind: "document", projectId, documentKind: "design-spec", docId: "规范" },
];

describe("Author 项目引用导航", () => {
  it.each(destinations)("编码及验证目标 %#", (target) => {
    const url = new URL(buildAuthorReferenceUrl(projectId, target), "https://author.example");
    expect(url.pathname).toBe(`/demo/${encodeURIComponent(projectId)}/edit`);
    expect([...url.searchParams.keys()]).toEqual(["reference"]);
    expect(url.searchParams.get("reference")).toBe(encodeMarkdownReferenceUri(target));
    expect(resolveAuthorReference(projectId, url.searchParams.get("reference")!, [{ target, displayPath: "标题" }])).toEqual(target);
  });
  it("拒绝跨项目、缺失、不支持和格式错误的目标", () => {
    const target = destinations[0];
    expect(() => buildAuthorReferenceUrl("other", target)).toThrow();
    expect(() => resolveAuthorReference("other", encodeMarkdownReferenceUri(target), [{ target, displayPath: "" }])).toThrow();
    expect(() => resolveAuthorReference(projectId, encodeMarkdownReferenceUri(target), [])).toThrow();
    expect(() => resolveAuthorReference(projectId, "javascript:alert(1)", [])).toThrow();
    expect(() => buildAuthorReferenceUrl(projectId, { kind: "project", projectId })).toThrow();
  });
  it("知识文档显式分类与省略分类使用相同身份", () => {
    const target: MarkdownReferenceTarget = { kind: "document", projectId, docId: "doc" };
    expect(resolveAuthorReference(projectId, encodeMarkdownReferenceUri(target), [{ target: { ...target, documentKind: "knowledge" }, displayPath: "" }])).toEqual(target);
  });
  it("不允许相同字段路径冒用其他页面的候选身份", () => {
    const target: MarkdownReferenceTarget = { kind: "config", projectId, pageId: "page-a", fieldPath: "cards[].title" };
    expect(() => resolveAuthorReference(projectId, encodeMarkdownReferenceUri(target), [
      { target: { ...target, pageId: "page-b" }, displayPath: "同名字段" },
    ])).toThrow();
  });
  it("打开隔离的新浏览器标签且不使用原生 wb 协议", () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    openAuthorReference(projectId, destinations[0]);
    expect(open).toHaveBeenCalledWith(buildAuthorReferenceUrl(projectId, destinations[0]), "_blank", "noopener,noreferrer");
    open.mockRestore();
  });
  it("空查询保留全部候选及层级元数据，没有客户端数量上限", async () => {
    const candidates = Array.from({ length: 300 }, (_, i) => ({ target: destinations[0], label: String(i), displayPath: "路径", hierarchy: [{ id: "f", label: "目录", kind: "folder" }] }));
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { candidates } }) });
    const original = global.fetch;
    global.fetch = fetchMock;
    try {
      expect(await fetchAuthorReferenceCandidates(projectId, "session", "")).toEqual(candidates);
      const url = new URL(fetchMock.mock.calls[0][0], "https://author.example");
      expect(url.searchParams.get("kind")).toBe("page,config,document");
      expect(url.searchParams.get("q")).toBe("");
      expect(url.searchParams.has("limit")).toBe(false);
    } finally { global.fetch = original; }
  });
  it.each([
    { ok: false },
    { ok: true, json: async () => ({ success: false }) },
    { ok: true, json: async () => ({ success: true, data: {} }) },
  ])("目录请求失败应抛出错误供 UI 重试 %#", async (response) => {
    const original = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(response);
    try {
      await expect(fetchAuthorReferenceCandidates(projectId, undefined, "")).rejects.toThrow();
    } finally { global.fetch = original; }
  });
});
