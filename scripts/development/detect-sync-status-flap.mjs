#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportDir = path.join(repoRoot, 'tmp', 'sync-status-flap');
const reportPath = path.join(reportDir, 'report.json');
const screenshotPath = path.join(reportDir, 'last-page.png');

const targetUrl =
  process.env.SYNC_STATUS_URL ??
  'http://localhost:3200/demo/proj_1782286923644/edit';
const sampleMs = Number.parseInt(process.env.SYNC_STATUS_SAMPLE_MS ?? '500', 10);
const durationMs = Number.parseInt(process.env.SYNC_STATUS_DURATION_MS ?? '20000', 10);
const headless = process.env.HEADLESS !== '0';
const e2eUser = process.env.E2E_USER ?? 'qihao';
const e2ePassword = process.env.E2E_PASSWORD ?? '130015';

const statusLabels = [
  { key: 'flush-error', labels: ['同步失败'] },
  { key: 'offline', labels: ['离线待同步', '绂荤嚎寰呭悓姝?'] },
  { key: 'connecting', labels: ['连接中', '杩炴帴涓?'] },
  { key: 'saving', labels: ['同步中', '鍚屾涓?'] },
  { key: 'synced', labels: ['草稿已实时保存', '鑽夌宸插疄鏃朵繚瀛?'] },
  { key: 'error', labels: ['协同异常', '鍗忓悓寮傚父'] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeStatus(label) {
  for (const status of statusLabels) {
    if (status.labels.some((candidate) => label.includes(candidate))) {
      return status.key;
    }
  }
  return 'unknown';
}

function getProjectIdFromUrl(urlString) {
  const url = new URL(urlString);
  const match = /^\/demo\/([^/]+)\/edit\/?$/.exec(url.pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function pickSessionWithWorkspace(sessions) {
  if (!Array.isArray(sessions)) return null;
  return sessions.find((session) => {
    return (
      session &&
      typeof session.sessionId === 'string' &&
      typeof session.workspaceId === 'string' &&
      session.workspaceId &&
      !session.isExpired
    );
  }) ?? null;
}

async function getSessionFromProjectList(page, projectId) {
  const response = await page.request.get(
    new URL(`/api/sessions/project/${encodeURIComponent(projectId)}`, targetUrl).toString(),
    { timeout: 15000 },
  );
  const body = await parseJsonResponse(response);
  return {
    ok: response.ok(),
    status: response.status(),
    body,
    session: pickSessionWithWorkspace(body?.data),
  };
}

async function createOrResumeSession(page, projectId) {
  const response = await page.request.post(
    new URL('/api/sessions', targetUrl).toString(),
    {
      data: { demoId: projectId },
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    },
  );
  const body = await parseJsonResponse(response);
  const data = body?.data;
  const session =
    data &&
    typeof data.sessionId === 'string' &&
    typeof data.workspaceId === 'string' &&
    data.workspaceId
      ? {
          sessionId: data.sessionId,
          workspaceId: data.workspaceId,
          demoId: projectId,
        }
      : null;
  return {
    ok: response.ok(),
    status: response.status(),
    body,
    session,
  };
}

async function runWorkspaceFlushProbe(page) {
  const projectId = getProjectIdFromUrl(page.url()) ?? getProjectIdFromUrl(targetUrl);
  if (!projectId) {
    return {
      ok: false,
      error: `cannot resolve project id from ${page.url()}`,
    };
  }

  const projectSessions = await getSessionFromProjectList(page, projectId).catch((error) => ({
    ok: false,
    status: null,
    body: null,
    session: null,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  }));
  let session = projectSessions.session;
  let sessionSource = 'project-session-list';
  let sessionCreate = null;

  if (!session) {
    sessionCreate = await createOrResumeSession(page, projectId);
    session = sessionCreate.session;
    sessionSource = 'create-or-resume-session';
  }

  if (!session) {
    return {
      ok: false,
      projectId,
      sessionSource,
      projectSessions,
      sessionCreate,
      error: 'no active session with workspaceId was found or created',
    };
  }

  const response = await page.request.post(
    new URL(`/api/sessions/${encodeURIComponent(session.sessionId)}/workspace-flush`, targetUrl).toString(),
    {
      data: {
        projectId,
        workspaceId: session.workspaceId,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000,
    },
  );
  const body = await parseJsonResponse(response);
  const apiSuccess = body?.success !== false;

  return {
    ok: response.ok() && apiSuccess,
    projectId,
    sessionSource,
    session: {
      sessionId: session.sessionId,
      workspaceId: session.workspaceId,
    },
    projectSessions: {
      status: projectSessions.status,
      ok: projectSessions.ok,
      sessionCount: Array.isArray(projectSessions.body?.data)
        ? projectSessions.body.data.length
        : null,
      body: projectSessions.body,
    },
    sessionCreate,
    flush: {
      status: response.status(),
      ok: response.ok(),
      body,
    },
  };
}

async function loginIfNeeded(page) {
  if (!page.url().includes('/login')) return false;

  const loginUrl = new URL('/api/auth/login', targetUrl).toString();
  const response = await page.request.post(loginUrl, {
    data: {
      username: e2eUser,
      password: e2ePassword,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
  if (!response.ok()) {
    throw new Error(
      `login failed: ${response.status()} ${await response.text()}`,
    );
  }

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(
    (url) => !url.pathname.startsWith('/login'),
    { timeout: 60000 },
  );
  return true;
}

async function readVisibleSyncStatus(page) {
  return page.evaluate((statusLabelsInPage) => {
    const labels = statusLabelsInPage.flatMap((item) => item.labels);
    const visibleCandidates = [];

    for (const element of Array.from(document.querySelectorAll('body *'))) {
      const style = window.getComputedStyle(element);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      ) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const text = element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (!text) continue;
      const matched = labels.find((label) => text.includes(label));
      if (!matched) continue;
      visibleCandidates.push({
        text,
        matched,
        tag: element.tagName.toLowerCase(),
        className:
          typeof element.className === 'string' ? element.className : '',
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    }

    visibleCandidates.sort((a, b) => {
      const textDelta = a.text.length - b.text.length;
      if (textDelta !== 0) return textDelta;
      return b.left - a.left;
    });

    return visibleCandidates[0] ?? null;
  }, statusLabels);
}

function summarizeSamples(samples) {
  const transitions = [];
  let previous = null;
  for (const sample of samples) {
    if (!sample.status || sample.status === 'unknown') continue;
    if (previous && previous.status !== sample.status) {
      transitions.push({
        atMs: sample.atMs,
        from: previous.status,
        to: sample.status,
      });
    }
    previous = sample;
  }

  const statusCounts = {};
  for (const sample of samples) {
    statusCounts[sample.status] = (statusCounts[sample.status] ?? 0) + 1;
  }
  const foundStatusCount = samples.filter(
    (sample) => !['missing', 'unknown'].includes(sample.status),
  ).length;

  const connectingOfflineTransitions = transitions.filter(
    (transition) =>
      (transition.from === 'connecting' && transition.to === 'offline') ||
      (transition.from === 'offline' && transition.to === 'connecting'),
  );

  return {
    statusCounts,
    foundStatusCount,
    transitions,
    connectingOfflineTransitions,
    flapDetected:
      statusCounts.connecting > 0 &&
      statusCounts.offline > 0 &&
      connectingOfflineTransitions.length >= 2,
  };
}

fs.mkdirSync(reportDir, { recursive: true });

const consoleEvents = [];
const pageErrors = [];
const failedRequests = [];
const websocketResponses = [];
const trackedResponses = [];

const browser = await chromium.launch({ headless });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

page.on('console', (message) => {
  if (['error', 'warning'].includes(message.type())) {
    consoleEvents.push({
      type: message.type(),
      text: message.text(),
    });
  }
});
page.on('pageerror', (error) => {
  pageErrors.push({
    name: error.name,
    message: error.message,
    stack: error.stack,
  });
});
page.on('requestfailed', (request) => {
  failedRequests.push({
    url: request.url(),
    method: request.method(),
    failure: request.failure()?.errorText,
  });
});
page.on('response', (response) => {
  const url = response.url();
  if (url.includes('/api/collab/') || url.includes('/api/agent/')) {
    websocketResponses.push({
      url,
      status: response.status(),
      requestMethod: response.request().method(),
    });
  }
  if (
    url.includes('/api/collab/') ||
    url.includes('/api/agent/') ||
    url.includes('/api/sessions/') ||
    url.includes('/api/sessions?') ||
    url.endsWith('/api/sessions')
  ) {
    trackedResponses.push({
      url,
      status: response.status(),
      requestMethod: response.request().method(),
    });
  }
});

let report;
try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  const loggedIn = await loginIfNeeded(page);
  if (loggedIn) {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const flushProbe = await runWorkspaceFlushProbe(page).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  }));

  const samples = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt <= durationMs) {
    try {
      const candidate = await readVisibleSyncStatus(page);
      const text = candidate?.matched ?? candidate?.text ?? '';
      samples.push({
        atMs: Date.now() - startedAt,
        status: text ? normalizeStatus(text) : 'missing',
        text,
        candidate,
      });
    } catch (error) {
      samples.push({
        atMs: Date.now() - startedAt,
        status: 'evaluate-error',
        text: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await sleep(sampleMs);
  }

  const summary = summarizeSamples(samples);
  const flushErrorVisible = (summary.statusCounts['flush-error'] ?? 0) > 0;
  const runtimeErrors = consoleEvents.filter((event) => {
    const text = event.text.toLowerCase();
    return (
      text.includes('referenceerror') ||
      text.includes('unhandled runtime error') ||
      text.includes('the above error occurred')
    );
  });
  const statusMissing = summary.foundStatusCount === 0;
  const hasPageErrors = pageErrors.length > 0;
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

  report = {
    ok:
      flushProbe.ok &&
      !flushErrorVisible &&
      !summary.flapDetected &&
      !statusMissing &&
      runtimeErrors.length === 0 &&
      !hasPageErrors,
    targetUrl,
    generatedAt: new Date().toISOString(),
    sampleMs,
    durationMs,
    screenshotPath: path.relative(repoRoot, screenshotPath),
    summary,
    flushProbe,
    flushErrorVisible,
    statusMissing,
    runtimeErrors: runtimeErrors.slice(-10),
    pageErrors: pageErrors.slice(-10),
    samples,
    consoleEvents: consoleEvents.slice(-50),
    pageErrors: pageErrors.slice(-10),
    failedRequests: failedRequests.slice(-50),
    websocketResponses: websocketResponses.slice(-80),
    trackedResponses: trackedResponses.slice(-120),
  };
} catch (error) {
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  report = {
    ok: false,
    targetUrl,
    generatedAt: new Date().toISOString(),
    sampleMs,
    durationMs,
    screenshotPath: path.relative(repoRoot, screenshotPath),
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    consoleEvents: consoleEvents.slice(-50),
    failedRequests: failedRequests.slice(-50),
    websocketResponses: websocketResponses.slice(-80),
    trackedResponses: trackedResponses.slice(-120),
  };
} finally {
  await browser.close();
}

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

console.log(`Sync status flap report: ${path.relative(repoRoot, reportPath)}`);
if (report.error) {
  console.log(`ERROR ${report.error.split('\n')[0]}`);
  process.exit(1);
}

const summary = report.summary;
console.log(`Target: ${targetUrl}`);
console.log(`Duration: ${durationMs}ms, sample interval: ${sampleMs}ms`);
console.log(`Status counts: ${JSON.stringify(summary.statusCounts)}`);
if (report.flushProbe) {
  console.log(`Flush probe: ${report.flushProbe.ok ? 'PASS' : 'FAIL'}`);
  if (report.flushProbe.flush) {
    console.log(
      `Flush response: ${report.flushProbe.flush.status} ${JSON.stringify(report.flushProbe.flush.body)}`,
    );
  } else if (report.flushProbe.error) {
    console.log(`Flush error: ${String(report.flushProbe.error).split('\n')[0]}`);
  }
}
if (report.flushProbe && !report.flushProbe.ok) {
  console.log('FAIL workspace flush probe failed.');
  process.exit(1);
}
if (report.flushErrorVisible) {
  console.log('FAIL visible sync status shows 同步失败.');
  process.exit(1);
}
if (report.statusMissing) {
  console.log('FAIL sync status text was not found in the rendered page.');
  if (report.runtimeErrors.length > 0) {
    console.log(`Runtime error: ${report.runtimeErrors[0].text.split('\n')[0]}`);
  }
  if (report.pageErrors.length > 0) {
    console.log(`Page error: ${report.pageErrors[0].message}`);
  }
  process.exit(1);
}
if (report.runtimeErrors.length > 0) {
  console.log(`FAIL page has runtime errors: ${report.runtimeErrors[0].text.split('\n')[0]}`);
  process.exit(1);
}
if (report.pageErrors.length > 0) {
  console.log(`FAIL page has uncaught errors: ${report.pageErrors[0].message}`);
  process.exit(1);
}
console.log(
  `Connecting/offline transitions: ${summary.connectingOfflineTransitions.length}`,
);
for (const transition of summary.connectingOfflineTransitions.slice(0, 12)) {
  console.log(`- ${transition.atMs}ms ${transition.from} -> ${transition.to}`);
}

if (summary.flapDetected) {
  console.log('FAIL detected sync status flapping between connecting and offline.');
  process.exit(1);
}

console.log('PASS no connecting/offline flap detected in this sampling window.');
