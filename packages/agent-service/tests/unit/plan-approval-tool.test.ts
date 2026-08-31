import { describe, expect, it, vi } from 'vitest';

import { createRequestPlanApprovalTool } from '../../src/backends/pi-tools/plan-approval-tool';

describe('createRequestPlanApprovalTool', () => {
  it('应等待用户批准并返回编辑后的 Markdown 计划', async () => {
    const approvalHandler = vi.fn().mockResolvedValue({
      approved: true,
      planMarkdown: '## 编辑后的计划',
    });
    const tool = createRequestPlanApprovalTool(approvalHandler);

    const result = await tool.execute('approval-1', {
      title: '执行计划',
      planMarkdown: '## 原计划',
    });

    expect(approvalHandler).toHaveBeenCalledWith('approval-1', {
      title: '执行计划',
      planMarkdown: '## 原计划',
    });
    expect(result.isError).toBeFalsy();
    expect(result.details).toEqual({
      success: true,
      planMarkdown: '## 编辑后的计划',
    });
  });

  it('用户拒绝时应返回错误', async () => {
    const tool = createRequestPlanApprovalTool(
      vi.fn().mockResolvedValue({ approved: false }),
    );

    const result = await tool.execute('approval-1', {
      planMarkdown: '## 原计划',
    });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({
      success: false,
      error: 'user_rejected',
    });
  });

  it('取消审批时应保留取消语义并把 AbortSignal 传给处理器', async () => {
    const approvalHandler = vi.fn().mockResolvedValue({
      approved: false,
      reason: 'cancelled',
    });
    const tool = createRequestPlanApprovalTool(approvalHandler);
    const controller = new AbortController();

    const result = await tool.execute('approval-1', {
      planMarkdown: '## 原计划',
    }, controller.signal);

    expect(approvalHandler).toHaveBeenCalledWith(
      'approval-1',
      { title: '执行计划', planMarkdown: '## 原计划' },
      controller.signal,
    );
    expect(result.details).toEqual({ success: false, error: 'approval_cancelled' });
    expect(result.content[0]?.text).toContain('cancelled');
  });

  it('没有审批处理器时应返回不可用错误', async () => {
    const tool = createRequestPlanApprovalTool();

    const result = await tool.execute('approval-1', {
      planMarkdown: '## 原计划',
    });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual({
      success: false,
      error: 'approval_unavailable',
    });
  });
});
