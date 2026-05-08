import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenCodeHttpBackend } from '../../src/backends/opencode-http';
import { AgentConfig } from '../../src/core/types';

const MOCK_SERVER_URL = 'http://localhost:4096';

function createMockConfig(): AgentConfig {
  return {
    sessionId: 'test-session-123',
    backend: 'opencode-http',
    model: 'test-model',
    workingDir: '/tmp/test',
  };
}

function createEventSourceMock() {
  const handlers: Record<string, any> = {};
  const close = vi.fn();
  const EventSourceMock = vi.fn(() => ({
    close,
    get onmessage() { return handlers.onmessage; },
    set onmessage(h: any) { handlers.onmessage = h; },
    get onerror() { return handlers.onerror; },
    set onerror(h: any) { handlers.onerror = h; },
    get onopen() { return handlers.onopen; },
    set onopen(h: any) { handlers.onopen = h; },
  }));
  return { handlers, close, EventSourceMock };
}

function createSessionFetchMock(extra?: any[]) {
  const mock = vi.fn()
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'oc-session-456' }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  if (extra) {
    for (const r of extra) mock.mockResolvedValueOnce(r);
  }
  return mock;
}

describe('OpenCodeHttpBackend', () => {
  let backend: OpenCodeHttpBackend;

  beforeEach(() => {
    backend = new OpenCodeHttpBackend(createMockConfig());
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('EventSource', vi.fn(() => ({
      onmessage: null,
      onerror: null,
      onopen: null,
      close: vi.fn(),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initialize', () => {
    it('should create session successfully', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'oc-session-456' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        `${MOCK_SERVER_URL}/session`,
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test-session-123'),
        })
      );
      expect(backend.getCurrentSessionId()).toBe('oc-session-456');
    });

    it('should throw error when session creation fails', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Server error'),
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(backend.initialize()).rejects.toThrow('Failed to create OpenCode session');
    });
  });

  describe('sendMessage (sync)', () => {
    it('should send message and return content', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            parts: [{ type: 'text', text: 'Hello world' }],
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      const result = await backend.sendMessage('Test message');

      expect(result).toBe('Hello world');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should emit stream event for sync response', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            parts: [{ type: 'text', text: 'Response text' }],
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      await backend.sendMessage('Test');

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'stream',
        content: 'Response text',
        done: true,
      });
    });
  });

  describe('sendMessage (stream)', () => {
    it('should send async message and resolve on agent_message_done', async () => {
      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test message', { stream: true });

      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (handlers.onmessage) break;
      }

      expect(handlers.onmessage).toBeDefined();

      handlers.onmessage({
        data: JSON.stringify({
          type: 'agent_message_chunk',
          content: { text: 'Hello' },
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      const result = await sendPromise;
      expect(result).toBe('Hello');
    }, 10000);
  });

  describe('SSE event handling', () => {
    it('should handle agent_message_chunk', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (handlers.onmessage) break;
      }

      handlers.onmessage({
        data: JSON.stringify({
          type: 'agent_message_chunk',
          content: { text: 'Chunk 1' },
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({
          type: 'agent_message_chunk',
          content: { text: 'Chunk 2' },
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      await sendPromise;

      const streamEvents = events.filter(e => e.type === 'stream');
      expect(streamEvents).toHaveLength(3);
      expect(streamEvents[0].content).toBe('Chunk 1');
      expect(streamEvents[1].content).toBe('Chunk 2');
      expect(streamEvents[2].done).toBe(true);
    }, 5000);

    it('should handle tool_call events', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      handlers.onmessage({
        data: JSON.stringify({
          type: 'tool_call',
          toolCallId: 'tool-1',
          title: 'Read file',
          kind: 'read',
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      await sendPromise;

      const toolCallEvents = events.filter(e => e.type === 'tool_call');
      expect(toolCallEvents).toHaveLength(1);
      expect(toolCallEvents[0]).toMatchObject({
        toolCallId: 'tool-1',
        title: 'Read file',
        kind: 'read',
        status: 'pending',
      });
    }, 5000);

    it('should handle file_operation events', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      handlers.onmessage({
        data: JSON.stringify({
          type: 'file_operation',
          files: [{
            path: '/tmp/test/file.ts',
            action: 'modified',
            content: 'console.log("hello")',
          }],
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      await sendPromise;

      const fileEvents = events.filter(e => e.type === 'file_operation');
      expect(fileEvents).toHaveLength(1);
      expect(fileEvents[0].fileOperation.path).toBe('/tmp/test/file.ts');

      const files = backend.getFiles();
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('/tmp/test/file.ts');
    }, 5000);
  });

  describe('permission handling', () => {
    it('should auto-approve permission requests', async () => {
      const mockFetch = createSessionFetchMock([{ ok: true }]);
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (handlers.onmessage) break;
      }

      handlers.onmessage({
        data: JSON.stringify({
          type: 'permission_request',
          permissionRequest: {
            permissionId: 'perm-1',
            toolCallId: 'tool-1',
            title: 'Edit file',
            options: [
              { optionId: 'allow_once', name: 'allow_once' },
              { optionId: 'reject_once', name: 'reject_once' },
            ],
          },
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      const result = await sendPromise;
      expect(result).toBe('');

      const permissionCall = mockFetch.mock.calls.find(
        call => call[0].includes('/permissions/')
      );
      expect(permissionCall).toBeDefined();
      expect(permissionCall?.[1].body).toContain('allow_once');
    }, 10000);
  });

  describe('health check', () => {
    it('should return true when server is healthy', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const result = await backend.checkHealth();
      expect(result).toBe(true);
    });

    it('should return false when server is unhealthy', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({ ok: false });
      vi.stubGlobal('fetch', mockFetch);

      const result = await backend.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'oc-session-456' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      expect(backend.getCurrentSessionId()).toBe('oc-session-456');

      await backend.destroy();
      expect(backend.getCurrentSessionId()).toBeNull();
      expect(backend.getFiles()).toHaveLength(0);
    });
  });

  describe('cancelPrompt', () => {
    it('should close SSE and resolve pending stream', async () => {
      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (handlers.onmessage) break;
      }

      handlers.onmessage({
        data: JSON.stringify({
          type: 'agent_message_chunk',
          content: { text: 'Partial' },
        }),
      });

      backend.cancelPrompt();

      const result = await sendPromise;
      expect(result).toBe('Partial');
      const status = await backend.getStatus();
      expect(status).toBe('ready');
    }, 10000);
  });

  describe('setModel', () => {
    it('should update config model', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'oc-session-456' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      await backend.setModel('new-model-id');

      const modelInfo = await backend.getModelInfo();
      expect(modelInfo?.currentModelId).toBe('new-model-id');
    });
  });

  describe('getModelInfo', () => {
    it('should fetch models from server', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { id: 'model-a', label: 'Model A' },
              { id: 'model-b', name: 'Model B' },
            ],
            currentModelId: 'model-a',
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      const modelInfo = await backend.getModelInfo();

      expect(modelInfo).not.toBeNull();
      expect(modelInfo?.currentModelId).toBe('model-a');
      expect(modelInfo?.availableModels).toHaveLength(2);
      expect(modelInfo?.availableModels[0].label).toBe('Model A');
      expect(modelInfo?.availableModels[1].label).toBe('Model B');
      expect(modelInfo?.canSwitch).toBe(true);
    });

    it('should return fallback when server is unavailable', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      const modelInfo = await backend.getModelInfo();

      expect(modelInfo).not.toBeNull();
      expect(modelInfo?.availableModels).toHaveLength(0);
      expect(modelInfo?.currentModelId).toBe('test-model');
    });
  });

  describe('SSE thought event', () => {
    it('should handle agent_thought_chunk', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      handlers.onmessage({
        data: JSON.stringify({
          type: 'agent_thought_chunk',
          content: { text: 'Thinking...' },
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      await sendPromise;

      const thoughtEvents = events.filter(e => e.type === 'thought');
      expect(thoughtEvents).toHaveLength(1);
      expect(thoughtEvents[0].content).toBe('Thinking...');
    }, 5000);
  });

  describe('SSE error event', () => {
    it('should reject on error event from SSE', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      handlers.onmessage({
        data: JSON.stringify({
          type: 'error',
          error: 'Something went wrong',
        }),
      });

      await expect(sendPromise).rejects.toThrow('Something went wrong');

      const errorEvents = events.filter(e => e.type === 'error');
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error.message).toBe('Something went wrong');
    }, 5000);
  });

  describe('SSE connection error', () => {
    it('should reject on SSE connection error', async () => {
      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, close, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      handlers.onerror(new Event('error'));

      await expect(sendPromise).rejects.toThrow('SSE connection error');
      expect(close).toHaveBeenCalled();
    }, 5000);
  });

  describe('tool_call_update event', () => {
    it('should handle tool_call_update from SSE', async () => {
      const events: any[] = [];
      backend.onStream((event) => events.push(event));

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      await new Promise(resolve => setTimeout(resolve, 10));

      handlers.onmessage({
        data: JSON.stringify({
          type: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'completed',
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      await sendPromise;

      const updateEvents = events.filter(e => e.type === 'tool_call_update');
      expect(updateEvents).toHaveLength(1);
      expect(updateEvents[0].toolCallId).toBe('tool-1');
      expect(updateEvents[0].status).toBe('completed');
    }, 5000);
  });

  describe('start with resume', () => {
    it('should resume existing session', async () => {
      await backend.start({ resumeSessionId: 'existing-session-id' });

      expect(backend.getCurrentSessionId()).toBe('existing-session-id');
      const status = await backend.getStatus();
      expect(status).toBe('ready');
    });
  });

  describe('health check failure', () => {
    it('should return false on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await backend.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('destroy with active stream', () => {
    it('should reject pending stream on destroy', async () => {
      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (handlers.onmessage) break;
      }

      handlers.onmessage({
        data: JSON.stringify({
          type: 'agent_message_chunk',
          content: { text: 'Partial' },
        }),
      });

      await backend.destroy();

      await expect(sendPromise).rejects.toThrow('Backend destroyed');
      expect(backend.getCurrentSessionId()).toBeNull();
    }, 10000);
  });

  describe('setPromptTimeout', () => {
    it('should set timeout in opencode config', async () => {
      const configWithOpencode = createMockConfig();
      configWithOpencode.opencode = { timeout: 30000 };
      const backendWithConfig = new OpenCodeHttpBackend(configWithOpencode);

      backendWithConfig.setPromptTimeout(60);

      expect(configWithOpencode.opencode!.timeout).toBe(60000);
    });

    it('should not throw when opencode config is absent', () => {
      expect(() => backend.setPromptTimeout(60)).not.toThrow();
    });
  });

  describe('initialize idempotency', () => {
    it('should not re-initialize when already ready', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'oc-session-456' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      await backend.initialize();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not re-initialize when initializing', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'oc-session-456' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      const status = await backend.getStatus();
      expect(status).toBe('ready');
    });
  });

  describe('sendMessage sync error handling', () => {
    it('should throw on non-ok response from sync message', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('Bad request'),
        });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      await expect(backend.sendMessage('Test')).rejects.toThrow('Failed to send message');
      const status = await backend.getStatus();
      expect(status).toBe('error');
    });

    it('should throw on non-ok response from async message', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          text: () => Promise.resolve('Server error'),
        });
      vi.stubGlobal('fetch', mockFetch);

      await backend.initialize();
      await expect(backend.sendMessage('Test', { stream: true })).rejects.toThrow('Failed to send async message');
    });
  });

  describe('sendMessage without session', () => {
    it('should auto-initialize when session is null', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'oc-session-456' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            parts: [{ type: 'text', text: 'Auto-initialized' }],
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await backend.sendMessage('Test');
      expect(result).toBe('Auto-initialized');
    });
  });

  describe('permission handling fallback', () => {
    it('should reject when no allow option found', async () => {
      const mockFetch = createSessionFetchMock([{ ok: true }]);
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await backend.initialize();
      const sendPromise = backend.sendMessage('Test', { stream: true });

      for (let i = 0; i < 50; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
        if (handlers.onmessage) break;
      }

      handlers.onmessage({
        data: JSON.stringify({
          type: 'permission_request',
          permissionRequest: {
            permissionId: 'perm-2',
            toolCallId: 'tool-2',
            options: [
              { optionId: 'deny', name: 'deny' },
            ],
          },
        }),
      });

      handlers.onmessage({
        data: JSON.stringify({ type: 'agent_message_done' }),
      });

      await sendPromise;

      const permissionCall = mockFetch.mock.calls.find(
        call => call[0].includes('/permissions/')
      );
      expect(permissionCall).toBeDefined();
      expect(permissionCall?.[1].body).toContain('deny');
    }, 10000);
  });

  describe('SSE stream timeout', () => {
    it('should reject on SSE stream timeout', async () => {
      const shortTimeoutConfig = createMockConfig();
      shortTimeoutConfig.timeout = 100;
      const shortTimeoutBackend = new OpenCodeHttpBackend(shortTimeoutConfig);

      const mockFetch = createSessionFetchMock();
      vi.stubGlobal('fetch', mockFetch);

      const { handlers, EventSourceMock } = createEventSourceMock();
      vi.stubGlobal('EventSource', EventSourceMock);

      await shortTimeoutBackend.initialize();
      const sendPromise = shortTimeoutBackend.sendMessage('Test', { stream: true });

      await expect(sendPromise).rejects.toThrow('SSE stream timeout');
    }, 10000);
  });

  describe('getWorkingDir', () => {
    it('should return null (not implemented for HTTP backend)', () => {
      expect(backend.getWorkingDir?.()).toBeUndefined();
    });
  });
});
