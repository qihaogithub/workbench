#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultBaseUrl = 'http://localhost:3200';

function printUsage() {
  console.log(`Usage:
  pnpm test:sync-status-flap -- [options]
  node scripts/development/detect-sync-status-flap.mjs [options]

Options:
  --url <url>             Edit page URL to test.
  --project-id <id>       Project ID. Builds <base-url>/demo/<id>/edit.
  --base-url <url>        Author-site base URL. Default: ${defaultBaseUrl}
  --duration <ms>         Sampling duration. Default: 20000.
  --sample-ms <ms>        Sampling interval. Default: 500.
  --headed                Run Chromium with a visible window.
  --headless              Run Chromium headless.
  --user <username>       Login username. Default: E2E_USER or qihao.
  --password <password>   Login password. Default: E2E_PASSWORD or 130015.
  --report-dir <path>     Output directory. Default: tmp/sync-status-flap.
  --flush-only            Only run the workspace flush probe. Skips visible status assertions.
  --list-projects         List local data/projects candidates and exit.
  --help                  Show this help.

Environment variables remain supported:
  SYNC_STATUS_URL, SYNC_STATUS_BASE_URL, SYNC_STATUS_SAMPLE_MS, SYNC_STATUS_DURATION_MS,
  HEADLESS, E2E_USER, E2E_PASSWORD`);
}

function readProjects() {
  const projectsDir = path.join(repoRoot, 'data', 'projects');
  if (!fs.existsSync(projectsDir)) {
    return [];
  }

  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metaPath = path.join(projectsDir, entry.name, 'project.json');
      if (!fs.existsSync(metaPath)) return null;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const id = typeof meta.id === 'string' && meta.id ? meta.id : entry.name;
        const name = typeof meta.name === 'string' && meta.name ? meta.name : '(unnamed)';
        const updatedAt =
          typeof meta.updatedAt === 'number'
            ? meta.updatedAt
            : fs.statSync(metaPath).mtimeMs;
        const demoCount = Array.isArray(meta.demoPages) ? meta.demoPages.length : 0;
        return { id, name, updatedAt, demoCount };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function parseArgs(argv) {
  const options = {
    url: process.env.SYNC_STATUS_URL,
    projectId: undefined,
    baseUrl: process.env.SYNC_STATUS_BASE_URL ?? defaultBaseUrl,
    sampleMs: process.env.SYNC_STATUS_SAMPLE_MS ?? '500',
    durationMs: process.env.SYNC_STATUS_DURATION_MS ?? '20000',
    headless: process.env.HEADLESS !== '0',
    user: process.env.E2E_USER ?? 'qihao',
    password: process.env.E2E_PASSWORD ?? '130015',
    reportDir: path.join(repoRoot, 'tmp', 'sync-status-flap'),
    flushOnly: false,
    listProjects: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const readValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--list-projects') {
      options.listProjects = true;
    } else if (arg === '--url') {
      options.url = readValue();
    } else if (arg === '--project-id') {
      options.projectId = readValue();
    } else if (arg === '--base-url') {
      options.baseUrl = readValue();
    } else if (arg === '--duration' || arg === '--duration-ms') {
      options.durationMs = readValue();
    } else if (arg === '--sample-ms') {
      options.sampleMs = readValue();
    } else if (arg === '--headed') {
      options.headless = false;
    } else if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--user') {
      options.user = readValue();
    } else if (arg === '--password') {
      options.password = readValue();
    } else if (arg === '--report-dir') {
      const value = readValue();
      options.reportDir = path.isAbsolute(value) ? value : path.join(repoRoot, value);
    } else if (arg === '--flush-only') {
      options.flushOnly = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function toPositiveInteger(value, name) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function resolveTargetUrl(options, projects) {
  if (options.url) return options.url;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const projectId = options.projectId ?? projects[0]?.id ?? 'proj_1782286923644';
  return `${baseUrl}/demo/${encodeURIComponent(projectId)}/edit`;
}

let cliOptions;
try {
  cliOptions = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(2);
}

if (cliOptions.help) {
  printUsage();
  process.exit(0);
}

const localProjects = readProjects();

if (cliOptions.listProjects) {
  if (localProjects.length === 0) {
    console.log('No local projects found under data/projects.');
  } else {
    for (const project of localProjects) {
      console.log(
        `${project.id}\t${project.name}\tdemos=${project.demoCount}\tupdatedAt=${project.updatedAt}`,
      );
    }
  }
  process.exit(0);
}

let sampleMs;
let durationMs;
try {
  sampleMs = toPositiveInteger(cliOptions.sampleMs, 'sampleMs');
  durationMs = toPositiveInteger(cliOptions.durationMs, 'durationMs');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

const targetUrl = resolveTargetUrl(cliOptions, localProjects);
const selectedProjectId = getProjectIdFromUrl(targetUrl);
const selectedProject = localProjects.find((project) => project.id === selectedProjectId) ?? null;
const headless = cliOptions.headless;
const e2eUser = cliOptions.user;
const e2ePassword = cliOptions.password;
const reportDir = cliOptions.reportDir;
const reportPath = path.join(reportDir, 'report.json');
const screenshotPath = path.join(reportDir, 'last-page.png');

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

function getFailureHint(report) {
  if (report.flushProbe && !report.flushProbe.ok) {
    const message = report.flushProbe.flush?.body?.error?.message ?? report.flushProbe.error ?? '';
    if (String(message).includes('WORKSPACE_NOT_FOUND')) {
      return 'Workspace is missing or its metadata cannot be resolved. Check data/workspaces and active sessions.';
    }
    if (String(message).includes('SESSION_NOT_FOUND') || String(message).includes('SESSION_EXPIRED')) {
      return 'The selected session is missing or expired. Reopen the edit page or create a new session.';
    }
    if (String(message).includes('PROJECT_NOT_FOUND')) {
      return 'The target project does not exist. Run with --list-projects or pass --project-id.';
    }
    return 'Workspace flush failed. Inspect flushProbe in the JSON report.';
  }
  if (report.flushErrorVisible) {
    return 'The page rendered 同步失败. Inspect trackedResponses and consoleEvents in the JSON report.';
  }
  const pageErrorMessages = (report.pageErrors ?? []).map((error) => error.message).join('\n');
  if (pageErrorMessages.includes('ChunkLoadError') || pageErrorMessages.includes('Loading chunk')) {
    return 'Next.js failed to load an edit-page chunk. Refresh the page or restart author-site, then rerun the script.';
  }
  if (pageErrorMessages.includes('Invalid or unexpected token')) {
    return 'The page JavaScript failed to parse. Check the dev server output and generated chunks before judging sync status.';
  }
  if (report.runtimeErrors?.length > 0 || report.pageErrors?.length > 0) {
    return 'The page produced runtime errors. Inspect runtimeErrors and pageErrors in the JSON report.';
  }
  if (report.statusMissing) {
    return 'No sync status text was sampled. Check the screenshot to confirm whether the page is still loading or the status text changed.';
  }
  if (report.summary?.flapDetected) {
    return 'The page flapped between connecting and offline. Inspect summary.transitions in the JSON report.';
  }
  return null;
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
  if (!cliOptions.flushOnly) {
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

    await sleep(sampleMs);
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
  }

  const summary = summarizeSamples(samples);
  const flushErrorVisible = !cliOptions.flushOnly && (summary.statusCounts['flush-error'] ?? 0) > 0;
  const runtimeErrors = consoleEvents.filter((event) => {
    const text = event.text.toLowerCase();
    return (
      text.includes('referenceerror') ||
      text.includes('unhandled runtime error') ||
      text.includes('the above error occurred')
    );
  });
  const statusMissing = !cliOptions.flushOnly && summary.foundStatusCount === 0;
  const hasPageErrors = pageErrors.length > 0;
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});

  report = {
    ok:
      flushProbe.ok &&
      !flushErrorVisible &&
      (cliOptions.flushOnly || !summary.flapDetected) &&
      !statusMissing &&
      (cliOptions.flushOnly || runtimeErrors.length === 0) &&
      (cliOptions.flushOnly || !hasPageErrors),
    targetUrl,
    selectedProject,
    mode: cliOptions.flushOnly ? 'flush-only' : 'status-sampling',
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
    selectedProject,
    mode: cliOptions.flushOnly ? 'flush-only' : 'status-sampling',
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
if (selectedProject) {
  console.log(`Project: ${selectedProject.id} ${selectedProject.name}`);
}
console.log(`Mode: ${report.mode}`);
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
  const hint = getFailureHint(report);
  if (hint) console.log(`Hint: ${hint}`);
  console.log('FAIL workspace flush probe failed.');
  process.exit(1);
}
if (report.flushErrorVisible) {
  const hint = getFailureHint(report);
  if (hint) console.log(`Hint: ${hint}`);
  console.log('FAIL visible sync status shows 同步失败.');
  process.exit(1);
}
if (report.statusMissing) {
  const hint = getFailureHint(report);
  if (hint) console.log(`Hint: ${hint}`);
  console.log('FAIL sync status text was not found in the rendered page.');
  if (report.runtimeErrors.length > 0) {
    console.log(`Runtime error: ${report.runtimeErrors[0].text.split('\n')[0]}`);
  }
  if (report.pageErrors.length > 0) {
    console.log(`Page error: ${report.pageErrors[0].message}`);
  }
  process.exit(1);
}
if (report.mode === 'flush-only') {
  console.log('PASS workspace flush probe passed.');
  process.exit(0);
}
if (report.runtimeErrors.length > 0) {
  const hint = getFailureHint(report);
  if (hint) console.log(`Hint: ${hint}`);
  console.log(`FAIL page has runtime errors: ${report.runtimeErrors[0].text.split('\n')[0]}`);
  process.exit(1);
}
if (report.pageErrors.length > 0) {
  const hint = getFailureHint(report);
  if (hint) console.log(`Hint: ${hint}`);
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
  const hint = getFailureHint(report);
  if (hint) console.log(`Hint: ${hint}`);
  console.log('FAIL detected sync status flapping between connecting and offline.');
  process.exit(1);
}

console.log('PASS no connecting/offline flap detected in this sampling window.');
