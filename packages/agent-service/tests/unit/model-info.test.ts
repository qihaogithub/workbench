import { describe, it, expect } from 'vitest';
import { buildAcpModelInfo, summarizeAcpModelInfo } from '../../src/acp/model-info';
import type { AcpSessionConfigOption, AcpSessionModels } from '../../src/acp/types';

describe('model-info', () => {
  describe('buildAcpModelInfo', () => {
    it('should build model info from configOptions', () => {
      const configOptions: AcpSessionConfigOption[] = [
        {
          id: 'model-selector',
          name: 'Model',
          type: 'select',
          category: 'model',
          currentValue: 'gpt-4',
          options: [
            { value: 'gpt-4', name: 'GPT-4' },
            { value: 'gpt-3.5', name: 'GPT-3.5' },
          ],
        },
      ];

      const modelInfo = buildAcpModelInfo(configOptions, null);

      expect(modelInfo).not.toBeNull();
      expect(modelInfo!.currentModelId).toBe('gpt-4');
      expect(modelInfo!.currentModelLabel).toBe('GPT-4');
      expect(modelInfo!.availableModels).toHaveLength(2);
      expect(modelInfo!.canSwitch).toBe(true);
      expect(modelInfo!.source).toBe('configOption');
    });

    it('should build model info from models', () => {
      const models: AcpSessionModels = {
        currentModelId: 'claude-3',
        availableModels: [
          { id: 'claude-3', name: 'Claude 3' },
          { id: 'claude-2', name: 'Claude 2' },
        ],
      };

      const modelInfo = buildAcpModelInfo(null, models);

      expect(modelInfo).not.toBeNull();
      expect(modelInfo!.currentModelId).toBe('claude-3');
      expect(modelInfo!.currentModelLabel).toBe('Claude 3');
      expect(modelInfo!.availableModels).toHaveLength(2);
      expect(modelInfo!.source).toBe('models');
    });

    it('should prefer configOptions over models', () => {
      const configOptions: AcpSessionConfigOption[] = [
        {
          id: 'model-selector',
          type: 'select',
          category: 'model',
          currentValue: 'config-model',
          options: [{ value: 'config-model', name: 'Config Model' }],
        },
      ];

      const models: AcpSessionModels = {
        currentModelId: 'models-model',
        availableModels: [{ id: 'models-model', name: 'Models Model' }],
      };

      const modelInfo = buildAcpModelInfo(configOptions, models);

      expect(modelInfo!.currentModelId).toBe('config-model');
      expect(modelInfo!.source).toBe('configOption');
    });

    it('should return null when no model info available', () => {
      const modelInfo = buildAcpModelInfo(null, null);
      expect(modelInfo).toBeNull();
    });

    it('should handle single model (canSwitch false)', () => {
      const configOptions: AcpSessionConfigOption[] = [
        {
          id: 'model-selector',
          type: 'select',
          category: 'model',
          currentValue: 'only-model',
          options: [{ value: 'only-model', name: 'Only Model' }],
        },
      ];

      const modelInfo = buildAcpModelInfo(configOptions, null);

      expect(modelInfo!.canSwitch).toBe(false);
    });
  });

  describe('summarizeAcpModelInfo', () => {
    it('should summarize model info', () => {
      const modelInfo = {
        currentModelId: 'gpt-4',
        currentModelLabel: 'GPT-4',
        availableModels: [
          { id: 'gpt-4', label: 'GPT-4' },
          { id: 'gpt-3.5', label: 'GPT-3.5' },
          { id: 'gpt-3', label: 'GPT-3' },
        ],
        canSwitch: true,
        source: 'configOption' as const,
      };

      const summary = summarizeAcpModelInfo(modelInfo);

      expect(summary.source).toBe('configOption');
      expect(summary.currentModelId).toBe('gpt-4');
      expect(summary.currentModelLabel).toBe('GPT-4');
      expect(summary.availableModelCount).toBe(3);
      expect(summary.canSwitch).toBe(true);
      expect(summary.sampleModelIds).toEqual(['gpt-4', 'gpt-3.5', 'gpt-3']);
    });

    it('should limit sampleModelIds to 8', () => {
      const availableModels = Array.from({ length: 10 }, (_, i) => ({
        id: `model-${i}`,
        label: `Model ${i}`,
      }));

      const modelInfo = {
        currentModelId: 'model-0',
        currentModelLabel: 'Model 0',
        availableModels,
        canSwitch: true,
        source: 'models' as const,
      };

      const summary = summarizeAcpModelInfo(modelInfo);

      expect(summary.sampleModelIds).toHaveLength(8);
    });

    it('should handle null model info', () => {
      const summary = summarizeAcpModelInfo(null);

      expect(summary.source).toBeNull();
      expect(summary.currentModelId).toBeNull();
      expect(summary.availableModelCount).toBe(0);
      expect(summary.canSwitch).toBe(false);
      expect(summary.sampleModelIds).toEqual([]);
    });
  });
});
