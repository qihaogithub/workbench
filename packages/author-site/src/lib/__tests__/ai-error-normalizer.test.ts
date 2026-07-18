import { normalizeAiError } from '@workbench/shared';

describe('normalizeAiError', () => {
  it('将连接错误映射为用户友好提示', () => {
    const result = normalizeAiError(new Error('Connection error.'));
    expect(result.category).toBe('connection');
    expect(result.userMessage).toBe('AI 服务暂时连接不上，请检查网络或稍后重试。');
    expect(result.technicalMessage).toBe('Connection error.');
  });

  it('将超时错误映射为用户友好提示', () => {
    const result = normalizeAiError({ code: 'ETIMEDOUT', message: 'request timeout' });
    expect(result.category).toBe('timeout');
    expect(result.userMessage).toBe('AI 服务响应超时，请稍后重试或换个更简短的问题。');
  });

  it('将鉴权错误映射为用户友好提示', () => {
    const result = normalizeAiError({ code: '401', message: 'invalid api key' });
    expect(result.category).toBe('auth');
    expect(result.userMessage).toBe('AI 服务鉴权失败，请联系管理员检查模型 API 配置。');
  });

  it('将配额错误映射为用户友好提示', () => {
    const result = normalizeAiError({ code: '429', message: 'rate limit exceeded' });
    expect(result.category).toBe('quota');
    expect(result.userMessage).toBe('AI 服务额度或频率受限，请稍后重试。');
  });

  it('将上一轮仍在运行映射为明确提示', () => {
    const result = normalizeAiError({ code: 'AGENT_BUSY', message: 'Agent is currently processing a previous message' });
    expect(result.category).toBe('busy');
    expect(result.userMessage).toBe('上一轮 AI 请求仍在运行，请等待完成或先取消后再发送。');
  });

  it('将结构化 CONTEXT_OVERFLOW 错误码映射为上下文溢出提示', () => {
    const result = normalizeAiError({
      code: 'CONTEXT_OVERFLOW',
      message: 'maximum context length 1048565 tokens, requested 1161677',
    });
    expect(result.category).toBe('context_overflow');
    expect(result.userMessage).toBe('对话内容过长，已超出模型上下文上限。请新建对话继续；当前对话的历史和结果已保留。');
  });

  it('将 LLM API 400 文本中的 maximum context length 兜底识别为上下文溢出', () => {
    // 后端未打 CONTEXT_OVERFLOW code 时，前端应通过文本兜底识别
    const result = normalizeAiError(
      new Error('400 maximum context length 1048565 tokens, requested 1161677'),
    );
    expect(result.category).toBe('context_overflow');
    expect(result.userMessage).toBe('对话内容过长，已超出模型上下文上限。请新建对话继续；当前对话的历史和结果已保留。');
  });
});
