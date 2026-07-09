import type { SketchSceneDocument } from "@workbench/sketch-core";
import { normalizeAiError, type ImageAttachment, type DemoFolderMeta } from "@workbench/shared";
import type { CanvasState } from "@workbench/demo-ui";

export type PublishedPageRuntimeType =
  | "prototype-html-css"
  | "high-fidelity-react"
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

const DATA_BASE =
  process.env.NEXT_PUBLIC_DATA_BASE ||
  (process.env.NODE_ENV === "development" ? "http://localhost:3200" : "");
const AGENT_SERVICE_BASE = process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "";

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

export interface ViewerAiHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ViewerAiChatRequest {
  projectId: string;
  sessionId?: string;
  message: string;
  model?: string;
  activePageId?: string;
  activeConfig?: Record<string, unknown>;
  history?: ViewerAiHistoryMessage[];
  images?: ImageAttachment[];
}

export interface ViewerAiChatResponse {
  sessionId: string;
  answer: string;
  metadata?: Record<string, unknown>;
}

export async function askViewerAi(
  request: ViewerAiChatRequest,
): Promise<ViewerAiChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${AGENT_SERVICE_BASE}/api/viewer-ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch (error) {
    throw new Error(normalizeAiError(error).userMessage);
  }
  const payload = await res.json().catch(() => null) as
    | { success: true; data: ViewerAiChatResponse }
    | { success: false; error?: { message?: string } }
    | null;

  if (!res.ok || !payload || !payload.success) {
    throw new Error(
      payload && "error" in payload && payload.error?.message
        ? normalizeAiError(payload.error).userMessage
        : `AI 问答失败: ${res.status} ${res.statusText}`,
    );
  }

  return payload.data;
}

export interface ViewerAiModel {
  id: string;
  label: string;
  group?: string;
  provider?: string;
}

export async function getViewerAiModels(): Promise<{
  models: ViewerAiModel[];
  currentModelId: string | null;
  canSwitch: boolean;
}> {
  try {
    const res = await fetch(`${AGENT_SERVICE_BASE}/models`, { cache: "no-store" });
    const payload = await res.json().catch(() => null) as
      | {
          success: true;
          data: {
            models: ViewerAiModel[];
            currentModelId: string | null;
            canSwitch: boolean;
          };
        }
      | { success: false; error?: { message?: string } }
      | null;

    if (!res.ok || !payload || !payload.success) {
      throw new Error(
        payload && "error" in payload && payload.error?.message
          ? payload.error.message
          : `模型列表加载失败: ${res.status} ${res.statusText}`,
      );
    }
    return payload.data;
  } catch (error) {
    throw new Error(normalizeAiError(error).userMessage);
  }
}
