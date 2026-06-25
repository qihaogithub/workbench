import { describe, expect, it } from 'vitest';

import { createUpdatePlanTool } from '../../src/backends/pi-tools/plan-tool';

describe('createUpdatePlanTool', () => {
  it('应正常返回结构化计划项', async () => {
    const tool = createUpdatePlanTool();

    const result = await tool.execute('plan-1', {
      items: [
        { id: 'inspect', title: '检查现状', status: 'completed' },
        { id: 'implement', title: '实现功能', status: 'in_progress' },
      ],
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('1/2 completed');
    expect(result.details).toEqual({
      success: true,
      items: [
        { id: 'inspect', title: '检查现状', status: 'completed' },
        { id: 'implement', title: '实现功能', status: 'in_progress' },
      ],
    });
  });

  it('应拒绝空计划列表', async () => {
    const tool = createUpdatePlanTool();

    const result = await tool.execute('plan-1', { items: [] } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('at least one'),
      }),
    );
  });

  it('应拒绝非法状态', async () => {
    const tool = createUpdatePlanTool();

    const result = await tool.execute('plan-1', {
      items: [{ id: 'inspect', title: '检查现状', status: 'blocked' }],
    } as any);

    expect(result.isError).toBe(true);
    expect(result.details).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('invalid status'),
      }),
    );
  });

  it('应拒绝重复 id', async () => {
    const tool = createUpdatePlanTool();

    const result = await tool.execute('plan-1', {
      items: [
        { id: 'inspect', title: '检查现状', status: 'completed' },
        { id: 'inspect', title: '再次检查', status: 'pending' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('duplicate'),
      }),
    );
  });
});
