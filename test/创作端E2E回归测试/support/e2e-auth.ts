import type { Page } from '@playwright/test';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export async function loginE2EUser(
  page: Page,
  credentials: { baseURL: string; username: string; password: string },
): Promise<void> {
  await page.goto(`${credentials.baseURL}/login`, { waitUntil: 'domcontentloaded' });
  if (!page.url().includes('/login')) return;

  await page.waitForLoadState('networkidle');
  await page.locator('#username').fill(credentials.username);
  await page.locator('#password').fill(credentials.password);

  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/login') &&
      response.request().method() === 'POST',
    { timeout: 15000 },
  );
  await page.getByRole('button', { name: /^登录$/ }).click();

  const response = await loginResponsePromise;
  const body = (await response.json()) as ApiEnvelope<unknown>;

  if (!response.ok() || !body.success) {
    throw new Error(`E2E login failed: ${JSON.stringify(body)}`);
  }

  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15000,
  });
}
