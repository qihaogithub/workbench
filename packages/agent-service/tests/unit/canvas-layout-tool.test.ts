import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createArrangeCanvasPagesTool } from '../../src/backends/pi-tools/canvas-layout-tool';
import type { AgentConfig } from '../../src/core/types';

interface StoredCanvasLayout {
  state: {
    pages: Record<string, { x: number; y: number; width: number; height: number; zIndex?: number }>;
    viewport: { x: number; y: number; zoom: number };
    nodes?: Record<string, unknown>;
    layers?: Record<string, unknown>;
    hiddenKnowledgeDocumentIds?: string[];
  };
}

describe('arrangeCanvasPages tool', () => {
  let tmpDir: string;
  let config: AgentConfig;

  function writeTree(pages: Array<{ id: string; name: string; order: number; parentId: string | null }>) {
    fs.writeFileSync(
      path.join(tmpDir, 'workspace-tree.json'),
      JSON.stringify({ folders: [], pages }, null, 2),
      'utf-8',
    );
  }

  function createPage(id: string, name: string, order: number, previewSize = { width: 375, height: 812 }) {
    const pageDir = path.join(tmpDir, 'demos', id);
    fs.mkdirSync(pageDir, { recursive: true });
    fs.writeFileSync(path.join(pageDir, 'index.tsx'), `// ${id}`, 'utf-8');
    fs.writeFileSync(
      path.join(pageDir, 'config.schema.json'),
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {},
        required: [],
        $demo: { previewSize },
      }, null, 2),
      'utf-8',
    );
    return { id, name, order, parentId: null };
  }

  function writeCanvasLayout(layout: StoredCanvasLayout['state']['pages']) {
    fs.writeFileSync(
      path.join(tmpDir, '.canvas-layout.json'),
      JSON.stringify({
        version: 1,
        projectId: 'project_1',
        updatedAt: 1000,
        state: {
          pages: layout,
          viewport: { x: 10, y: 20, zoom: 0.5 },
        },
      }, null, 2),
      'utf-8',
    );
  }

  function readCanvasLayout(): StoredCanvasLayout {
    return JSON.parse(fs.readFileSync(path.join(tmpDir, '.canvas-layout.json'), 'utf-8')) as StoredCanvasLayout;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-layout-tool-'));
    config = { sessionId: 'test-session', workingDir: tmpDir };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('默认基于当前布局整理页面并保留已有尺寸', async () => {
    writeTree([
      createPage('page_a', '页面 A', 0, { width: 320, height: 640 }),
      createPage('page_b', '页面 B', 1, { width: 375, height: 812 }),
      createPage('page_c', '页面 C', 2, { width: 375, height: 812 }),
    ]);
    writeCanvasLayout({
      page_a: { x: 3, y: 4, width: 500, height: 700, zIndex: 5 },
      page_b: { x: 360, y: 22, width: 375, height: 812, zIndex: 1 },
      page_c: { x: 8, y: 900, width: 375, height: 812, zIndex: 2 },
    });

    const result = await createArrangeCanvasPagesTool(config).execute('tool', {} as any);
    const stored = readCanvasLayout();

    expect(result.isError).toBeFalsy();
    expect(stored.state.pages.page_a.width).toBe(500);
    expect(stored.state.pages.page_a.height).toBe(700);
    expect(stored.state.pages.page_a.x).toBe(0);
    expect(stored.state.pages.page_b.x).toBeGreaterThanOrEqual(
      stored.state.pages.page_a.x + stored.state.pages.page_a.width + 48,
    );
    expect(stored.state.viewport.zoom).toBeGreaterThan(0);
    expect(result.details.arrangedCount).toBe(3);
  });

  it('网格模式可按页面树顺序并按 previewSize 重置尺寸', async () => {
    writeTree([
      createPage('page_b', '页面 B', 0, { width: 200, height: 300 }),
      createPage('page_a', '页面 A', 1, { width: 300, height: 500 }),
      createPage('page_c', '页面 C', 2, { width: 250, height: 400 }),
    ]);

    const result = await createArrangeCanvasPagesTool(config).execute('tool', {
      mode: 'grid',
      sizeMode: 'preview',
      columns: 2,
      gap: 50,
    } as any);
    const stored = readCanvasLayout();

    expect(result.isError).toBeFalsy();
    expect(result.details.pageIds).toEqual(['page_b', 'page_a', 'page_c']);
    expect(stored.state.pages.page_b).toMatchObject({ x: 0, y: 0, width: 200, height: 300 });
    expect(stored.state.pages.page_a).toMatchObject({ x: 350, y: 0, width: 300, height: 500 });
    expect(stored.state.pages.page_c).toMatchObject({ x: 0, y: 550, width: 250, height: 400 });
  });

  it('指定不存在的页面 ID 时不写入布局文件', async () => {
    writeTree([createPage('page_a', '页面 A', 0)]);

    const result = await createArrangeCanvasPagesTool(config).execute('tool', {
      pageIds: ['page_missing'],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details.error).toBe('page_not_found');
    expect(fs.existsSync(path.join(tmpDir, '.canvas-layout.json'))).toBe(false);
  });

  it('整理页面时保留画布自由节点、图层和隐藏知识文档状态', async () => {
    writeTree([
      createPage('page_a', '页面 A', 0, { width: 320, height: 640 }),
      createPage('page_b', '页面 B', 1, { width: 375, height: 812 }),
    ]);
    const textNode = {
      id: 'text-1',
      kind: 'text',
      title: '说明文字',
      text: 'Agent 可读的画布说明',
      fontSize: 18,
      color: '#111827',
      layout: { x: 40, y: 760, width: 260, height: 120 },
      createdAt: 1,
      updatedAt: 2,
    };
    fs.writeFileSync(
      path.join(tmpDir, '.canvas-layout.json'),
      JSON.stringify({
        version: 1,
        projectId: 'project_1',
        updatedAt: 1000,
        state: {
          pages: {
            page_a: { x: 0, y: 0, width: 320, height: 640 },
            page_b: { x: 400, y: 0, width: 375, height: 812 },
          },
          viewport: { x: 10, y: 20, zoom: 0.5 },
          nodes: { 'text-1': textNode },
          layers: { annotations: { nodes: { 'text-1': textNode } } },
          hiddenKnowledgeDocumentIds: ['kb-1'],
        },
      }, null, 2),
      'utf-8',
    );

    const result = await createArrangeCanvasPagesTool(config).execute('tool', {
      mode: 'grid',
      columns: 2,
    } as any);
    const stored = readCanvasLayout();

    expect(result.isError).toBeFalsy();
    expect(stored.state.nodes).toEqual({ 'text-1': textNode });
    expect(stored.state.layers).toEqual({ annotations: { nodes: { 'text-1': textNode } } });
    expect(stored.state.hiddenKnowledgeDocumentIds).toEqual(['kb-1']);
  });
});
