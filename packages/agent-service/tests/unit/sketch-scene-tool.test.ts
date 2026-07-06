import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createBindSketchConfigTool,
  createPatchSketchSceneTool,
} from '../../src/backends/pi-tools/sketch-scene-tool';
import type { AgentConfig } from '../../src/core/types';

const baseScene = {
  version: 1,
  pageSize: { width: 400, height: 300 },
  nodes: [
    {
      id: 'title',
      type: 'text',
      x: 20,
      y: 24,
      width: 160,
      height: 40,
      text: 'Old title',
    },
  ],
  assets: [],
  bindings: {},
};

describe('sketch scene pi tools', () => {
  let workspaceDir: string;
  let config: AgentConfig;

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'sketch-tool-'));
    await fs.promises.mkdir(path.join(workspaceDir, 'demos', 'page-1'), { recursive: true });
    await fs.promises.writeFile(
      path.join(workspaceDir, 'demos', 'page-1', 'sketch.scene.json'),
      JSON.stringify(baseScene, null, 2),
      'utf-8',
    );
    config = { sessionId: 'session-1', workingDir: workspaceDir };
  });

  afterEach(async () => {
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  });

  it('returns patch audit details when patchSketchScene changes a scene', async () => {
    const tool = createPatchSketchSceneTool(config);
    const result = await tool.execute('tool-1', {
      pageId: 'page-1',
      operations: [{ op: 'update', nodeId: 'title', patch: { text: 'New title' } }],
    });

    expect(result.isError).toBeFalsy();
    expect(result.details.patch).toMatchObject({
      operationCount: 1,
      changed: true,
      nodeCountBefore: 1,
      nodeCountAfter: 1,
    });
    expect(result.details.patch.baseSceneKey).not.toEqual(result.details.patch.nextSceneKey);
    expect(result.details.patch.operations).toEqual([
      { op: 'update', nodeId: 'title', patch: { text: 'New title' } },
    ]);

    const saved = JSON.parse(
      await fs.promises.readFile(path.join(workspaceDir, 'demos', 'page-1', 'sketch.scene.json'), 'utf-8'),
    );
    expect(saved.nodes[0].text).toBe('New title');
  });

  it('reports no-op patchSketchScene operations without rewriting the scene', async () => {
    const tool = createPatchSketchSceneTool(config);
    const before = await fs.promises.readFile(
      path.join(workspaceDir, 'demos', 'page-1', 'sketch.scene.json'),
      'utf-8',
    );
    const result = await tool.execute('tool-1', {
      pageId: 'page-1',
      operations: [{ op: 'update', nodeId: 'title', patch: { text: 'Old title' } }],
    });
    const after = await fs.promises.readFile(
      path.join(workspaceDir, 'demos', 'page-1', 'sketch.scene.json'),
      'utf-8',
    );

    expect(result.isError).toBeFalsy();
    expect(result.details.patch.changed).toBe(false);
    expect(result.details.patch.baseSceneKey).toEqual(result.details.patch.nextSceneKey);
    expect(after).toBe(before);
  });

  it('returns patch audit details for bindSketchConfig', async () => {
    const tool = createBindSketchConfigTool(config);
    const result = await tool.execute('tool-1', {
      pageId: 'page-1',
      nodeId: 'title',
      property: 'text',
      field: 'headline',
    });

    expect(result.isError).toBeFalsy();
    expect(result.details.patch).toMatchObject({
      operationCount: 1,
      changed: true,
      nodeCountBefore: 1,
      nodeCountAfter: 1,
    });
    expect(result.details.patch.operations).toEqual([
      { op: 'bind', nodeId: 'title', property: 'text', field: 'headline' },
    ]);
    expect(result.details.scene.nodes[0].bindings).toEqual({ text: 'headline' });
  });
});
