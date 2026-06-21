import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  createDeletePageTool,
  createDeletePagesTool,
  createListPagesTool,
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
      pages: [
        { pageId: 'page_a', pageName: '副本 A' },
        { pageId: 'page_b', pageName: '副本 B' },
      ],
    } as any);

    expect(result.isError).toBeFalsy();
    expect(permission).toHaveBeenCalledTimes(1);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_a'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, 'demos', 'page_b'))).toBe(false);
    expect(readTree().pages.map((page) => page.id)).toEqual(['page_keep']);
    expect(result.details.deletedPages).toHaveLength(2);
  });
});
