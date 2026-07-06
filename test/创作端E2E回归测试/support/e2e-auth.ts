import Database from 'better-sqlite3';
import { SignJWT } from 'jose';
import fs from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseLoginResponse(responseText: string): Promise<ApiEnvelope<unknown>> {
  try {
    return JSON.parse(responseText) as ApiEnvelope<unknown>;
  } catch {
    throw new Error(`E2E login returned non-JSON: ${responseText.slice(0, 240)}`);
  }
}

function isNonJsonLoginError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('E2E login returned non-JSON:');
}

function findE2EUserId(username: string): string {
  const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  const db = new Database(path.join(dataDir, 'users.db'), { readonly: true });
  try {
    const row = db.prepare('select id from users where username = ?').get(username) as
      | { id: string }
      | undefined;
    if (!row) {
      throw new Error(`E2E auth fallback could not find user ${username}`);
    }
    return row.id;
  } finally {
    db.close();
  }
}

function readLocalJwtSecret(): string | null {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return null;

  const jwtSecretLine = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith('JWT_SECRET='));
  if (!jwtSecretLine) return null;

  return jwtSecretLine.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
}

async function createE2EAuthToken(credentials: {
  username: string;
  userId: string;
}): Promise<string> {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || readLocalJwtSecret() || 'change-me-in-production',
  );
  return new SignJWT({ userId: credentials.userId, username: credentials.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

async function installAuthCookie(
  page: Page,
  credentials: { baseURL: string; username: string },
): Promise<string> {
  const userId = findE2EUserId(credentials.username);
  const token = await createE2EAuthToken({ username: credentials.username, userId });
  const cookieURL = new URL(credentials.baseURL);
  await page.context().addCookies([
    {
      name: 'auth_token',
      value: token,
      domain: cookieURL.hostname,
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
  ]);
  return token;
}

async function waitForLoginPageReady(page: Page, baseURL: string): Promise<void> {
  let lastText = '';
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await page.request.get(`${baseURL}/login`);
    lastText = await response.text();
    if (
      response.ok() &&
      lastText.includes('<html') &&
      !lastText.includes('missing required error components')
    ) {
      return;
    }
    await sleep(2000);
  }
  throw new Error(`E2E login page did not become ready: ${lastText.slice(0, 240)}`);
}

export async function loginE2EUser(
  page: Page,
  credentials: { baseURL: string; username: string; password: string },
): Promise<string> {
  await waitForLoginPageReady(page, credentials.baseURL);

  if (process.env.E2E_AUTH_COOKIE_ONLY !== 'false') {
    return installAuthCookie(page, credentials);
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const response = await page.request.post(`${credentials.baseURL}/api/auth/login`, {
      data: {
        username: credentials.username,
        password: credentials.password,
      },
    });
    const text = await response.text();
    try {
      const body = await parseLoginResponse(text);
      if (!response.ok() || !body.success) {
        throw new Error(`E2E login failed: ${JSON.stringify(body)}`);
      }
      return installAuthCookie(page, credentials);
    } catch (error) {
      lastError = error;
      if (attempt === 30) break;
      await sleep(2000);
    }
  }

  if (isNonJsonLoginError(lastError)) {
    return installAuthCookie(page, credentials);
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
