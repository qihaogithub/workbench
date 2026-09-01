import type { SketchSceneDocument } from "@workbench/sketch-core";
import type { DemoFolderMeta, DemoPageMeta, DemoPageRuntimeType, KnowledgeIndexItem, PagePresentationProfile } from "@workbench/shared";
import type { CanvasState } from "@workbench/demo-ui";
import type { MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";

export type PublishedPageRuntimeType =
  | "prototype-html-css"
  | "high-fidelity-react"
  | "sandboxed-html"
  | "sketch-scene";

export interface PreviewSize {
  width?: string | number;
  height?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;
  scale?: number;
}

export interface PublishedDemoPage {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
  runtimeType?: PublishedPageRuntimeType;
  compiledJsPath?: string;
  iframeHtmlPath?: string;
  schemaPath?: string;
  previewSize?: PreviewSize;
  presentation?: PagePresentationProfile;
  screenshotPath?: string;
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: Record<string, unknown>;
  prototypeHtmlPath?: string;
  prototypeCssPath?: string;
  prototypeMetaPath?: string;
  sketchScene?: SketchSceneDocument;
  sketchMeta?: Record<string, unknown>;
  sketchScenePath?: string;
  sketchMetaPath?: string;
  sandboxExecutionPath?: string;
  htmlImportMeta?: {
    source: "html-import";
    analysisVersion: number;
    sourceHash: string;
    normalizedHash: string;
    sandboxPolicyVersion: number;
    viewport?: { width: number; height: number };
  };
  sandboxRendererVersion?: number;
  requirements?: string;
}

export interface PublishedHtmlExecution {
  executionUrl: string;
  channelId: string;
  expiresAt: number;
  sandboxPolicyVersion: number;
}

export interface PublishedDesignSpecMeta {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublishedDesignSpecDoc extends PublishedDesignSpecMeta {
  entries: Array<{
    id: string;
    title: string;
    markdown: string;
    refs: Array<{ scope: "project" | "page"; pageId?: string; fieldKey: string }>;
  }>;
}

export interface PublishedProject {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;
  publishedVersion: string;
  publishedAt: number;
  demoPages: PublishedDemoPage[];
  demoFolders: DemoFolderMeta[];
  projectConfigSchema?: string;
  projectConfigValues?: Record<string, unknown>;
  canvasState?: CanvasState;
  knowledge?: KnowledgeIndexItem[];
  designSpecs?: PublishedDesignSpecMeta[];
  markdownReferences?: PublishedMarkdownReferenceSnapshot;
}

export interface PublishedMarkdownReferenceTarget {
  target: MarkdownReferenceTarget;
  label: string;
  publishedPath: string;
  aliases?: string[];
}

export interface PublishedMarkdownReferenceEdge {
  source:
    | { kind: "knowledge-document"; docId: string }
    | { kind: "page-requirements"; pageId: string }
    | { kind: "design-spec-entry"; specId: string; entryId: string };
  target?: MarkdownReferenceTarget;
  labelSnapshot: string;
  targetState: "resolved" | "publish-unavailable";
  line: number;
  column: number;
}

export interface PublishedMarkdownReferenceSnapshot {
  version: 1;
  projectId: string;
  publishedVersion: string;
  canonicalSnapshot: {
    versionId: string;
    workspaceId?: string;
    workspaceRevision?: number;
    workspaceRootHash?: string;
  };
  targets: PublishedMarkdownReferenceTarget[];
  documentPaths: Record<string, string>;
  edges: PublishedMarkdownReferenceEdge[];
  unresolvedCount: number;
}

export interface ProjectsIndex {
  projects: Array<{
    id: string;
    name: string;
    description?: string;
    thumbnail?: string;
    publishedAt: number;
    publishedVersion: string;
    demoCount: number;
  }>;
  generatedAt: number;
}

type PublicRuntimeEnv = {
  NEXT_PUBLIC_DATA_BASE?: string;
  NEXT_PUBLIC_VIEWER_DOCKER_MODE?: string;
};

export function resolveDataBase(env: PublicRuntimeEnv): string {
  // A Docker viewer serves published data through its own nginx origin. Do not
  // let a developer's root .env endpoint become part of that static bundle.
  if (env.NEXT_PUBLIC_VIEWER_DOCKER_MODE === "true") return "";

  return (
    env.NEXT_PUBLIC_DATA_BASE ||
    (process.env.NODE_ENV === "development" ? "http://localhost:4200" : "")
  );
}

export const DATA_BASE = resolveDataBase({
  NEXT_PUBLIC_DATA_BASE: process.env.NEXT_PUBLIC_DATA_BASE,
  NEXT_PUBLIC_VIEWER_DOCKER_MODE:
    process.env.NEXT_PUBLIC_VIEWER_DOCKER_MODE,
});

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`数据加载失败: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `数据加载失败: 期望 JSON 响应但收到 ${contentType || "未知类型"}。` +
        (DATA_BASE
          ? `请确认数据源 (${DATA_BASE}) 可访问且已发布数据。`
          : `NEXT_PUBLIC_DATA_BASE 未配置，请求可能被前端路由拦截。本地开发请设置 NEXT_PUBLIC_DATA_BASE=http://localhost:3200`),
    );
  }
  return res.json();
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${DATA_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`文档加载失败: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

export async function getProjects(): Promise<ProjectsIndex> {
  return fetchJson<ProjectsIndex>("/data/projects.json");
}

export async function getProjectData(
  projectId: string,
): Promise<PublishedProject> {
  return fetchJson<PublishedProject>(`/data/${projectId}/project.json`);
}

export async function getDemoSchema(
  projectId: string,
  schemaPath: string,
): Promise<Record<string, unknown>> {
  return fetchJson<Record<string, unknown>>(
    `/data/${projectId}/${schemaPath}`,
  );
}

export async function getKnowledgeDocContent(
  projectId: string,
  fileName: string,
): Promise<string> {
  const content = await fetchText(
    `/data/${projectId}/knowledge/${encodeURIComponent(fileName)}`,
  );
  return content;
}

export async function getDesignSpecDoc(
  projectId: string,
  docId: string,
): Promise<PublishedDesignSpecDoc> {
  return fetchJson<PublishedDesignSpecDoc>(
    `/data/${projectId}/design-spec/spec-${encodeURIComponent(docId)}.json`,
  );
}

export function getDataUrl(path: string): string {
  if (/^(?:https?:|data:|blob:)/.test(path)) {
    return path;
  }
  return `${DATA_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getThumbnailUrl(thumbnail: string): string {
  return getDataUrl(thumbnail);
}

export function getScreenshotFileMetaUrl(
  projectId: string,
  pageId: string,
): string {
  return getDataUrl(
    `/api/screenshots/file/${encodeURIComponent(
      projectId,
    )}/${encodeURIComponent(pageId)}?meta=1`,
  );
}

export function getScreenshotFileUrl(projectId: string, pageId: string): string {
  return getDataUrl(
    `/api/screenshots/file/${encodeURIComponent(
      projectId,
    )}/${encodeURIComponent(pageId)}`,
  );
}

export function getCompiledJsUrl(
  projectId: string,
  compiledJsPath: string,
): string {
  return `${DATA_BASE}/data/${projectId}/${compiledJsPath}`;
}

export function getPublishedFileUrl(
  projectId: string,
  filePath: string,
): string {
  return `${DATA_BASE}/data/${projectId}/${filePath}`;
}

export async function issuePublishedHtmlExecution(
  executionPath: string,
): Promise<PublishedHtmlExecution> {
  if (!executionPath.startsWith("/api/projects/")) {
    throw new Error("发布 HTML execution 路径不合法");
  }
  const response = await fetch(`${DATA_BASE}${executionPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTML execution 签发失败: ${response.status}`);
  const payload = await response.json() as {
    success?: boolean;
    data?: Partial<PublishedHtmlExecution>;
    error?: { message?: string };
  };
  if (
    !payload.success ||
    typeof payload.data?.executionUrl !== "string" ||
    typeof payload.data.channelId !== "string" ||
    typeof payload.data.expiresAt !== "number" ||
    typeof payload.data.sandboxPolicyVersion !== "number"
  ) {
    throw new Error(payload.error?.message ?? "HTML execution 响应不合法");
  }
  return payload.data as PublishedHtmlExecution;
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export async function login(
  username: string,
  password: string,
): Promise<{ token: string; userId: string; username: string; expiresAt: number } | null> {
  const res = await fetch(`${DATA_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, includeToken: true }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error?.message || "登录失败");
  }
  const body = await res.json();
  if (!body.success) {
    throw new Error(body.error?.message || "登录失败");
  }
  return {
    token: body.data.token,
    userId: body.data.user.id,
    username: body.data.user.username,
    expiresAt: body.data.expiresAt,
  };
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (authToken) {
    headers["X-Auth-Token"] = authToken;
  }
  const res = await fetch(`${DATA_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error?.message || `请求失败 (${res.status})`);
  }
  return res.json();
}

export async function createDemoPage(
  projectId: string,
  name: string,
  sessionId: string,
  runtimeType?: DemoPageRuntimeType,
): Promise<DemoPageMeta> {
  const body = await apiFetch<{ success: boolean; data: DemoPageMeta }>(
    `/api/projects/${projectId}/demos`,
    {
      method: "POST",
      body: JSON.stringify({ sessionId, name, runtimeType }),
    },
  );
  return body.data;
}

export async function reorderDemoPages(
  projectId: string,
  sessionId: string,
  pages: Array<{ id: string; order: number; parentId: string | null }>,
): Promise<void> {
  await apiFetch(
    `/api/projects/${projectId}/demo-pages/reorder`,
    {
      method: "PATCH",
      body: JSON.stringify({ sessionId, pages }),
    },
  );
}

export async function switchPageRuntime(
  projectId: string,
  demoId: string,
  sessionId: string,
  targetRuntimeType: DemoPageRuntimeType,
): Promise<DemoPageMeta> {
  const body = await apiFetch<{ success: boolean; data: { meta: DemoPageMeta } }>(
    `/api/projects/${projectId}/demos/${demoId}/runtime`,
    {
      method: "PUT",
      body: JSON.stringify({ sessionId, targetRuntimeType }),
    },
  );
  return body.data.meta;
}

export async function deleteDemoPage(
  projectId: string,
  demoId: string,
  sessionId: string,
): Promise<void> {
  await apiFetch(
    `/api/projects/${projectId}/demos/${demoId}?sessionId=${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
  );
}
