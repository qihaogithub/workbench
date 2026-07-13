import * as path from "path";

import type { WorkspaceMutationReceipt } from "@workbench/shared/contracts";
import type {
  AgentConfig,
  AgentEvent,
  FileChange,
  MutationReceiptEntry,
  PlanItem,
} from "../../core/types";
import { isKnowledgeBasePath } from "./permission-manager";
import { resolveLiveWorkspaceMutationContext } from "../../workspace/workspace-mutation-authority";
import {
  getDeletedPagesFromToolResult,
  getToolInput,
  getToolResultDetails,
} from "./assistant-text-utils";

/**
 * 工具钩子管理器
 *
 * 负责：
 * - 工具调用拦截（tool_call hook）：路径权限校验、知识库写保护（委托 PermissionManager）
 * - 工具结果处理（tool_result hook）：文件变更摘要捕获、计划更新、知识库读取追踪
 */
export class ToolHookManager {
  private files: FileChange[] = [];
  private planItems: PlanItem[] = [];
  private readKnowledgeFiles: Set<string> = new Set();
  private mutationReceipts: MutationReceiptEntry[] = [];

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

  getMutationReceipts(): MutationReceiptEntry[] {
    return this.mutationReceipts;
  }

  getReadKnowledgeFiles(): Set<string> {
    return this.readKnowledgeFiles;
  }

  resetForNewMessage(): void {
    this.files = [];
    this.mutationReceipts = [];
  }

  private pushFileChange(change: FileChange): void {
    const duplicate = this.files.some(
      (item) =>
        item.path === change.path &&
        item.action === change.action &&
        item.content === change.content,
    );
    if (!duplicate) {
      this.files.push(change);
    }
  }

  private isNoopSketchPatchToolResult(event: any): boolean {
    const patch = getToolResultDetails(event)?.patch;
    return patch && typeof patch === "object" && patch.changed === false;
  }

  /** A durable receipt, not the tool name or a post-write disk read, is the
   * source of truth for live Workspace mutations. */
  private getWorkspaceReceipt(event: any): WorkspaceMutationReceipt | null {
    const receipt = getToolResultDetails(event)?.receipt;
    if (
      !receipt ||
      receipt.committed !== true ||
      !Array.isArray(receipt.resources)
    )
      return null;
    return receipt as WorkspaceMutationReceipt;
  }

  private changesFromReceipt(receipt: WorkspaceMutationReceipt): FileChange[] {
    return receipt.resources.map((resource) => ({
      path: resource.path,
      action:
        resource.action === "deleted"
          ? "deleted"
          : resource.beforeHash === null
            ? "created"
            : "modified",
    }));
  }

  getFileChangesForTool(
    toolName: string,
    input: any,
    isError: boolean,
    event: any,
  ): FileChange[] {
    if (isError) return [];

    const receipt = this.getWorkspaceReceipt(event);
    if (receipt) return this.changesFromReceipt(receipt);

    // A live Workspace must never turn a successful-looking tool name into a
    // claimed file change. Only the Authority receipt proves durability.
    if (
      this.config.workingDir &&
      resolveLiveWorkspaceMutationContext(this.config.workingDir)
    ) {
      return [];
    }

    if (toolName === "writeFile") {
      if (!input?.path) return [];
      return [
        {
          path: input.path,
          action: "modified",
          content: input.content,
        },
      ];
    }

    if (toolName === "editFile") {
      if (!input?.path) return [];
      return [
        {
          path: input.path,
          action: "modified",
        },
      ];
    }

    if (
      toolName === "patchSketchScene" ||
      toolName === "createSketchNodes" ||
      toolName === "bindSketchConfig"
    ) {
      if (!input?.pageId || input?.dryRun) return [];
      if (this.isNoopSketchPatchToolResult(event)) return [];
      return [
        {
          path: `demos/${input.pageId}/sketch.scene.json`,
          action: "modified",
        },
      ];
    }

    if (
      toolName === "deletePage" ||
      toolName === "deletePages" ||
      toolName === "executeDeletePagePlan"
    ) {
      const deletedPages = getDeletedPagesFromToolResult(event);
      const changedPaths = new Set<string>();
      for (const page of deletedPages) {
        changedPaths.add(`demos/${page.pageId}/`);
        for (const deletedPath of page.deletedPaths || []) {
          changedPaths.add(deletedPath);
        }
      }
      if (deletedPages.length > 0) {
        changedPaths.add("workspace-tree.json");
      }
      return Array.from(changedPaths).map((changedPath) => ({
        path: changedPath,
        action: changedPath === "workspace-tree.json" ? "modified" : "deleted",
      }));
    }

    return [];
  }

  recordToolFileChange(
    toolName: string,
    input: any,
    isError: boolean,
    event: any,
  ): FileChange[] {
    const changes = this.getFileChangesForTool(toolName, input, isError, event);
    for (const change of changes) {
      this.pushFileChange(change);
    }
    return changes;
  }

  updatePlanFromToolResult(
    toolName: string | undefined,
    isError: boolean,
    event: any,
    sessionId: string,
  ): void {
    if (toolName !== "updatePlan" || isError || !this.eventCallback) return;

    const details = getToolResultDetails(event);
    const items = details?.items;
    if (!Array.isArray(items)) return;

    const normalized = items
      .filter(
        (item: any) =>
          typeof item?.id === "string" &&
          typeof item?.title === "string" &&
          ["pending", "in_progress", "completed", "failed"].includes(
            item?.status,
          ),
      )
      .map((item: any) => ({
        id: item.id,
        title: item.title,
        status: item.status,
      }));

    if (normalized.length !== items.length || normalized.length === 0) return;

    this.planItems = normalized;
    this.eventCallback({
      type: "plan",
      sessionId,
      content: JSON.stringify({ items: this.planItems }),
    });
  }

  /**
   * 处理工具结果事件：捕获文件变更摘要、更新计划、追踪知识库读取
   */
  handleToolResult(
    toolName: string,
    input: any,
    isError: boolean,
    event: any,
    sessionId: string,
    options?: {
      onFileChanges?: (changes: FileChange[]) => void;
    },
  ): void {
    const changes = this.recordToolFileChange(toolName, input, isError, event);
    options?.onFileChanges?.(changes);

    const receipt = this.getWorkspaceReceipt(event);
    if (receipt) {
      this.mutationReceipts.push({
        mutationId: receipt.mutationId,
        revision: receipt.revision,
        status: "committed",
        resources: receipt.resources.map((resource) => ({
          path: resource.path,
          action: resource.action,
        })),
        actor: receipt.actor,
      });
    }

    if (
      (toolName === "readFile" || toolName === "readFileWithLines") &&
      !isError
    ) {
      const readPath = input?.path;
      if (
        readPath &&
        isKnowledgeBasePath(readPath, this.config.workingDir ?? "")
      ) {
        const basename = path.basename(readPath);
        this.readKnowledgeFiles.add(basename);
      }
    }
  }

  static getToolInput(event: any): any {
    return getToolInput(event);
  }
}
