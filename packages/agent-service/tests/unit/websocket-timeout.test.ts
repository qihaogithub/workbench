import { afterEach, describe, expect, it } from 'vitest';

import { resolveMessageTimeoutMs } from '../../src/routes/websocket';

describe('WebSocket message timeout', () => {
  const originalTimeout = process.env.PI_AGENT_TIMEOUT;

  afterEach(() => {
    if (originalTimeout === undefined) {
      delete process.env.PI_AGENT_TIMEOUT;
    } else {
      process.env.PI_AGENT_TIMEOUT = originalTimeout;
    }
  });

  it('uses PI_AGENT_TIMEOUT instead of the old hardcoded five minute delay', () => {
    process.env.PI_AGENT_TIMEOUT = '120000';

    expect(resolveMessageTimeoutMs()).toBe(120000);
  });

  it('lets a request timeout override the service default', () => {
    process.env.PI_AGENT_TIMEOUT = '120000';

    expect(resolveMessageTimeoutMs(45000)).toBe(45000);
  });

  it('clamps unsafe timeout values', () => {
    process.env.PI_AGENT_TIMEOUT = '1000';
    expect(resolveMessageTimeoutMs()).toBe(15000);

    process.env.PI_AGENT_TIMEOUT = '1200000';
    expect(resolveMessageTimeoutMs()).toBe(600000);
  });
});
