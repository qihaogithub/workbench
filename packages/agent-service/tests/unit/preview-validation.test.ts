import { describe, expect, it } from 'vitest';

import {
  formatRuntimeValidationInstruction,
  validatePreviewFileWrite,
} from '../../src/backends/pi-tools/preview-validation';

describe('preview-validation', () => {
  it('returns prototypeGate for valid prototype html writes', () => {
    const result = validatePreviewFileWrite(
      'demos/home/prototype.html',
      '<main><h1>首页</h1></main>',
    );

    expect(result).toMatchObject({
      ok: true,
      file: 'demos/home/prototype.html',
      pageId: 'home',
      prototypeGate: {
        decision: 'accept_prototype',
        reasonCodes: [],
      },
    });
  });

  it('marks repairable prototype css issues', () => {
    const result = validatePreviewFileWrite(
      'demos/home/prototype.css',
      '@import url("https://example.com/theme.css"); body { color: red; }',
    );

    expect(result).toMatchObject({
      ok: false,
      prototypeGate: {
        decision: 'repair_prototype',
      },
    });
    expect(result?.prototypeGate?.reasonCodes).toEqual(
      expect.arrayContaining([
        'PROTOTYPE_CSS_IMPORT_FORBIDDEN',
        'PROTOTYPE_GLOBAL_SELECTOR_FORBIDDEN',
      ]),
    );
  });

  it('marks prototype runtime isolation red lines as high fidelity upgrades', () => {
    const result = validatePreviewFileWrite(
      'demos/home/prototype.html',
      '<button onclick="alert(1)">提交</button>',
    );

    expect(result).toMatchObject({
      ok: false,
      prototypeGate: {
        decision: 'upgrade_to_high_fidelity',
      },
    });
    expect(result?.prototypeGate?.reasonCodes).toContain('PROTOTYPE_INLINE_EVENT_FORBIDDEN');
  });

  it('formats upgrade instructions for prototype gate failures', () => {
    const result = validatePreviewFileWrite(
      'demos/home/prototype.html',
      '<button onclick="alert(1)">提交</button>',
    );
    const instruction = formatRuntimeValidationInstruction(result);

    expect(instruction).toContain('Prototype gate decision: upgrade_to_high_fidelity.');
    expect(instruction).toContain('demos/home/index.tsx');
    expect(instruction).toContain('Tell the user briefly why');
  });

  describe('config.schema.json 复合类型检查', () => {
    const validSchema = JSON.stringify({
      type: 'object',
      $demo: { previewSize: { width: 375, height: 812 } },
      properties: {
        title: { type: 'string', title: '标题' },
        count: { type: 'number', title: '数量' },
      },
    });

    it('纯标量类型原型页可接受', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        validSchema,
        'prototype-html-css',
      );
      expect(result?.ok).toBe(true);
    });

    it('未知 runtimeType 按原型页保守处理，检查复合类型', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        JSON.stringify({
          type: 'object',
          $demo: { previewSize: { width: 375, height: 812 } },
          properties: {
            modules: { type: 'array', title: '模块列表', items: { type: 'object', properties: {} } },
          },
        }),
      );
      expect(result?.ok).toBe(false);
      expect(result?.prototypeGate?.decision).toBe('upgrade_to_high_fidelity');
      expect(result?.prototypeGate?.reasonCodes).toContain('PROTOTYPE_CONFIG_TYPE_UNSUPPORTED');
    });

    it('array 类型触发 upgrade', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        JSON.stringify({
          type: 'object',
          $demo: { previewSize: { width: 375, height: 812 } },
          properties: {
            modules: { type: 'array', title: '模块列表', items: { type: 'object', properties: {} } },
          },
        }),
        'prototype-html-css',
      );
      expect(result?.ok).toBe(false);
      expect(result?.prototypeGate?.decision).toBe('upgrade_to_high_fidelity');
    });

    it('high-fidelity-react 跳过复合类型检查', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        JSON.stringify({
          type: 'object',
          $demo: { previewSize: { width: 375, height: 812 } },
          properties: {
            modules: { type: 'array', title: '模块列表', items: { type: 'object', properties: {} } },
          },
        }),
        'high-fidelity-react',
      );
      expect(result?.ok).toBe(true);
    });

    it('imageList 触发 upgrade', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        JSON.stringify({
          type: 'object',
          $demo: { previewSize: { width: 375, height: 812 } },
          properties: {
            images: { type: 'imageList', title: '图片列表' },
          },
        }),
        'prototype-html-css',
      );
      expect(result?.ok).toBe(false);
      expect(result?.prototypeGate?.decision).toBe('upgrade_to_high_fidelity');
    });

    it('type:position 触发 upgrade', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        JSON.stringify({
          type: 'object',
          $demo: { previewSize: { width: 375, height: 812 } },
          properties: {
            logo: { type: 'position', title: 'Logo 位置', key: 'logo', size: { width: 100, height: 50 } },
          },
        }),
        'prototype-html-css',
      );
      expect(result?.ok).toBe(false);
      expect(result?.prototypeGate?.decision).toBe('upgrade_to_high_fidelity');
    });

    it('不合法 JSON 不触发复合类型检查（返回 INVALID_JSON）', () => {
      const result = validatePreviewFileWrite(
        'demos/home/config.schema.json',
        'not json',
        'prototype-html-css',
      );
      expect(result?.ok).toBe(false);
      expect(result?.issues[0]?.code).toBe('INVALID_JSON');
      expect(result?.prototypeGate).toBeUndefined();
    });
  });
});
