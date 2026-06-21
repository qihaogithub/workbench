import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomBytes } from 'crypto';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

const PERMISSION_TIMEOUT_MS = 60_000;
const DELETION_PLAN_TTL_MS = 5 * 60_000;
const WORKSPACE_TREE_FILENAME = 'workspace-tree.json';

interface WorkspacePage {
  id: string;
  name: string;
  order: number;
  parentId: string | null;
}

interface WorkspaceTree {
  folders: unknown[];
  pages: WorkspacePage[];
}

export interface DeletedPageChange {
  pageId: string;
  pageName: string;
  deletedPaths: string[];
}

interface DeletionPlanPage {
  id: string;
  name: string;
  parentId: string | null;
}

interface DeletionPlan {
  planId: string;
  workingDir: string;
  pageIds: string[];
  pages: DeletionPlanPage[];
  treeSignature: string;
  expiresAt: number;
  confirmationSummary: string;
  canExecute: boolean;
  reason?: string;
}

export interface DeletionPlanStore {
  create(plan: Omit<DeletionPlan, 'planId' | 'expiresAt'>): DeletionPlan;
  get(planId: string): DeletionPlan | null;
  delete(planId: string): void;
}

const ListPagesParams = Type.Object({});
type ListPagesParams = Static<typeof ListPagesParams>;

const DeletePageParams = Type.Object({
  pageId: Type.String({
    description: 'Exact page ID from listPages, for example "page_2vpk". Do not guess this value.',
  }),
  pageName: Type.Optional(Type.String({
    description: 'Optional display name for confirmation only.',
  })),
});

type DeletePageParams = Static<typeof DeletePageParams>;

const DeletePagesParams = Type.Object({
  pageIds: Type.Array(
    Type.String({
      description: 'Exact page ID from listPages. Do not guess this value.',
    }),
    {
      minItems: 1,
      description: 'All exact page IDs to delete. Use this array for any request that deletes more than one page.',
    },
  ),
});

type DeletePagesParams = Static<typeof DeletePagesParams>;

const PreviewDeletePagesParams = Type.Union([
  Type.Object({
    mode: Type.Literal('nameIncludes'),
    query: Type.String({
      minLength: 1,
      description: 'Text that target page names must include, for example "副本".',
    }),
  }),
  Type.Object({
    mode: Type.Literal('folderId'),
    query: Type.String({
      minLength: 1,
      description: 'Exact folder ID whose direct child pages should be deleted.',
    }),
  }),
  Type.Object({
    mode: Type.Literal('explicitIds'),
    pageIds: Type.Array(
      Type.String({ description: 'Exact page IDs from listPages.' }),
      { minItems: 1 },
    ),
  }),
]);

type PreviewDeletePagesParams = Static<typeof PreviewDeletePagesParams>;

const ExecuteDeletePagePlanParams = Type.Object({
  planId: Type.String({
    description: 'Deletion plan ID returned by previewDeletePages. Do not invent this value.',
  }),
});

type ExecuteDeletePagePlanParams = Static<typeof ExecuteDeletePagePlanParams>;

export interface PermissionRequestInfo {
  title: string;
  summary?: string;
  planId?: string;
}

export type PermissionHandler = (toolCallId: string, request: PermissionRequestInfo) => Promise<boolean>;

export function createDeletionPlanStore(now: () => number = () => Date.now()): DeletionPlanStore {
  const plans = new Map<string, DeletionPlan>();

  function pruneExpired(): void {
    const current = now();
    for (const [planId, plan] of plans) {
      if (plan.expiresAt <= current) {
        plans.delete(planId);
      }
    }
  }

  return {
    create(plan) {
      pruneExpired();
      const created: DeletionPlan = {
        ...plan,
        planId: `delete_plan_${randomBytes(6).toString('hex')}`,
        expiresAt: now() + DELETION_PLAN_TTL_MS,
      };
      plans.set(created.planId, created);
      return created;
    },
    get(planId) {
      pruneExpired();
      return plans.get(planId) ?? null;
    },
    delete(planId) {
      plans.delete(planId);
    },
  };
}

function getWorkingDir(config: AgentConfig): string | null {
  return config.workingDir ? path.resolve(config.workingDir) : null;
}

function getWorkspaceTreePath(workingDir: string): string {
  return path.join(workingDir, WORKSPACE_TREE_FILENAME);
}

function getPageDir(workingDir: string, pageId: string): string {
  return path.join(workingDir, 'demos', pageId);
}

function isSafePageId(pageId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(pageId) && !pageId.includes('..');
}

function isCompletePageDir(workingDir: string, pageId: string): boolean {
  const pageDir = getPageDir(workingDir, pageId);
  return (
    fs.existsSync(pageDir) &&
    fs.existsSync(path.join(pageDir, 'index.tsx')) &&
    fs.existsSync(path.join(pageDir, 'config.schema.json'))
  );
}

function readWorkspaceTree(workingDir: string): WorkspaceTree {
  const treePath = getWorkspaceTreePath(workingDir);
  if (!fs.existsSync(treePath)) {
    return { folders: [], pages: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(treePath, 'utf-8')) as Partial<WorkspaceTree>;
  return {
    folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    pages: Array.isArray(parsed.pages) ? parsed.pages : [],
  };
}

function getTreeSignature(workingDir: string): string {
  const treePath = getWorkspaceTreePath(workingDir);
  const content = fs.existsSync(treePath) ? fs.readFileSync(treePath, 'utf-8') : '';
  return createHash('sha256').update(content).digest('hex');
}

function writeWorkspaceTree(workingDir: string, tree: WorkspaceTree): void {
  fs.writeFileSync(getWorkspaceTreePath(workingDir), JSON.stringify(tree, null, 2), 'utf-8');
}

function listPages(workingDir: string): WorkspacePage[] {
  const tree = readWorkspaceTree(workingDir);
  return tree.pages
    .filter((page) => isSafePageId(page.id) && isCompletePageDir(workingDir, page.id))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function formatPages(pages: WorkspacePage[]): string {
  if (pages.length === 0) return 'No pages found.';
  return pages
    .map((page) => {
      const indexPath = `demos/${page.id}/index.tsx`;
      const schemaPath = `demos/${page.id}/config.schema.json`;
      return `- id: ${page.id}\n  name: ${page.name}\n  indexPath: ${indexPath}\n  schemaPath: ${schemaPath}`;
    })
    .join('\n');
}

function formatDeletionSummary(pages: DeletionPlanPage[], remainingCount: number): string {
  const pageLines = pages.map((page, index) => `${index + 1}. ${page.name} (${page.id})`);
  return [
    `将删除 ${pages.length} 个页面，删除后剩余 ${remainingCount} 个页面。`,
    '',
    ...pageLines,
  ].join('\n');
}

function buildPreviewResult(plan: DeletionPlan) {
  const expiresInSeconds = Math.max(0, Math.round((plan.expiresAt - Date.now()) / 1000));
  return {
    content: [{
      type: 'text' as const,
      text: [
        plan.canExecute
          ? `Prepared deletion plan ${plan.planId}. Ask the user to confirm, then call executeDeletePagePlan with this planId.`
          : `Prepared deletion plan ${plan.planId}, but it cannot be executed: ${plan.reason || 'unknown reason'}.`,
        '',
        plan.confirmationSummary,
      ].join('\n'),
    }],
    details: {
      planId: plan.planId,
      pages: plan.pages,
      pageIds: plan.pageIds,
      remainingCount: Math.max(0, listPages(plan.workingDir).length - plan.pageIds.length),
      canExecute: plan.canExecute,
      reason: plan.reason,
      confirmationSummary: plan.confirmationSummary,
      expiresAt: plan.expiresAt,
      expiresInSeconds,
    },
  };
}

function missingPageResult(workingDir: string, pageId: string, pageName?: string) {
  const pages = listPages(workingDir);
  const matches = pageName ? pages.filter((page) => page.name === pageName) : [];
  const hint =
    matches.length === 1
      ? ` A page with the same name exists: id=${matches[0].id}, name=${matches[0].name}. Use that exact ID and ask again.`
      : matches.length > 1
        ? ` Multiple pages share that name: ${matches.map((page) => `${page.id} (${page.name})`).join(', ')}. Ask the user which ID to delete.`
        : '';

  return {
    content: [{
      type: 'text' as const,
      text: `Error: page id "${pageId}" does not exist in the current workspace.${hint}`,
    }],
    details: {
      pageId,
      pageName,
      error: 'page_not_found',
      candidates: matches.map((page) => ({ id: page.id, name: page.name })),
    },
    isError: true,
  };
}

function deleteOnePage(workingDir: string, pageId: string, pageName?: string) {
  if (!isSafePageId(pageId)) {
    return {
      ok: false as const,
      result: {
        content: [{ type: 'text' as const, text: `Error: invalid page id "${pageId}".` }],
        details: { pageId, pageName, error: 'invalid_page_id' },
        isError: true,
      },
    };
  }

  const tree = readWorkspaceTree(workingDir);
  const existing = tree.pages.find((page) => page.id === pageId);
  if (!existing || !isCompletePageDir(workingDir, pageId)) {
    return { ok: false as const, result: missingPageResult(workingDir, pageId, pageName) };
  }

  const remainingPages = listPages(workingDir).filter((page) => page.id !== pageId);
  if (remainingPages.length < 1) {
    return {
      ok: false as const,
      result: {
        content: [{
          type: 'text' as const,
          text: `Error: cannot delete page "${existing.name}" (${pageId}) because at least one page must remain.`,
        }],
        details: { pageId, pageName: existing.name, error: 'last_page' },
        isError: true,
      },
    };
  }

  const pageDir = getPageDir(workingDir, pageId);
  fs.rmSync(pageDir, { recursive: true, force: true });

  const nextTree: WorkspaceTree = {
    ...tree,
    pages: tree.pages.filter((page) => page.id !== pageId),
  };
  writeWorkspaceTree(workingDir, nextTree);

  const verifyTree = readWorkspaceTree(workingDir);
  const stillExists = fs.existsSync(pageDir) || verifyTree.pages.some((page) => page.id === pageId);
  if (stillExists) {
    return {
      ok: false as const,
      result: {
        content: [{
          type: 'text' as const,
          text: `Error: attempted to delete page "${existing.name}" (${pageId}), but verification failed.`,
        }],
        details: { pageId, pageName: existing.name, error: 'verification_failed' },
        isError: true,
      },
    };
  }

  const deletedPaths = [`demos/${pageId}/`, WORKSPACE_TREE_FILENAME];
  return {
    ok: true as const,
    change: { pageId, pageName: existing.name, deletedPaths },
    result: {
      content: [{
        type: 'text' as const,
        text: `Deleted page "${existing.name}" (${pageId}).`,
      }],
      details: {
        pageId,
        pageName: existing.name,
        deleted: true,
        deletedPages: [{ pageId, pageName: existing.name, deletedPaths }],
      },
    },
  };
}

function deletePageBatch(workingDir: string, pageIds: string[]) {
  const tree = readWorkspaceTree(workingDir);
  const pages = listPages(workingDir);
  const byId = new Map(pages.map((page) => [page.id, page]));
  const missing = pageIds.filter((pageId) => !byId.has(pageId));

  if (missing.length > 0) {
    return {
      ok: false as const,
      result: {
        content: [{ type: 'text' as const, text: `Error: these page IDs no longer exist: ${missing.join(', ')}.` }],
        details: { error: 'page_not_found', missingPageIds: missing },
        isError: true,
      },
    };
  }

  if (pages.length - pageIds.length < 1) {
    return {
      ok: false as const,
      result: {
        content: [{ type: 'text' as const, text: 'Error: cannot delete these pages because at least one page must remain.' }],
        details: { error: 'last_page', requestedPageIds: pageIds },
        isError: true,
      },
    };
  }

  const pageIdSet = new Set(pageIds);
  for (const pageId of pageIds) {
    fs.rmSync(getPageDir(workingDir, pageId), { recursive: true, force: true });
  }

  writeWorkspaceTree(workingDir, {
    ...tree,
    pages: tree.pages.filter((page) => !pageIdSet.has(page.id)),
  });

  const verifyTree = readWorkspaceTree(workingDir);
  const failed = pageIds.filter((pageId) => (
    fs.existsSync(getPageDir(workingDir, pageId)) ||
    verifyTree.pages.some((page) => page.id === pageId)
  ));

  if (failed.length > 0) {
    return {
      ok: false as const,
      result: {
        content: [{ type: 'text' as const, text: `Error: verification failed for pages: ${failed.join(', ')}.` }],
        details: { error: 'verification_failed', failedPageIds: failed },
        isError: true,
      },
    };
  }

  const deletedPages = pageIds.map((pageId) => {
    const page = byId.get(pageId)!;
    return {
      pageId,
      pageName: page.name,
      deletedPaths: [`demos/${pageId}/`, WORKSPACE_TREE_FILENAME],
    };
  });

  return {
    ok: true as const,
    result: {
      content: [{
        type: 'text' as const,
        text: `Deleted ${deletedPages.length} pages: ${deletedPages.map((page) => `${page.pageName} (${page.pageId})`).join(', ')}.`,
      }],
      details: { deleted: true, deletedPages },
    },
  };
}

export function createListPagesTool(config: AgentConfig): AgentTool<typeof ListPagesParams> {
  return {
    name: 'listPages',
    label: 'List Pages',
    description: 'List all pages in the current workspace with exact IDs. Call this before deleting pages.',
    parameters: ListPagesParams,
    execute: async () => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [{ type: 'text' as const, text: 'Error: workingDir is required to list pages.' }],
          details: { error: 'missing_working_dir' },
          isError: true,
        };
      }

      try {
        const pages = listPages(workingDir);
        return {
          content: [{ type: 'text' as const, text: formatPages(pages) }],
          details: {
            pages: pages.map((page) => ({
              id: page.id,
              name: page.name,
              indexPath: `demos/${page.id}/index.tsx`,
              schemaPath: `demos/${page.id}/config.schema.json`,
            })),
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'listPages failed');
        return {
          content: [{ type: 'text' as const, text: `Error listing pages: ${message}` }],
          details: { error: 'list_failed', message },
          isError: true,
        };
      }
    },
  };
}

export function createPreviewDeletePagesTool(
  config: AgentConfig,
  planStore: DeletionPlanStore,
): AgentTool<typeof PreviewDeletePagesParams> {
  return {
    name: 'previewDeletePages',
    label: 'Preview Delete Pages',
    description:
      'Preview a transactional page deletion plan. Use this before executeDeletePagePlan for all batch/all/conditional deletion requests.',
    parameters: PreviewDeletePagesParams,
    execute: async (_toolCallId: string, args: PreviewDeletePagesParams) => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [{ type: 'text' as const, text: 'Error: workingDir is required to preview page deletion.' }],
          details: { error: 'missing_working_dir' },
          isError: true,
        };
      }

      try {
        const pages = listPages(workingDir);
        const pageIds = args.mode === 'explicitIds'
          ? Array.from(new Set(args.pageIds))
          : args.mode === 'folderId'
            ? pages.filter((page) => page.parentId === args.query).map((page) => page.id)
            : pages.filter((page) => page.name.includes(args.query)).map((page) => page.id);

        const byId = new Map(pages.map((page) => [page.id, page]));
        const matchedPages = pageIds
          .map((pageId) => byId.get(pageId))
          .filter((page): page is WorkspacePage => Boolean(page));
        const missingIds = pageIds.filter((pageId) => !byId.has(pageId));
        const remainingCount = pages.length - matchedPages.length;

        let canExecute = true;
        let reason: string | undefined;
        if (matchedPages.length === 0) {
          canExecute = false;
          reason = 'no_pages_matched';
        } else if (missingIds.length > 0) {
          canExecute = false;
          reason = `missing_page_ids:${missingIds.join(',')}`;
        } else if (remainingCount < 1) {
          canExecute = false;
          reason = 'last_page';
        }

        const planPages = matchedPages.map((page) => ({
          id: page.id,
          name: page.name,
          parentId: page.parentId,
        }));
        const confirmationSummary = planPages.length > 0
          ? formatDeletionSummary(planPages, Math.max(0, remainingCount))
          : '没有匹配到可删除页面。';

        const plan = planStore.create({
          workingDir,
          pageIds: planPages.map((page) => page.id),
          pages: planPages,
          treeSignature: getTreeSignature(workingDir),
          confirmationSummary,
          canExecute,
          reason,
        });

        return buildPreviewResult(plan);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'previewDeletePages failed');
        return {
          content: [{ type: 'text' as const, text: `Error previewing page deletion: ${message}` }],
          details: { error: 'preview_failed', message },
          isError: true,
        };
      }
    },
  };
}

export function createExecuteDeletePagePlanTool(
  config: AgentConfig,
  planStore: DeletionPlanStore,
  permissionHandler?: PermissionHandler,
): AgentTool<typeof ExecuteDeletePagePlanParams> {
  return {
    name: 'executeDeletePagePlan',
    label: 'Execute Delete Page Plan',
    description:
      'Execute a page deletion plan returned by previewDeletePages. Never pass page IDs directly to this tool.',
    parameters: ExecuteDeletePagePlanParams,
    execute: async (toolCallId: string, args: ExecuteDeletePagePlanParams) => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [{ type: 'text' as const, text: 'Error: workingDir is required to execute page deletion.' }],
          details: { planId: args.planId, error: 'missing_working_dir' },
          isError: true,
        };
      }

      try {
        const plan = planStore.get(args.planId);
        if (!plan) {
          return {
            content: [{ type: 'text' as const, text: `Error: deletion plan "${args.planId}" does not exist or has expired. Preview again before deleting.` }],
            details: { planId: args.planId, error: 'plan_not_found' },
            isError: true,
          };
        }

        if (!plan.canExecute) {
          return {
            content: [{ type: 'text' as const, text: `Error: deletion plan "${args.planId}" cannot be executed: ${plan.reason || 'unknown reason'}.` }],
            details: { planId: args.planId, error: 'plan_not_executable', reason: plan.reason },
            isError: true,
          };
        }

        if (path.resolve(plan.workingDir) !== workingDir) {
          return {
            content: [{ type: 'text' as const, text: `Error: deletion plan "${args.planId}" belongs to a different workspace.` }],
            details: { planId: args.planId, error: 'working_dir_mismatch' },
            isError: true,
          };
        }

        if (getTreeSignature(workingDir) !== plan.treeSignature) {
          return {
            content: [{ type: 'text' as const, text: `Error: workspace pages changed after preview. Run previewDeletePages again before deleting.` }],
            details: { planId: args.planId, error: 'workspace_changed' },
            isError: true,
          };
        }

        if (permissionHandler) {
          const approved = await permissionHandler(toolCallId, {
            title: `删除 ${plan.pages.length} 个页面`,
            summary: plan.confirmationSummary,
            planId: plan.planId,
          });
          if (!approved) {
            return {
              content: [{ type: 'text' as const, text: `User cancelled deletion plan "${plan.planId}".` }],
              details: { planId: plan.planId, cancelled: true },
              isError: true,
            };
          }
        } else {
          return {
            content: [{ type: 'text' as const, text: 'Error: deletion plan execution requires user permission.' }],
            details: { planId: plan.planId, error: 'permission_required' },
            isError: true,
          };
        }

        const result = deletePageBatch(workingDir, plan.pageIds).result;
        if (!result.isError) {
          planStore.delete(plan.planId);
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ planId: args.planId, error: message }, 'executeDeletePagePlan failed');
        return {
          content: [{ type: 'text' as const, text: `Error executing deletion plan "${args.planId}": ${message}` }],
          details: { planId: args.planId, error: 'execute_failed', message },
          isError: true,
        };
      }
    },
  };
}

export function createDeletePageTool(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
): AgentTool<typeof DeletePageParams> {
  return {
    name: 'deletePage',
    label: 'Delete Page',
    description:
      'Delete exactly one existing page by exact ID from listPages. Do not use this for batch/all/multiple page deletion; use deletePages instead.',
    parameters: DeletePageParams,
    execute: async (toolCallId: string, args: DeletePageParams) => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [{ type: 'text' as const, text: 'Error: workingDir is required to delete pages.' }],
          details: { pageId: args.pageId, error: 'missing_working_dir' },
          isError: true,
        };
      }

      try {
        const pages = listPages(workingDir);
        const page = pages.find((item) => item.id === args.pageId);
        if (!page) {
          return missingPageResult(workingDir, args.pageId, args.pageName);
        }

        if (permissionHandler) {
          const approved = await permissionHandler(toolCallId, {
            title: `删除页面: ${page.name} (${page.id})`,
          });
          if (!approved) {
            return {
              content: [{ type: 'text' as const, text: `User cancelled deletion of page "${page.name}" (${page.id}).` }],
              details: { pageId: page.id, pageName: page.name, cancelled: true },
              isError: true,
            };
          }
        }

        return deleteOnePage(workingDir, page.id, page.name).result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ pageId: args.pageId, error: message }, 'deletePage failed');
        return {
          content: [{ type: 'text' as const, text: `Error deleting page "${args.pageId}": ${message}` }],
          details: { pageId: args.pageId, pageName: args.pageName, error: 'delete_failed', message },
          isError: true,
        };
      }
    },
  };
}

export function createDeletePagesTool(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
): AgentTool<typeof DeletePagesParams> {
  return {
    name: 'deletePages',
    label: 'Delete Pages',
    description:
      'Delete multiple existing pages by exact pageIds from listPages. Use this for any batch/all/multiple deletion request, including "delete all copy pages". This asks for confirmation once.',
    parameters: DeletePagesParams,
    execute: async (toolCallId: string, args: DeletePagesParams) => {
      const workingDir = getWorkingDir(config);
      if (!workingDir) {
        return {
          content: [{ type: 'text' as const, text: 'Error: workingDir is required to delete pages.' }],
          details: { error: 'missing_working_dir' },
          isError: true,
        };
      }

      try {
        const requestedIds = Array.from(new Set(args.pageIds));
        const pages = listPages(workingDir);
        const byId = new Map(pages.map((page) => [page.id, page]));
        const missing = requestedIds.filter((pageId) => !byId.has(pageId));
        if (missing.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Error: these page IDs do not exist: ${missing.join(', ')}. Call listPages and retry with exact IDs.`,
            }],
            details: { error: 'page_not_found', missingPageIds: missing },
            isError: true,
          };
        }

        if (pages.length - requestedIds.length < 1) {
          return {
            content: [{ type: 'text' as const, text: 'Error: cannot delete these pages because at least one page must remain.' }],
            details: { error: 'last_page', requestedPageIds: requestedIds },
            isError: true,
          };
        }

        const confirmLabel = requestedIds
          .map((pageId) => {
            const page = byId.get(pageId)!;
            return `${page.name} (${page.id})`;
          })
          .join(', ');
        if (permissionHandler) {
          const approved = await permissionHandler(toolCallId, {
            title: `删除 ${requestedIds.length} 个页面`,
            summary: confirmLabel,
          });
          if (!approved) {
            return {
              content: [{ type: 'text' as const, text: `User cancelled deletion of ${requestedIds.length} pages.` }],
              details: { cancelled: true, requestedPageIds: requestedIds },
              isError: true,
            };
          }
        }

        const deletedPages: DeletedPageChange[] = [];
        const failedPages: Array<{ pageId: string; error: string }> = [];
        for (const pageId of requestedIds) {
          const result = deleteOnePage(workingDir, pageId, byId.get(pageId)?.name);
          if (result.ok) {
            deletedPages.push(result.change);
          } else {
            failedPages.push({
              pageId,
              error: String(result.result.details?.error || 'delete_failed'),
            });
          }
        }

        if (failedPages.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Deleted ${deletedPages.length} pages, but ${failedPages.length} failed: ${failedPages.map((page) => page.pageId).join(', ')}.`,
            }],
            details: { deletedPages, failedPages, error: 'partial_failure' },
            isError: true,
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Deleted ${deletedPages.length} pages: ${deletedPages.map((page) => `${page.pageName} (${page.pageId})`).join(', ')}.`,
          }],
          details: { deleted: true, deletedPages },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error: message }, 'deletePages failed');
        return {
          content: [{ type: 'text' as const, text: `Error deleting pages: ${message}` }],
          details: { error: 'delete_failed', message },
          isError: true,
        };
      }
    },
  };
}

export const PERMISSION_TIMEOUT = PERMISSION_TIMEOUT_MS;
