import type {
  ProjectListResponse,
  ProjectDetailResponse,
  OpenProjectEditResponse,
  SaveProjectChangesResponse,
  VersionHistoryResponse,
  RestoreVersionResponse,
  CreateProjectRequest,
  OpenProjectEditRequest,
  SaveProjectChangesRequest,
  RestoreVersionRequest,
} from '@opencode-workbench/shared';

// Agent Service 的基础 URL（可以通过环境变量配置）
const AGENT_SERVICE_URL = process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || 'http://localhost:3001';

/**
 * API 响应类型
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  message?: string;
}

/**
 * 项目管理 API 客户端
 */
export class ProjectApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || AGENT_SERVICE_URL;
  }

  /**
   * 获取项目列表
   */
  async getProjects(): Promise<ProjectListResponse> {
    const response = await this.request<ProjectListResponse>('/api/projects');

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取项目列表失败');
    }

    return response.data;
  }

  /**
   * 创建新项目
   */
  async createProject(request: CreateProjectRequest): Promise<ProjectDetailResponse> {
    const response = await this.request<ProjectDetailResponse>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '创建项目失败');
    }

    return response.data;
  }

  /**
   * 获取项目详情
   */
  async getProject(projectId: string): Promise<ProjectDetailResponse> {
    const response = await this.request<ProjectDetailResponse>(`/api/projects/${projectId}`);

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取项目详情失败');
    }

    return response.data;
  }

  /**
   * 删除项目
   */
  async deleteProject(projectId: string): Promise<void> {
    const response = await this.request<void>(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    if (!response.success) {
      throw new Error(response.error?.message || '删除项目失败');
    }
  }

  /**
   * 打开项目编辑
   */
  async openProjectEdit(
    projectId: string,
    request: OpenProjectEditRequest
  ): Promise<OpenProjectEditResponse> {
    const response = await this.request<OpenProjectEditResponse>(
      `/api/projects/${projectId}/edit`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '打开项目编辑失败');
    }

    return response.data;
  }

  /**
   * 获取会话信息
   */
  async getSession(sessionId: string, projectId: string) {
    const response = await this.request(
      `/api/sessions/${sessionId}?projectId=${projectId}`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取会话信息失败');
    }

    return response.data;
  }

  /**
   * 保存项目变更
   */
  async saveProjectChanges(
    sessionId: string,
    projectId: string,
    request?: SaveProjectChangesRequest
  ): Promise<SaveProjectChangesResponse> {
    const response = await this.request<SaveProjectChangesResponse>(
      `/api/sessions/${sessionId}/save?projectId=${projectId}`,
      {
        method: 'POST',
        body: JSON.stringify(request || {}),
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '保存项目变更失败');
    }

    return response.data;
  }

  /**
   * 放弃编辑
   */
  async discardProjectChanges(
    sessionId: string,
    projectId: string
  ): Promise<void> {
    const response = await this.request<void>(
      `/api/sessions/${sessionId}/discard?projectId=${projectId}`,
      {
        method: 'POST',
      }
    );

    if (!response.success) {
      throw new Error(response.error?.message || '放弃编辑失败');
    }
  }

  /**
   * 获取版本历史
   */
  async getVersionHistory(projectId: string): Promise<VersionHistoryResponse> {
    const response = await this.request<VersionHistoryResponse>(
      `/api/projects/${projectId}/versions`
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取版本历史失败');
    }

    return response.data;
  }

  /**
   * 恢复指定版本
   */
  async restoreVersion(
    projectId: string,
    request: RestoreVersionRequest
  ): Promise<RestoreVersionResponse> {
    const response = await this.request<RestoreVersionResponse>(
      `/api/projects/${projectId}/restore`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    );

    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '恢复版本失败');
    }

    return response.data;
  }

  /**
   * 通用请求方法
   */
  private async request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '网络请求失败',
        },
      };
    }
  }
}

// 导出单例
export const projectApiClient = new ProjectApiClient();
