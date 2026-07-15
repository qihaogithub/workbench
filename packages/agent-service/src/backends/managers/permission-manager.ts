import * as path from 'path';

import type { AgentConfig, AgentEvent } from '../../core/types';
import { isPathAllowed, DEFAULT_WORKSPACE_PERMISSIONS } from '../pi-tools/permissions';
import { PERMISSION_TIMEOUT, type PermissionHandler, type PermissionRequestInfo } from '../pi-tools/delete-page-tool';
import type { PlanApprovalRequest, PlanApprovalResult } from '../pi-tools/plan-approval-tool';
import { logger } from '../../utils/logger';

const PLAN_APPROVAL_TIMEOUT_MS = 10 * 60_000;

/**
 * 判断文件路径是否属于知识库目录（knowledge/）
 * 统一为相对路径再判断，兼容绝对路径和相对路径输入
 */
export function isKnowledgeBasePath(filePath: string, workingDir: string): boolean {
  const resolved = path.resolve(workingDir, filePath);
  const relative = path.relative(workingDir, resolved);
  const normalized = relative.replace(/\\/g, '/');
  return normalized === 'knowledge' ||
         normalized.startsWith('knowledge/') ||
         normalized.startsWith('knowledge\\');
}

interface PendingPermission {
  resolve: (result: { approved: boolean; responseContent?: string }) => void;
  reject: (error: Error) => void;
}

/**
 * 权限管理器
 *
 * 负责：
 * - 工具调用的路径权限校验（tool_call hook）
 * - 知识库文件写保护
 * - deletePage 权限确认（异步等待用户响应）
 * - 计划审批确认（异步等待用户响应）
 */
export class PermissionManager {
  private pendingPermissions = new Map<string, PendingPermission>();

  constructor(
    private config: AgentConfig,
    private eventCallback?: (event: AgentEvent) => void,
  ) {}

  setEventCallback(callback: ((event: AgentEvent) => void) | undefined): void {
    this.eventCallback = callback;
  }

  /**
   * 校验工具调用是否被权限规则拦截。
   * 在 harness.on("tool_call") 中调用，返回 { block, reason } 拦截，返回 undefined 放行。
   */
  validateToolCall(toolName: string, input: any): { block: boolean; reason: string } | undefined {
    // 路径权限校验
    if (['readFile', 'readFileWithLines', 'writeFile', 'editFile', 'listFiles'].includes(toolName)) {
      const targetPath = input?.path || input?.filePath;
      if (
        targetPath &&
        !isPathAllowed(targetPath, this.config.workingDir ?? '', this.config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS)
      ) {
        return { block: true, reason: `Access denied: path "${targetPath}" is not allowed by workspace permissions` };
      }
    }

    // 知识库写保护已移除：AI 可通过 writeFile/editFile 写入 knowledge/ 路径，
    // writeFile 工具会透明同步 manifest.json。路径安全由 isManagedWorkspaceResource
    // 白名单和 isPathAllowed 权限层保障。

    return undefined;
  }

  /**
   * deletePage 权限确认：发出 permission_request 事件，等待用户确认或超时
   * 此方法由 deletePage 工具的 execute 函数调用（异步等待）
   */
  requestPermission: PermissionHandler = (toolCallId: string, request: PermissionRequestInfo): Promise<boolean> => {
    const sessionId = this.config.sessionId;

    logger.info({ toolCallId, request }, 'deletePage: requesting permission');

    if (this.eventCallback) {
      this.eventCallback({
        type: 'permission_request',
        sessionId,
        permissionRequest: {
          sessionId,
          options: [
            { optionId: 'allow_once', name: '确认删除' },
            { optionId: 'reject_once', name: '取消' },
          ],
          toolCall: {
            toolCallId,
            title: request.title,
            kind: 'execute',
            summary: request.summary,
            planId: request.planId,
          },
        },
      });
    }

    return new Promise<boolean>((resolve) => {
      this.pendingPermissions.set(toolCallId, {
        resolve: (result) => resolve(result.approved),
        reject: (_err: Error) => resolve(false),
      });

      const timeoutId = setTimeout(() => {
        if (this.pendingPermissions.has(toolCallId)) {
          this.pendingPermissions.delete(toolCallId);
          logger.warn({ toolCallId }, 'deletePage: permission request timed out');
          resolve(false);
        }
      }, PERMISSION_TIMEOUT);
      timeoutId.unref?.();
    });
  };

  /**
   * 计划审批：发出 permission_request 事件，等待用户批准或取消
   */
  requestPlanApproval = (toolCallId: string, request: PlanApprovalRequest): Promise<PlanApprovalResult> => {
    const sessionId = this.config.sessionId;

    logger.info({ toolCallId, title: request.title }, 'planApproval: requesting user approval');

    if (this.eventCallback) {
      this.eventCallback({
        type: 'permission_request',
        sessionId,
        permissionRequest: {
          sessionId,
          options: [
            { optionId: 'allow_once', name: '批准执行' },
            { optionId: 'reject_once', name: '取消' },
          ],
          toolCall: {
            toolCallId,
            title: request.title || '执行计划',
            kind: 'execute',
            summary: request.planMarkdown,
            approvalKind: 'plan_approval',
            editable: true,
            initialContent: request.planMarkdown,
          },
        },
      });
    }

    return new Promise<PlanApprovalResult>((resolve) => {
      this.pendingPermissions.set(toolCallId, {
        resolve: (result) => resolve({
          approved: result.approved,
          planMarkdown: result.responseContent,
        }),
        reject: (_err: Error) => resolve({ approved: false }),
      });

      const timeoutId = setTimeout(() => {
        if (this.pendingPermissions.has(toolCallId)) {
          this.pendingPermissions.delete(toolCallId);
          logger.warn({ toolCallId }, 'planApproval: permission request timed out');
          resolve({ approved: false });
        }
      }, PLAN_APPROVAL_TIMEOUT_MS);
      timeoutId.unref?.();
    });
  };

  /**
   * 解除权限等待：前端用户确认或取消后调用
   */
  resolvePermission(toolCallId: string, approved: boolean, responseContent?: string): void {
    const pending = this.pendingPermissions.get(toolCallId);
    if (pending) {
      this.pendingPermissions.delete(toolCallId);
      pending.resolve({ approved, responseContent });
      logger.info({ toolCallId, approved }, 'deletePage: permission resolved');
    } else {
      logger.warn({ toolCallId }, 'deletePage: no pending permission found for toolCallId');
    }
  }

  hasPendingPermissions(): boolean {
    return this.pendingPermissions.size > 0;
  }

  clearPendingPermissions(): void {
    this.pendingPermissions.clear();
  }
}
