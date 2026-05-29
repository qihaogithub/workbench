import type {
  VersionHistoryResponse,
  RestoreVersionResponse,
  RestoreVersionRequest,
  DemoPageMeta,
  DemoFolderMeta,
  DemoFiles,
  MultiDemoFiles,
} from '@opencode-workbench/shared';

/**
 * 项目级共享配置 Schema 响应
 */
export interface ProjectConfigSchema {
  schema: string | null;
  exists: boolean;
}

/**
 * Session 级多页面文件响应（含元数据）
 */
export interface SessionMultiDemoFiles extends MultiDemoFiles {
  demoPages: DemoPageMeta[];
  workspacePath: string;
}

// Agent Service 的基础 URL（可以通过环境变量配置）
const AGENT_SERVICE_URL = process.env.NEXT_PUBLIC_AGENT_SERVICE_URL || 'http://localhost:3201';

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

  // ============ 项目内 Demo 页面（走 Next.js 本地 API）============

  /**
   * 列出项目下所有 Demo 页面
   */
  async listDemoPages(projectId: string): Promise<DemoPageMeta[]> {
    const response = await this.localRequest<{ demoPages: DemoPageMeta[] }>(
      `/api/projects/${projectId}/demos`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取页面列表失败');
    }
    return response.data.demoPages;
  }

  /**
   * 创建 Demo 页面（写入临时 workspace）
   */
  async createDemoPage(
    projectId: string,
    name: string,
    sessionId: string,
    parentId?: string | null,
  ): Promise<DemoPageMeta> {
    const response = await this.localRequest<DemoPageMeta>(
      `/api/projects/${projectId}/demos`,
      {
        method: 'POST',
        body: JSON.stringify({ sessionId, name, parentId }),
      }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '创建页面失败');
    }
    return response.data;
  }

  /**
   * 获取单个 Demo 页面元信息
   */
  async getDemoPageMeta(projectId: string, demoId: string): Promise<DemoPageMeta> {
    const response = await this.localRequest<DemoPageMeta>(
      `/api/projects/${projectId}/demos/${demoId}`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取页面元信息失败');
    }
    return response.data;
  }

  /**
   * 更新 Demo 页面文件（code / schema）
   * 写入需要 sessionId 锁定到当前临时 workspace
   */
  async updateDemoPageFiles(
    projectId: string,
    demoId: string,
    sessionId: string,
    files: { code?: string; schema?: string },
  ): Promise<void> {
    const response = await this.localRequest<null>(
      `/api/projects/${projectId}/demos/${demoId}/files`,
      {
        method: 'PUT',
        body: JSON.stringify({ sessionId, ...files }),
      }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '更新页面文件失败');
    }
  }

  /**
   * 修改 Demo 页面元数据（name / order / parentId）
   */
  async patchDemoPageMeta(
    projectId: string,
    demoId: string,
    sessionId: string,
    patch: { name?: string; order?: number; parentId?: string | null },
  ): Promise<DemoPageMeta> {
    const response = await this.localRequest<DemoPageMeta>(
      `/api/projects/${projectId}/demos/${demoId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ sessionId, ...patch }),
      }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '更新页面元数据失败');
    }
    return response.data;
  }

  /**
   * 删除 Demo 页面
   */
  async deleteDemoPage(
    projectId: string,
    demoId: string,
    sessionId: string,
  ): Promise<void> {
    const response = await this.localRequest<null>(
      `/api/projects/${projectId}/demos/${demoId}?sessionId=${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '删除页面失败');
    }
  }

  // ============ 项目级共享配置 ============

  /**
   * 获取项目级共享配置 Schema
   */
  async getProjectConfig(projectId: string): Promise<ProjectConfigSchema> {
    const response = await this.localRequest<ProjectConfigSchema>(
      `/api/projects/${projectId}/config`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取项目配置失败');
    }
    return response.data;
  }

  /**
   * 写入项目级共享配置 Schema
   */
  async updateProjectConfig(
    projectId: string,
    schema: string,
    sessionId: string,
  ): Promise<void> {
    const response = await this.localRequest<{ schema: string; exists: boolean }>(
      `/api/projects/${projectId}/config`,
      {
        method: 'PUT',
        body: JSON.stringify({ sessionId, schema }),
      }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '更新项目配置失败');
    }
  }

  /**
   * 删除项目级共享配置 Schema
   */
  async deleteProjectConfig(
    projectId: string,
    sessionId: string,
  ): Promise<void> {
    const response = await this.localRequest<{ removed: boolean }>(
      `/api/projects/${projectId}/config?sessionId=${encodeURIComponent(sessionId)}`,
      { method: 'DELETE' }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '删除项目配置失败');
    }
  }

  // ============ 虚拟文件夹管理 ============

  /**
   * 列出项目下所有文件夹
   */
  async listFolders(projectId: string): Promise<DemoFolderMeta[]> {
    const response = await this.localRequest<{ folders: DemoFolderMeta[] }>(
      `/api/projects/${projectId}/folders`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取文件夹列表失败');
    }
    return response.data.folders;
  }

  /**
   * 创建文件夹
   */
  async createFolder(
    projectId: string,
    name: string,
    sessionId: string,
    parentId?: string | null,
  ): Promise<DemoFolderMeta> {
    const response = await this.localRequest<DemoFolderMeta>(
      `/api/projects/${projectId}/folders`,
      {
        method: 'POST',
        body: JSON.stringify({ sessionId, name, parentId }),
      }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '创建文件夹失败');
    }
    return response.data;
  }

  /**
   * 更新文件夹元数据
   */
  async patchFolder(
    projectId: string,
    folderId: string,
    sessionId: string,
    patch: { name?: string; parentId?: string | null; order?: number },
  ): Promise<DemoFolderMeta> {
    const response = await this.localRequest<DemoFolderMeta>(
      `/api/projects/${projectId}/folders/${folderId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ sessionId, ...patch }),
      }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '更新文件夹失败');
    }
    return response.data;
  }

  /**
   * 删除文件夹
   */
  async deleteFolder(
    projectId: string,
    folderId: string,
    sessionId: string,
    deleteContents: boolean = false,
  ): Promise<string[]> {
    const response = await this.localRequest<{ deletedPageIds: string[] }>(
      `/api/projects/${projectId}/folders/${folderId}?sessionId=${encodeURIComponent(sessionId)}&deleteContents=${deleteContents}`,
      { method: 'DELETE' }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '删除文件夹失败');
    }
    return response.data?.deletedPageIds ?? [];
  }

  /**
   * 批量排序页面和文件夹
   */
  async reorderDemoPages(
    projectId: string,
    sessionId: string,
    pages: Array<{ id: string; order: number; parentId: string | null }>,
    folders?: Array<{ id: string; order: number; parentId: string | null }>,
  ): Promise<void> {
    const response = await this.localRequest<null>(
      `/api/projects/${projectId}/demo-pages/reorder`,
      {
        method: 'PATCH',
        body: JSON.stringify({ sessionId, pages, folders }),
      }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '批量排序失败');
    }
  }

  // ============ 发布管理 ============

  async publishProject(projectId: string): Promise<{
    projectId: string;
    publishedVersion: string;
    publishedAt: number;
    demoCount: number;
    duration: number;
  }> {
    const response = await this.localRequest<{
      projectId: string;
      publishedVersion: string;
      publishedAt: number;
      demoCount: number;
      duration: number;
    }>(
      `/api/projects/${projectId}/publish`,
      { method: 'POST' }
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '发布失败');
    }
    return response.data;
  }

  async getPublishStatus(projectId: string): Promise<{
    projectId: string;
    publishedVersion: string | null;
    publishedAt: number | null;
    currentVersion: string | null;
    hasUnpublishedChanges: boolean;
    status: 'never_published' | 'published' | 'unpublished_changes';
  }> {
    const response = await this.localRequest<{
      projectId: string;
      publishedVersion: string | null;
      publishedAt: number | null;
      currentVersion: string | null;
      hasUnpublishedChanges: boolean;
      status: 'never_published' | 'published' | 'unpublished_changes';
    }>(
      `/api/projects/${projectId}/publish-status`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '获取发布状态失败');
    }
    return response.data;
  }

  // ============ Session 文件（多页面） ============

  /**
   * 获取 Session 关联 workspace 的全部页面文件
   */
  async getSessionMultiDemoFiles(sessionId: string): Promise<SessionMultiDemoFiles> {
    const response = await this.localRequest<SessionMultiDemoFiles>(
      `/api/sessions/${sessionId}/files`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '读取 Session 文件失败');
    }
    return response.data;
  }

  /**
   * 获取 Session 中指定页面的代码与 Schema
   */
  async getSessionDemoPageFiles(
    sessionId: string,
    demoId: string,
  ): Promise<DemoFiles> {
    const response = await this.localRequest<DemoFiles>(
      `/api/sessions/${sessionId}/files/${demoId}`
    );
    if (!response.success || !response.data) {
      throw new Error(response.error?.message || '读取页面文件失败');
    }
    return response.data;
  }

  /**
   * 更新 Session 中指定页面的代码与 Schema
   */
  async updateSessionDemoPageFiles(
    sessionId: string,
    demoId: string,
    files: { code?: string; schema?: string },
  ): Promise<void> {
    const response = await this.localRequest<null>(
      `/api/sessions/${sessionId}/files/${demoId}`,
      {
        method: 'PUT',
        body: JSON.stringify(files),
      }
    );
    if (!response.success) {
      throw new Error(response.error?.message || '更新页面文件失败');
    }
  }

  /**
   * 通用请求方法（Next.js 本地路由，使用相对路径）
   */
  private async localRequest<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(path, {
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
