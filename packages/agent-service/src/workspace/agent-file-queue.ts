import path from "node:path";

import { normalizeWorkspaceResourcePath } from "@workbench/project-core/workspace-resource-registry";

export interface AgentFileQueueRequest {
  dataDir: string;
  workspaceId: string;
  resourcePaths: string[];
}

export interface AgentFileQueueContext {
  normalizedPaths: string[];
  queuedAt: number;
  startedAt: number;
  waitMs: number;
}

/**
 * Serializes only Agent mutations that touch the same normalized resource.
 *
 * The queue deliberately lives outside the Workspace Authority queue: model
 * work for different files can proceed concurrently, while the final
 * Authority commit still gets the Workspace-wide atomicity and lease. Every
 * multi-file request acquires keys in lexical order to avoid lock inversion.
 */
export class AgentFileQueue {
  private static readonly queues = new Map<string, Promise<unknown>>();
  private static readonly depths = new Map<string, number>();

  async run<T>(request: AgentFileQueueRequest, work: (context: AgentFileQueueContext) => Promise<T>): Promise<T> {
    const normalizedPaths = [...new Set(request.resourcePaths
      .map((resourcePath) => normalizeWorkspaceResourcePath(resourcePath.replace(/^\.?\//, "")))
      .filter((resourcePath): resourcePath is string => Boolean(resourcePath)))].sort();
    if (normalizedPaths.length === 0) {
      const now = Date.now();
      return work({ normalizedPaths, queuedAt: now, startedAt: now, waitMs: 0 });
    }

    const queuedAt = Date.now();
    const keys = normalizedPaths.map((resourcePath) => this.key(request.dataDir, request.workspaceId, resourcePath));
    return this.runKeys(keys, 0, queuedAt, normalizedPaths, work);
  }

  getDepth(request: Omit<AgentFileQueueRequest, "resourcePaths"> & { resourcePath: string }): number {
    const normalized = normalizeWorkspaceResourcePath(request.resourcePath.replace(/^\.?\//, ""));
    if (!normalized) return 0;
    return AgentFileQueue.depths.get(this.key(request.dataDir, request.workspaceId, normalized)) ?? 0;
  }

  private runKeys<T>(
    keys: string[],
    index: number,
    queuedAt: number,
    normalizedPaths: string[],
    work: (context: AgentFileQueueContext) => Promise<T>,
  ): Promise<T> {
    if (index >= keys.length) {
      const startedAt = Date.now();
      return work({ normalizedPaths, queuedAt, startedAt, waitMs: startedAt - queuedAt });
    }

    const key = keys[index];
    const previous = AgentFileQueue.queues.get(key) ?? Promise.resolve();
    AgentFileQueue.depths.set(key, (AgentFileQueue.depths.get(key) ?? 0) + 1);
    const next = previous
      .catch(() => undefined)
      .then(() => this.runKeys(keys, index + 1, queuedAt, normalizedPaths, work));
    AgentFileQueue.queues.set(key, next);
    return next.finally(() => {
      const depth = (AgentFileQueue.depths.get(key) ?? 1) - 1;
      if (depth > 0) AgentFileQueue.depths.set(key, depth);
      else AgentFileQueue.depths.delete(key);
      if (AgentFileQueue.queues.get(key) === next) AgentFileQueue.queues.delete(key);
    });
  }

  private key(dataDir: string, workspaceId: string, resourcePath: string): string {
    return `${path.resolve(dataDir)}:${workspaceId}:${resourcePath}`;
  }
}
