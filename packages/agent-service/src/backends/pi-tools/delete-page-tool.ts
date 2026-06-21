import * as fs from 'fs';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { AgentConfig } from '../../core/types';
import { logger } from '../../utils/logger';

const PERMISSION_TIMEOUT_MS = 60_000;
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
  pages: Type.Array(
    Type.Object({
      pageId: Type.String({
        description: 'Exact page ID from listPages. Do not guess this value.',
      }),
      pageName: Type.Optional(Type.String({
        description: 'Optional display name for confirmation only.',
      })),
    }),
    { minItems: 1 },
  ),
});

type DeletePagesParams = Static<typeof DeletePagesParams>;

export type PermissionHandler = (toolCallId: string, pageName: string) => Promise<boolean>;

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

export function createDeletePageTool(
  config: AgentConfig,
  permissionHandler?: PermissionHandler,
): AgentTool<typeof DeletePageParams> {
  return {
    name: 'deletePage',
    label: 'Delete Page',
    description:
      'Delete one existing page by exact ID from listPages. Never guess page IDs. If the ID is wrong, this tool fails and does not delete anything.',
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
          const approved = await permissionHandler(toolCallId, `${page.name} (${page.id})`);
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
      'Delete multiple existing pages by exact IDs from listPages. This asks for confirmation once and returns per-page results.',
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
        const requestedIds = Array.from(new Set(args.pages.map((page) => page.pageId)));
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
          const approved = await permissionHandler(toolCallId, `${requestedIds.length} pages: ${confirmLabel}`);
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
