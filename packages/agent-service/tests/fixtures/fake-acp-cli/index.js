#!/usr/bin/env node
/**
 * Fake ACP CLI for testing.
 *
 * Minimal ACP JSON-RPC 2.0 server communicating via stdin/stdout.
 * Supports: initialize, session/new, session/prompt (streaming chunks).
 */

const JSONRPC_VERSION = '2.0';

let sessionCounter = 0;

function sendResponse(id, result) {
  const msg = JSON.stringify({ jsonrpc: JSONRPC_VERSION, id, result });
  process.stdout.write(msg + '\n');
}

function sendNotification(method, params) {
  const msg = JSON.stringify({ jsonrpc: JSONRPC_VERSION, method, params });
  process.stdout.write(msg + '\n');
}

function handleRequest(message) {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize': {
      sendResponse(id, {
        protocolVersion: 1,
        serverCapabilities: {
          streaming: true,
          sessionManagement: true,
        },
        serverInfo: {
          name: 'fake-acp-cli',
          version: '1.0.0',
        },
      });
      break;
    }

    case 'authenticate': {
      sendResponse(id, { authenticated: true });
      break;
    }

    case 'session/new': {
      sessionCounter++;
      const sessionId = `fake-session-${sessionCounter}`;
      sendResponse(id, {
        sessionId,
        modes: [{ id: 'default', name: 'Default' }],
        configOptions: [
          {
            id: 'model-selector',
            name: 'Model',
            type: 'select',
            category: 'model',
            currentValue: 'fake-model-1',
            options: [
              { value: 'fake-model-1', name: 'Fake Model 1' },
              { value: 'fake-model-2', name: 'Fake Model 2' },
            ],
          },
        ],
        models: {
          currentModelId: 'fake-model-1',
          availableModels: [
            { id: 'fake-model-1', name: 'Fake Model 1' },
            { id: 'fake-model-2', name: 'Fake Model 2' },
          ],
        },
      });
      break;
    }

    case 'session/load': {
      const sessionId = params?.sessionId || `loaded-session-${Date.now()}`;
      sendResponse(id, {
        sessionId,
        configOptions: [],
        models: {
          currentModelId: 'fake-model-1',
          availableModels: [{ id: 'fake-model-1', name: 'Fake Model 1' }],
        },
      });
      break;
    }

    case 'session/prompt': {
      const sessionId = params?.sessionId || 'unknown';
      const promptText =
        Array.isArray(params?.prompt) && params?.prompt[0]?.text ? params.prompt[0].text : 'unknown';

      // Send thought chunk first
      sendNotification('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'agent_thought_chunk',
          content: { type: 'text', text: 'Thinking about the request...' },
        },
      });

      // Send streaming chunks via session/update notifications
      const responseText = `Fake response to: ${promptText}`;
      const chunks = [responseText.slice(0, 10), responseText.slice(10)];

      for (const chunk of chunks) {
        sendNotification('session/update', {
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: chunk },
          },
        });
      }

      // Send tool call example
      sendNotification('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          title: 'Read file',
          kind: 'read',
          status: 'pending',
        },
      });

      // Send tool call update
      sendNotification('session/update', {
        sessionId,
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tool-1',
          status: 'completed',
        },
      });

      // Final response with end_turn
      sendResponse(id, {
        stopReason: 'end_turn',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
      });
      break;
    }

    case 'session/cancel': {
      break;
    }

    case 'session/set_mode':
    case 'session/set_model':
    case 'session/set_config_option': {
      sendResponse(id, {});
      break;
    }

    case 'session/request_permission': {
      sendResponse(id, {
        outcome: { outcome: 'selected', optionId: 'allow_once' },
      });
      break;
    }

    default: {
      if (id !== undefined) {
        const msg = JSON.stringify({
          jsonrpc: JSONRPC_VERSION,
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        });
        process.stdout.write(msg + '\n');
      }
      break;
    }
  }
}

const readline = require('readline');
const stdin = readline.createInterface({ input: process.stdin, terminal: false });

stdin.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed);
    handleRequest(message);
  } catch {
    // Ignore parse errors
  }
});

stdin.on('close', () => {
  process.exit(0);
});

process.stdin.resume();
