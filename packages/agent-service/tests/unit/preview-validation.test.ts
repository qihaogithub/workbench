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
});
