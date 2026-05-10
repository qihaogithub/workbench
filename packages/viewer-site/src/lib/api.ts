import type {
  ProjectListResponse,
  ProjectDetailResponse,
  VersionHistoryResponse,
  ApiResponse,
} from "@opencode-workbench/shared";

const AGENT_SERVICE_URL =
  process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || "http://localhost:3201";
const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3200";

async function fetchApi<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) {
    throw new Error(`API 请求失败: ${res.status} ${res.statusText}`);
  }
  const json: ApiResponse<T> = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || "未知错误");
  }
  return json.data as T;
}

export async function getProjects(): Promise<ProjectListResponse> {
  return fetchApi<ProjectListResponse>(AGENT_SERVICE_URL, "/api/projects");
}

export async function getProject(
  projectId: string,
): Promise<ProjectDetailResponse> {
  return fetchApi<ProjectDetailResponse>(
    AGENT_SERVICE_URL,
    `/api/projects/${projectId}`,
  );
}

export async function getProjectVersions(
  projectId: string,
): Promise<VersionHistoryResponse> {
  return fetchApi<VersionHistoryResponse>(
    AGENT_SERVICE_URL,
    `/api/projects/${projectId}/versions`,
  );
}

export function getWebUrl(): string {
  return WEB_URL;
}
