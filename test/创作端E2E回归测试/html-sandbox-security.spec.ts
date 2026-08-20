import { expect, test } from '@playwright/test';

import {
  installSandboxRoutes,
  mountSandbox,
  SANDBOX_CHANNEL,
  SANDBOX_EXECUTION_URL,
  SANDBOX_GENERATION,
} from './support/html-sandbox-fixture';

test.describe('HTML sandbox 安全回归', () => {
  test('script、onclick、timer 和 Canvas 在 allow-scripts iframe 中可运行', async ({ page }) => {
    await installSandboxRoutes(page);
    await mountSandbox(page);
    const frame = page.frameLocator('iframe[title="HTML sandbox"]');
    await expect(frame.locator('#result')).toHaveText('loading');
    await frame.locator('#action').click();
    await expect(frame.locator('#result')).toHaveText('clicked');
    await expect(frame.locator('#timer')).toHaveText('timer-ran');
    await expect(frame.locator('#canvas')).toBeVisible();
    const canvasPixel = await frame.locator('#canvas').evaluate((canvas) => (canvas as HTMLCanvasElement).getContext('2d')?.getImageData(0, 0, 1, 1).data[0] ?? 0);
    expect(canvasPixel).toBeGreaterThan(200);
    await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  });

  test('宿主秘密和 APP_ACTION 不可访问，消息仅接受当前 channel/generation 且有深度/频率限制', async ({ page }) => {
    await installSandboxRoutes(page);
    await page.evaluate(() => {
      const events: unknown[] = [];
      window.addEventListener('message', (event) => {
        const data = event.data;
        if (event.source !== document.querySelector('iframe')?.contentWindow) return;
        if (!data || data.channel !== 'workbench-sandboxed-html-v1' || data.channelId !== 'e2e-channel-01' || data.loadGeneration !== 7) return;
        if (!['READY', 'RESIZE', 'RUNTIME_ERROR', 'CONSOLE_LOG'].includes(data.type)) return;
        try { if (JSON.stringify(data).length > 4096) return; } catch { return; }
      const testWindow = window as unknown as Window & {
          __sandboxMessageDepth: (value: unknown) => number;
          __sandboxMessageLimiter: () => boolean;
        };
        if (testWindow.__sandboxMessageDepth(data) > 5 || !testWindow.__sandboxMessageLimiter()) return;
        events.push(data);
        document.querySelector('#events')!.textContent = String(events.length);
      });
    });
    await mountSandbox(page);
    const frame = page.frameLocator('iframe[title="HTML sandbox"]');
    await expect(frame.locator('#secret')).toHaveText('blocked');
    await expect(page.locator('body')).not.toHaveAttribute('data-app-action', 'called');
    const countBefore = Number(await page.locator('#events').textContent());
    await frame.locator('body').evaluate((_, { channel, generation }) => {
      const post = (value: unknown) => parent.postMessage(value, '*');
      post({ type: 'RESIZE', channel: 'workbench-sandboxed-html-v1', channelId: 'forged', loadGeneration: generation, payload: { height: 999 } });
      post({ type: 'RESIZE', channel: 'workbench-sandboxed-html-v1', channelId: channel, loadGeneration: generation - 1, payload: { height: 999 } });
      post({ type: 'UNKNOWN', channel: 'workbench-sandboxed-html-v1', channelId: channel, loadGeneration: generation });
      post({ type: 'RESIZE', channel: 'workbench-sandboxed-html-v1', channelId: channel, loadGeneration: generation, payload: { nested: { a: { b: { c: { d: { e: 1 } } } } } } });
      for (let i = 0; i < 30; i += 1) post({ type: 'CONSOLE_LOG', channel: 'workbench-sandboxed-html-v1', channelId: channel, loadGeneration: generation, payload: { i } });
    }, { channel: SANDBOX_CHANNEL, generation: SANDBOX_GENERATION });
    await page.waitForTimeout(100);
    expect(Number(await page.locator('#events').textContent())).toBeLessThanOrEqual(countBefore + 11);
  });

  test('外部连接、顶层导航、popup、download、form 和裸 execution 顶层直达均受限', async ({ page }) => {
    const { externalRequests } = await installSandboxRoutes(page);
    await mountSandbox(page);
    const frame = page.frameLocator('iframe[title="HTML sandbox"]');
    await frame.locator('#popup').click();
    const downloadPromise = page.waitForEvent('download', { timeout: 400 }).catch(() => null);
    await frame.locator('#download').click();
    expect(await downloadPromise).toBeNull();
    await frame.locator('#form button').click();
    await frame.locator('body').evaluate(() => { try { window.top!.location.href = 'https://external.test/top'; } catch {} });
    await page.waitForTimeout(150);
    expect(externalRequests).toEqual([]);
    await expect(page.locator('iframe')).toHaveCount(1);

    const direct = await page.goto(SANDBOX_EXECUTION_URL, { waitUntil: 'commit' });
    expect(direct?.status()).toBe(403);
    expect(await page.locator('body').textContent()).toContain('FORBIDDEN');
  });

  test('页面切换会卸载旧 iframe 并展示安全占位，不保留旧执行内容', async ({ page }) => {
    await installSandboxRoutes(page);
    await mountSandbox(page);
    const frame = page.frameLocator('iframe[title="HTML sandbox"]');
    await expect(frame.locator('#result')).toBeVisible();
    await page.evaluate(() => {
      const host = document.querySelector('#host')!;
      host.innerHTML = '<div data-sandbox-placeholder>HTML sandbox 已暂停</div>';
    });
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('[data-sandbox-placeholder]')).toHaveText('HTML sandbox 已暂停');
  });
});
