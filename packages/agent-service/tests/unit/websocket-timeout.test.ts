import { afterEach, describe, expect, it } from 'vitest';

import { createAgentBusyResult } from '../../src/core/agent-manager';
import { resolveExplicitMessageTimeoutMs } from '../../src/routes/websocket';

describe('WebSocket explicit message timeout', () => {
  const originalTimeout = process.env.PI_AGENT_TIMEOUT;

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.PI_AGENT_TIMEOUT;
    } else {
      process.env.PI_AGENT_TIMEOUT = originalTimeout;
    }
  });

  it('does not turn PI_AGENT_TIMEOUT into a default idle cancellation deadline', () => {
    process.env.PI_AGENT_TIMEOUT = '120000';

    expect(resolveExplicitMessageTimeoutMs()).toBeNull();
  });

  it('uses a request timeout only when the caller explicitly provides one', () => {
    process.env.PI_AGENT_TIMEOUT = '120000';

    expect(resolveExplicitMessageTimeoutMs(45000)).toBe(45000);
  });

  it('does not infer a timeout from attachment-style request shape', () => {
    process.env.PI_AGENT_TIMEOUT = '120000';

    expect(resolveExplicitMessageTimeoutMs()).toBeNull();
  });

  it('clamps unsafe timeout values', () => {
    expect(resolveExplicitMessageTimeoutMs(1000)).toBe(15000);

    expect(resolveExplicitMessageTimeoutMs(1200000)).toBe(600000);
  });
});

describe('Agent busy response', () => {
  it('returns a retryable AGENT_BUSY error instead of re-entering the harness', () => {
    expect(createAgentBusyResult()).toEqual({
      success: false,
      error: {
        code: 'AGENT_BUSY',
        message: '上一轮 AI 请求仍在运行，请等待完成或先取消后再发送。',
        retryable: true,
      },
    });
  });
});
