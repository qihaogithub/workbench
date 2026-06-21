import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createDeletionPlanStore,
  createDeletePageTool,
  createDeletePagesTool,
  createExecuteDeletePagePlanTool,
  createListPagesTool,
  createPreviewDeletePagesTool,
} from '../../src/backends/pi-tools/delete-page-tool';
import type { AgentConfig } from '../../src/core/types';

describe('page management tools', () => {
  let tmpDir: string;
  let config: AgentConfig;

  function writeTree(pages: Array<{ id: string; name: string; order: number; parentId: string | null }>) {
    fs.writeFileSync(
      path.join(tmpDir, 'workspace-tree.json'),
      JSON.stringify({ folders: [], pages }, null, 2),
      'utf-8',
    );
  }

  function createPage(id: string, name = id, order = 0) {
    const pageDir = path.join(tmpDir, 'demos', id);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, 'index.tsx'), `// ${id}`, 'utf-8');
    fs.writeFileSync(path.join(pageDir, 'config.schema.json'), '{}', 'utf-8');
    return { id, name, order, parentId: null };
  }

  function readTree() {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, 'workspace-tree.json'), 'utf-8')) as {
      pages: Array<{ id: string; name: string }>;
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-page-tool-'));
    config = { sessionId: 'test-session', workingDir: tmpDir };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists pages with exact IDs and paths', async () => {
    writeTree([
      createPage('page_2vpk', '广场页面-平板 - 副本 - 副本', 0),
      createPage('page_keep', '保留页面', 1),
    ]);

    const result = await createListPagesTool(config).execute('tool', {} as any);

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('id: page_2vpk');
    expect(result.content[0].text).toContain('name: 广场页面-平板 - 副本 - 副本');
    expect(result.content[0].text).toContain('demos/page_2vpk/index.tsx');
    expect(result.details.pages).toContainEqual({
      id: 'page_2vpk',
      name: '广场页面-平板 - 副本 - 副本',
      indexPath: 'demos/page_2vpk/index.tsx',
      schemaPath: 'demos/page_2vpk/config.schema.json',
    });
  });

  it('deletes an existing page directory and workspace-tree record', async () => {
    writeTree([
      createPage('page_2vpk', '广场页面-平板 - 副本 - 副本', 0),
      createPage('page_keep', '保留页面', 1),
    ]);
    const permission = vi.fn().mockResolvedValue(true);

    const result = await createDeletePageTool(config, permission).execute('tool', {
      pageId: 'page_2vpk',
      pageName: '广场页面-平板 - 副本 - 副本',
    } as any);

    expect(result.isError).toBeFalsy();
    expect(permission).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_2vpk'))).toBe(false);
    expect(readTree().pages.map((page) => page.id)).toEqual(['page_keep']);
    expect(result.details.deletedPages[0].pageId).toBe('page_2vpk');
  });

  it('rejects a nonexistent page ID and does not modify files', async () => {
    writeTree([
      createPage('page_2vpk', '广场页面-平板 - 副本 - 副本', 0),
      createPage('page_keep', '保留页面', 1),
    ]);
    const before = fs.readFileSync(path.join(tmpDir, 'workspace-tree.json'), 'utf-8');

    const result = await createDeletePageTool(config, vi.fn()).execute('tool', {
      pageId: 'page_63nu',
      pageName: '广场页面-平板 - 副本 - 副本',
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe('page_not_found');
    expect(result.details.candidates).toEqual([
      { id: 'page_2vpk', name: '广场页面-平板 - 副本 - 副本' },
    ]);
    expect(fs.readFileSync(path.join(tmpDir, 'workspace-tree.json'), 'utf-8')).toBe(before);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_2vpk'))).toBe(true);
  });

  it('rejects deleting the last page', async () => {
    writeTree([createPage('page_only', '唯一页面', 0)]);

    const result = await createDeletePageTool(config, vi.fn().mockResolvedValue(true)).execute('tool', {
      pageId: 'page_only',
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe('last_page');
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_only'))).toBe(true);
  });

  it('deletes multiple pages with one confirmation', async () => {
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_b', '副本 B', 1),
      createPage('page_keep', '保留页面', 2),
    ]);
    const permission = vi.fn().mockResolvedValue(true);

    const result = await createDeletePagesTool(config, permission).execute('tool', {
      pageIds: ['page_a', 'page_b'],
    } as any);

    expect(result.isError).toBeFalsy();
    expect(permission).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_b'))).toBe(false);
    expect(readTree().pages.map((page) => page.id)).toEqual(['page_keep']);
    expect(result.details.deletedPages).toHaveLength(2);
  });

  it('previews matching pages without modifying files', async () => {
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_b', '副本 B', 1),
      createPage('page_keep', '保留页面', 2),
    ]);
    const before = fs.readFileSync(path.join(tmpDir, 'workspace-tree.json'), 'utf-8');
    const store = createDeletionPlanStore();

    const result = await createPreviewDeletePagesTool(config, store).execute('tool', {
      mode: 'nameIncludes',
      query: '副本',
    } as any);

    expect(result.isError).toBeFalsy();
    expect(result.details.planId).toMatch(/^delete_plan_/);
    expect(result.details.pages).toEqual([
      { id: 'page_a', name: '副本 A', parentId: null },
      { id: 'page_b', name: '副本 B', parentId: null },
    ]);
    expect(result.details.remainingCount).toBe(1);
    expect(result.details.canExecute).toBe(true);
    expect(result.details.confirmationSummary).toContain('副本 A (page_a)');
    expect(fs.readFileSync(path.join(tmpDir, 'workspace-tree.json'), 'utf-8')).toBe(before);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(true);
  });

  it('executes a previewed deletion plan after one confirmation', async () => {
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_b', '副本 B', 1),
      createPage('page_keep', '保留页面', 2),
    ]);
    const store = createDeletionPlanStore();
    const permission = vi.fn().mockResolvedValue(true);
    const preview = await createPreviewDeletePagesTool(config, store).execute('preview', {
      mode: 'nameIncludes',
      query: '副本',
    } as any);

    const result = await createExecuteDeletePagePlanTool(config, store, permission).execute('execute', {
      planId: preview.details.planId,
    } as any);

    expect(result.isError).toBeFalsy();
    expect(permission).toHaveBeenCalledTimes(1);
    expect(permission).toHaveBeenCalledWith('execute', expect.objectContaining({
      title: '删除 2 个页面',
      planId: preview.details.planId,
      summary: expect.stringContaining('副本 A (page_a)'),
    }));
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_b'))).toBe(false);
    expect(readTree().pages.map((page) => page.id)).toEqual(['page_keep']);
    expect(result.details.deletedPages.map((page: any) => page.pageId)).toEqual(['page_a', 'page_b']);
  });

  it('rejects executing an expired deletion plan', async () => {
    let now = 1000;
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_keep', '保留页面', 1),
    ]);
    const store = createDeletionPlanStore(() => now);
    const preview = await createPreviewDeletePagesTool(config, store).execute('preview', {
      mode: 'nameIncludes',
      query: '副本',
    } as any);
    now += 5 * 60_000 + 1;

    const result = await createExecuteDeletePagePlanTool(config, store, vi.fn().mockResolvedValue(true)).execute('execute', {
      planId: preview.details.planId,
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe('plan_not_found');
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(true);
  });

  it('rejects executing a plan from another workspace', async () => {
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_keep', '保留页面', 1),
    ]);
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'delete-page-tool-other-'));
    try {
      const store = createDeletionPlanStore();
      const preview = await createPreviewDeletePagesTool(config, store).execute('preview', {
        mode: 'nameIncludes',
        query: '副本',
      } as any);

      const result = await createExecuteDeletePagePlanTool(
        { sessionId: 'test-session', workingDir: otherDir },
        store,
        vi.fn().mockResolvedValue(true),
      ).execute('execute', {
        planId: preview.details.planId,
      } as any);

      expect(result.isError).toBe(true);
      expect(result.details.error).toBe('working_dir_mismatch');
      expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(true);
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it('rejects executing when workspace-tree changed after preview', async () => {
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_keep', '保留页面', 1),
    ]);
    const store = createDeletionPlanStore();
    const preview = await createPreviewDeletePagesTool(config, store).execute('preview', {
      mode: 'nameIncludes',
      query: '副本',
    } as any);
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_keep', '保留页面', 1),
      createPage('page_new', '新页面', 2),
    ]);

    const result = await createExecuteDeletePagePlanTool(config, store, vi.fn().mockResolvedValue(true)).execute('execute', {
      planId: preview.details.planId,
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe('workspace_changed');
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(true);
  });

  it('rejects execution when user does not confirm', async () => {
    writeTree([
      createPage('page_a', '副本 A', 0),
      createPage('page_keep', '保留页面', 1),
    ]);
    const store = createDeletionPlanStore();
    const preview = await createPreviewDeletePagesTool(config, store).execute('preview', {
      mode: 'nameIncludes',
      query: '副本',
    } as any);

    const result = await createExecuteDeletePagePlanTool(config, store, vi.fn().mockResolvedValue(false)).execute('execute', {
      planId: preview.details.planId,
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.cancelled).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(true);
  });

  it('previews explicit IDs and rejects plans that would delete the last page', async () => {
    writeTree([
      createPage('page_only', '唯一页面', 0),
    ]);
    const store = createDeletionPlanStore();

    const preview = await createPreviewDeletePagesTool(config, store).execute('preview', {
      mode: 'explicitIds',
      pageIds: ['page_only'],
    } as any);

    expect(preview.details.canExecute).toBe(false);
    expect(preview.details.reason).toBe('last_page');

    const result = await createExecuteDeletePagePlanTool(config, store, vi.fn().mockResolvedValue(true)).execute('execute', {
      planId: preview.details.planId,
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe('plan_not_executable');
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_only'))).toBe(true);
  });
});
