import { describe, it, expect, beforeEach } from 'vitest';
import { AcpApprovalStore, createAcpApprovalKey } from '../../src/acp/approval-store';

describe('AcpApprovalStore', () => {
  let store: AcpApprovalStore;

  beforeEach(() => {
    store = new AcpApprovalStore();
  });

  describe('put and get', () => {
    it('should store and retrieve approval', () => {
      const key = {
        kind: 'execute',
        title: 'Run command',
        rawInput: { command: 'npm test' },
      };

      store.put(key, 'allow_always');
      expect(store.get(key)).toBe('allow_always');
    });

    it('should only store allow_always approvals', () => {
      const key = {
        kind: 'execute',
        title: 'Run command',
        rawInput: { command: 'npm test' },
      };

      store.put(key, 'allow_once');
      expect(store.get(key)).toBeUndefined();
    });

    it('should normalize keys for comparison', () => {
      const key1 = {
        kind: 'execute',
        title: 'Run command',
        rawInput: { command: 'npm test', extra: 'ignored' },
      };

      const key2 = {
        kind: 'execute',
        title: 'Run command',
        rawInput: { command: 'npm test' },
      };

      store.put(key1, 'allow_always');
      expect(store.get(key2)).toBe('allow_always');
    });
  });

  describe('isApprovedForSession', () => {
    it('should return true for approved key', () => {
      const key = {
        kind: 'read',
        title: 'Read file',
        rawInput: { path: '/test/file.txt' },
      };

      store.put(key, 'allow_always');
      expect(store.isApprovedForSession(key)).toBe(true);
    });

    it('should return false for non-approved key', () => {
      const key = {
        kind: 'read',
        title: 'Read file',
        rawInput: { path: '/test/file.txt' },
      };

      expect(store.isApprovedForSession(key)).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all approvals', () => {
      const key = {
        kind: 'execute',
        title: 'Run command',
        rawInput: { command: 'npm test' },
      };

      store.put(key, 'allow_always');
      expect(store.size).toBe(1);

      store.clear();
      expect(store.size).toBe(0);
      expect(store.isApprovedForSession(key)).toBe(false);
    });
  });

  describe('createAcpApprovalKey', () => {
    it('should create key from tool call', () => {
      const toolCall = {
        kind: 'execute',
        title: 'Run command',
        rawInput: { command: 'npm test' },
      };

      const key = createAcpApprovalKey(toolCall);

      expect(key.kind).toBe('execute');
      expect(key.title).toBe('Run command');
      expect(key.rawInput).toEqual({ command: 'npm test' });
    });

    it('should handle missing fields', () => {
      const toolCall = {};

      const key = createAcpApprovalKey(toolCall);

      expect(key.kind).toBe('unknown');
      expect(key.title).toBe('');
      expect(key.rawInput).toBeUndefined();
    });
  });
});
