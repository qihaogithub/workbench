import { describe, expect, it } from 'vitest';

import { createRequestUserChoiceTool } from '../../src/backends/pi-tools/user-choice-tool';

describe('requestUserChoice tool', () => {
  it('应将用户选择作为结构化工具结果返回', async () => {
    const tool = createRequestUserChoiceTool(async (_requestId, request) => ({
      success: true,
      choice: {
        type: 'option',
        optionId: request.options[0].optionId,
        label: request.options[0].label,
        value: request.options[0].value,
      },
      message: `User selected: ${request.options[0].label}`,
    }));

    const result = await tool.execute('choice-1', {
      question: '选择布局？',
      options: [
        { label: '左右布局', value: 'split' },
        { label: '上下布局', value: 'stack' },
      ],
    });

    expect(result.isError).toBe(false);
    expect(result.details).toEqual(
      expect.objectContaining({
        success: true,
        choice: expect.objectContaining({
          type: 'option',
          label: '左右布局',
          value: 'split',
        }),
      }),
    );
  });

  it('没有交互通道时返回 choice_unavailable', async () => {
    const tool = createRequestUserChoiceTool();

    const result = await tool.execute('choice-1', {
      question: '选择布局？',
      options: [
        { label: '左右布局' },
        { label: '上下布局' },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual(
      expect.objectContaining({
        success: false,
        error: 'choice_unavailable',
      }),
    );
  });

  it('拒绝少于两个选项的请求', async () => {
    const tool = createRequestUserChoiceTool(async () => ({
      success: false,
      error: 'invalid_choice',
      message: 'should not run',
    }));

    const result = await tool.execute('choice-1', {
      question: '选择布局？',
      options: [{ label: '左右布局' }],
    });

    expect(result.isError).toBe(true);
    expect(result.details).toEqual(
      expect.objectContaining({
        success: false,
        error: 'invalid_options',
      }),
    );
  });
});
