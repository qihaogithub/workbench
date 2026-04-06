import { describe, it, expect } from 'vitest';
import { ACP_BACKENDS, ACP_METHODS } from '../../src/acp/types';

describe('ACP Types', () => {
  describe('ACP_BACKENDS', () => {
    it('should have opencode backend configured', () => {
      expect(ACP_BACKENDS.opencode).toBeDefined();
      expect(ACP_BACKENDS.opencode.name).toBe('OpenCode');
      expect(ACP_BACKENDS.opencode.cliCommand).toBe('opencode');
      expect(ACP_BACKENDS.opencode.acpArgs).toContain('acp');
    });

    it('should have claude backend configured', () => {
      expect(ACP_BACKENDS.claude).toBeDefined();
      expect(ACP_BACKENDS.claude.name).toBe('Claude Code');
      expect(ACP_BACKENDS.claude.authRequired).toBe(true);
    });

    it('should have all expected backends', () => {
      const expectedBackends = [
        'opencode',
        'claude',
        'codex',
        'gemini',
        'qwen',
        'goose',
        'auggie',
        'kimi',
        'copilot',
        'qoder',
        'vibe',
        'custom',
      ];

      for (const backend of expectedBackends) {
        expect(ACP_BACKENDS[backend as keyof typeof ACP_BACKENDS]).toBeDefined();
      }
    });

    it('should have enabled flag for backends', () => {
      for (const [_key, backend] of Object.entries(ACP_BACKENDS)) {
        expect(backend.enabled).toBeDefined();
      }
    });
  });

  describe('ACP_METHODS', () => {
    it('should have required methods', () => {
      expect(ACP_METHODS.INITIALIZE).toBe('initialize');
      expect(ACP_METHODS.AUTHENTICATE).toBe('authenticate');
      expect(ACP_METHODS.SESSION_NEW).toBe('session/new');
      expect(ACP_METHODS.SESSION_LOAD).toBe('session/load');
      expect(ACP_METHODS.SESSION_PROMPT).toBe('session/prompt');
      expect(ACP_METHODS.SESSION_CANCEL).toBe('session/cancel');
      expect(ACP_METHODS.REQUEST_PERMISSION).toBe('session/request_permission');
      expect(ACP_METHODS.SET_MODEL).toBe('session/set_model');
    });
  });
});
