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
});
