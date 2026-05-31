import type { DemoFolderMeta } from "@opencode-workbench/shared";

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
  compiledJsPath: string;
  schemaPath?: string;
  previewSize?: PreviewSize;
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

const DATA_BASE = process.env.NEXT_PUBLIC_DATA_BASE || "";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`);
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

export function getThumbnailUrl(thumbnail: string): string {
  return `${DATA_BASE}${thumbnail}`;
}

export function getCompiledJsUrl(
  projectId: string,
  compiledJsPath: string,
): string {
  return `${DATA_BASE}/data/${projectId}/${compiledJsPath}`;
}
