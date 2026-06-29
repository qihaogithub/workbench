import * as fs from 'fs';
import * as path from 'path';

import type { AgentConfig, AgentEvent, FileChange, PlanItem } from '../../core/types';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from '../pi-tools/permissions';
import { isKnowledgeBasePath } from './permission-manager';
import {
  getDeletedPagesFromToolResult,
  getToolInput,
  getToolResultDetails,
} from './assistant-text-utils';

/**
 * 工具钩子管理器
 *
 * 负责：
 * - 工具调用拦截（tool_call hook）：路径权限校验、知识库写保护（委托 PermissionManager）
 * - 工具结果处理（tool_result hook）：文件变更捕获、文件操作事件发射、计划更新、知识库读取追踪
 */
export class ToolHookManager {
  private files: FileChange[] = [];
  private planItems: PlanItem[] = [];
  private emittedFileOperationKeys = new Set<string>();
  private readKnowledgeFiles: Set<string> = new Set();

  constructor(
    private config: AgentConfig,
    private eventCallback?: (event: AgentEvent) => void,
  ) {}

  setEventCallback(callback: ((event: AgentEvent) => void) | undefined): void {
    this.eventCallback = callback;
  }

  getFiles(): FileChange[] {
    return this.files;
  }

  getReadKnowledgeFiles(): Set<string> {
    return this.readKnowledgeFiles;
  }

  resetForNewMessage(): void {
    this.files = [];
    this.emittedFileOperationKeys.clear();
  }

  private pushFileChange(change: FileChange): void {
    const duplicate = this.files.some((item) =>
      item.path === change.path &&
      item.action === change.action &&
      item.content === change.content
    );
    if (!duplicate) {
      this.files.push(change);
    }
  }

  getFileChangesForTool(toolName: string, input: any, isError: boolean, event: any): FileChange[] {
    if (isError) return [];

    if (toolName === 'writeFile') {
      if (!input?.path) return [];
      return [{
        path: input.path,
        action: 'modified',
        content: input.content,
      }];
    }

    if (toolName === 'editFile') {
      if (!input?.path) return [];
      return [{
        path: input.path,
        action: 'modified',
      }];
    }

    if (toolName === 'deletePage' || toolName === 'deletePages' || toolName === 'executeDeletePagePlan') {
      const deletedPages = getDeletedPagesFromToolResult(event);
      const changedPaths = new Set<string>();
      for (const page of deletedPages) {
        changedPaths.add(`demos/${page.pageId}/`);
        for (const deletedPath of page.deletedPaths || []) {
          changedPaths.add(deletedPath);
        }
      }
      if (deletedPages.length > 0) {
        changedPaths.add('workspace-tree.json');
      }
      return Array.from(changedPaths).map((changedPath) => ({
          path: changedPath,
          action: changedPath === 'workspace-tree.json' ? 'modified' : 'deleted',
      }));
    }

    return [];
  }

  recordToolFileChange(toolName: string, input: any, isError: boolean, event: any): FileChange[] {
    const changes = this.getFileChangesForTool(toolName, input, isError, event);
    for (const change of changes) {
      this.pushFileChange(change);
    }
    return changes;
  }

  private readWorkspaceFileContent(relativePath: string): string | undefined {
    const workingDir = this.config.workingDir ?? '';
    if (!relativePath || !workingDir) return undefined;
    if (!isPathAllowed(relativePath, workingDir, this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)) {
      return undefined;
    }

    try {
      const filePath = path.resolve(workingDir, relativePath);
      if (!fs.existsSync(filePath)) return undefined;
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  private getFileOperationsForTool(toolName: string, input: any, isError: boolean, event: any): Array<{
    method: string;
    path: string;
    content?: string;
  }> {
    if (isError) return [];

    if (toolName === 'writeFile') {
      if (!input?.path) return [];
      return [{
        method: 'fs/write_text_file',
        path: input.path,
        content: typeof input.content === 'string' ? input.content : undefined,
      }];
    }

    if (toolName === 'editFile') {
      if (!input?.path) return [];
      return [{
        method: 'fs/edit_text_file',
        path: input.path,
        content: this.readWorkspaceFileContent(input.path),
      }];
    }

    if (toolName === 'deletePage' || toolName === 'deletePages' || toolName === 'executeDeletePagePlan') {
      const deletedPages = getDeletedPagesFromToolResult(event);
      const changedPaths = new Set<string>();
      for (const page of deletedPages) {
        changedPaths.add(`demos/${page.pageId}/`);
        for (const deletedPath of page.deletedPaths || []) {
          changedPaths.add(deletedPath);
        }
      }
      if (deletedPages.length > 0) {
        changedPaths.add('workspace-tree.json');
      }

      return Array.from(changedPaths).map((changedPath) => ({
        method: changedPath === 'workspace-tree.json' ? 'fs/edit_text_file' : 'fs/delete_path',
        path: changedPath,
        content: changedPath === 'workspace-tree.json'
          ? this.readWorkspaceFileContent(changedPath)
          : undefined,
      }));
    }

    return [];
  }

  emitFileOperationsForTool(toolName: string, input: any, isError: boolean, event: any, sessionId: string): void {
    if (isError || !this.eventCallback) return;

    const operations = this.getFileOperationsForTool(toolName, input, isError, event);
    for (const operation of operations) {
      const key = `${operation.method}:${operation.path}:${operation.content ?? ''}`;
      if (this.emittedFileOperationKeys.has(key)) continue;
      this.emittedFileOperationKeys.add(key);

      this.eventCallback({
        type: 'file_operation',
        sessionId,
        fileOperation: operation,
      });
    }
  }

  updatePlanFromToolResult(toolName: string | undefined, isError: boolean, event: any, sessionId: string): void {
    if (toolName !== 'updatePlan' || isError || !this.eventCallback) return;

    const details = getToolResultDetails(event);
    const items = details?.items;
    if (!Array.isArray(items)) return;

    const normalized = items
      .filter((item: any) =>
        typeof item?.id === 'string' &&
        typeof item?.title === 'string' &&
        ['pending', 'in_progress', 'completed', 'failed'].includes(item?.status),
      )
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        status: item.status,
      }));

    if (normalized.length !== items.length || normalized.length === 0) return;

    this.planItems = normalized;
    this.eventCallback({
      type: 'plan',
      sessionId,
      content: JSON.stringify({ items: this.planItems }),
    });
  }

  /**
   * 处理工具结果事件：捕获文件变更、发射文件操作事件、更新计划、追踪知识库读取
   */
  handleToolResult(
    toolName: string,
    input: any,
    isError: boolean,
    event: any,
    sessionId: string,
    options?: {
      emitFileOperations?: boolean;
      onFileChanges?: (changes: FileChange[]) => void;
    },
  ): void {
    const changes = this.recordToolFileChange(toolName, input, isError, event);
    options?.onFileChanges?.(changes);
    if (options?.emitFileOperations) {
      this.emitFileOperationsForTool(toolName, input, isError, event, sessionId);
    }

    if ((toolName === 'readFile' || toolName === 'readFileWithLines') && !isError) {
      const readPath = input?.path;
      if (readPath && isKnowledgeBasePath(readPath, this.config.workingDir ?? '')) {
        const basename = path.basename(readPath);
        this.readKnowledgeFiles.add(basename);
      }
    }
  }

  static getToolInput(event: any): any {
    return getToolInput(event);
  }
}
