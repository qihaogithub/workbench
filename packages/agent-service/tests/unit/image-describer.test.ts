import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImageDescriber,
  ImageDescriptionError,
} from '../../src/services/image-describer';

describe('ImageDescriber', () => {
  const image = {
    data: Buffer.from('image-data').toString('base64'),
    mimeType: 'image/png',
    name: 'screen.png',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IMAGE_DESCRIPTION_ENABLED;
    delete process.env.IMAGE_DESCRIPTION_MODEL;
    delete process.env.IMAGE_DESCRIPTION_TIMEOUT;
    delete process.env.IMAGE_DESCRIPTION_MAX_CACHE;
    delete process.env.IMAGE_DESCRIPTION_PROMPT;
  });

  it('未启用时应抛出配置错误', async () => {
    const describeWithVision = vi.fn();
    const describer = new ImageDescriber({ enabled: false }, describeWithVision);

    await expect(describer.describe([image])).rejects.toMatchObject({
      name: 'ImageDescriptionError',
      code: 'IMAGE_DESCRIPTION_DISABLED',
    } satisfies Partial<ImageDescriptionError>);
    expect(describeWithVision).not.toHaveBeenCalled();
  });

  it('启用时即使未显式配置识图模型也应调用 vision 描述函数（由上层回退到主模型）', async () => {
    const describeWithVision = vi.fn().mockResolvedValue('一个 UI 截图');
    const describer = new ImageDescriber(
      { enabled: true, visionModelId: '' },
      describeWithVision,
    );

    await expect(describer.describe([image])).resolves.toBe('一个 UI 截图');
    expect(describeWithVision).toHaveBeenCalledWith(
      expect.objectContaining({
        image,
        modelId: '',
      }),
    );
  });

  it('应调用 vision 描述函数并格式化结果', async () => {
    const describeWithVision = vi.fn().mockResolvedValue('一个登录表单截图');
    const describer = new ImageDescriber(
      { enabled: true, visionModelId: 'custom/gpt-4o-mini' },
      describeWithVision,
    );

    await expect(describer.describe([image])).resolves.toBe('一个登录表单截图');
    expect(describeWithVision).toHaveBeenCalledWith(
      expect.objectContaining({
        image,
        modelId: 'custom/gpt-4o-mini',
      }),
    );
  });

  it('相同图片应命中缓存', async () => {
    const describeWithVision = vi.fn().mockResolvedValue('缓存描述');
    const describer = new ImageDescriber(
      { enabled: true, visionModelId: 'custom/gpt-4o-mini' },
      describeWithVision,
    );

    await describer.describe([image]);
    await expect(describer.describe([image])).resolves.toBe('缓存描述');

    expect(describeWithVision).toHaveBeenCalledTimes(1);
    expect(describer.getCacheStats()).toMatchObject({
      size: 1,
      hitCount: 1,
      missCount: 1,
    });
  });

  it('vision 调用失败时应降级为图片元数据描述', async () => {
    const describeWithVision = vi.fn().mockRejectedValue(new Error('timeout'));
    const describer = new ImageDescriber(
      { enabled: true, visionModelId: 'custom/gpt-4o-mini' },
      describeWithVision,
    );

    await expect(describer.describe([image])).resolves.toBe(
      '[图片：screen.png，格式：image/png]',
    );
  });
});
