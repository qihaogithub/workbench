import { expect, type Page, type Route } from '@playwright/test';

export const SANDBOX_ORIGIN = 'https://html-sandbox.test';
export const HOST_ORIGIN = 'https://author.test';
export const SANDBOX_CHANNEL = 'e2e-channel-01';
export const SANDBOX_GENERATION = 7;
export const SANDBOX_EXECUTION_URL = `${SANDBOX_ORIGIN}/api/html-sandbox/executions/0123456789abcdef0123456789abcdef#workbenchGeneration=${SANDBOX_GENERATION}`;

export const SANDBOX_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><style>body{margin:0;font:16px sans-serif}</style></head>
<body>
  <button id="action" onclick="document.querySelector('#result').textContent='clicked'">Click</button>
  <button id="popup" onclick="window.open('https://external.test/popup')">Popup</button>
  <a id="download" download="secret.txt" href="data:text/plain,secret">Download</a>
  <form id="form" action="https://external.test/form" method="post"><button>Submit</button></form>
  <canvas id="canvas" width="32" height="32"></canvas>
  <div id="result">loading</div><div id="secret"></div><div id="timer"></div>
  <script>
    const send = (type, payload = {}) => parent.postMessage({
      channel: 'workbench-sandboxed-html-v1', channelId: '${SANDBOX_CHANNEL}',
      loadGeneration: ${SANDBOX_GENERATION}, type, payload
    }, '*');
    window.__hostSecretResult = (() => {
      try { return parent.__HOST_SECRET ? 'leaked' : 'blocked'; } catch { return 'blocked'; }
    })();
    document.querySelector('#secret').textContent = window.__hostSecretResult;
    setTimeout(() => document.querySelector('#timer').textContent = 'timer-ran', 80);
    const canvas = document.querySelector('#canvas');
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 32, 32);
    fetch('https://external.test/connect').catch(() => {});
    send('READY'); send('RESIZE', { width: 320, height: 240 });
  </script>
</body></html>`;

export async function installSandboxRoutes(page: Page): Promise<{ externalRequests: string[] }> {
  const externalRequests: string[] = [];
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = request.url();
    if (url === `${HOST_ORIGIN}/`) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<div id="host"></div><div id="events"></div><script>
          window.__HOST_SECRET = 'host-only-secret';
          window.APP_ACTION = () => { document.body.dataset.appAction = 'called'; };
          let messageWindowStart = Date.now(), messageCount = 0;
          const valueDepth = (value, depth = 0) => {
            if (!value || typeof value !== 'object') return depth;
            if (depth >= 5) return depth + 1;
            return Math.max(depth + 1, ...Object.values(value).map((item) => valueDepth(item, depth + 1)));
          };
          window.__sandboxMessageDepth = valueDepth;
          window.__sandboxMessageLimiter = () => {
            const now = Date.now();
            if (now - messageWindowStart >= 1000) { messageWindowStart = now; messageCount = 0; }
            if (messageCount >= 10) return false;
            messageCount += 1;
            return true;
          };
        </script>`,
      });
      return;
    }
    if (url.startsWith(`${SANDBOX_ORIGIN}/api/html-sandbox/executions/`)) {
      if (request.frame() === page.mainFrame()) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          headers: { 'cache-control': 'no-store' },
          body: JSON.stringify({ success: false, error: { code: 'FORBIDDEN' } }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        headers: {
          'content-security-policy': `default-src 'none'; script-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors ${HOST_ORIGIN};`,
          'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), clipboard-read=(), clipboard-write=()',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        },
        body: SANDBOX_HTML,
      });
      return;
    }
    if (url.startsWith('https://external.test/')) {
      externalRequests.push(url);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  await page.goto(`${HOST_ORIGIN}/`);
  return { externalRequests };
}

export async function mountSandbox(page: Page): Promise<void> {
  await page.evaluate(({ url }) => {
    const host = document.querySelector('#host');
    if (!host) throw new Error('host fixture missing');
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.title = 'HTML sandbox';
    iframe.sandbox.value = 'allow-scripts';
    iframe.referrerPolicy = 'no-referrer';
    iframe.allow = '';
    iframe.dataset.sandboxChannel = 'e2e-channel-01';
    iframe.dataset.loadGeneration = '7';
    host.appendChild(iframe);
  }, { url: SANDBOX_EXECUTION_URL });
  await expect(page.locator('iframe[title="HTML sandbox"]')).toHaveCount(1);
}
