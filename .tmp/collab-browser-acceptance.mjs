import { chromium } from "@playwright/test";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import WebSocket from "ws";

globalThis.WebSocket = WebSocket;

const AUTHOR_URL = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ?? "http://localhost:3201";
const COLLAB_WS_URL = AGENT_URL.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
const USERNAME = process.env.E2E_USER ?? "qihao";
const PASSWORD = process.env.E2E_PASSWORD ?? "130015";

function encodeRoomName(resourcePath) {
  return Buffer.from(resourcePath, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function expectOk(response, label) {
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!response.ok() || body.success === false) {
    throw new Error(`${label} failed: ${response.status()} ${text}`);
  }
  return body.data;
}

async function login(context, label) {
  const response = await context.request.post(`${AUTHOR_URL}/api/auth/login`, {
    data: { username: USERNAME, password: PASSWORD },
  });
  await expectOk(response, `${label} login`);
}

async function createProject(context) {
  const name = `协同验收 ${Date.now()}`;
  const response = await context.request.post(`${AUTHOR_URL}/api/demos`, {
    data: { name, category: "验收" },
  });
  const project = await expectOk(response, "create project");
  return { id: project.id, name };
}

async function createSession(context, projectId, workspaceId) {
  const response = await context.request.post(`${AUTHOR_URL}/api/sessions`, {
    data: workspaceId ? { demoId: projectId, workspaceId } : { demoId: projectId, forceNew: true },
  });
  return await expectOk(response, "create session");
}

async function ensurePage(context, projectId, sessionId) {
  const filesResponse = await context.request.get(`${AUTHOR_URL}/api/sessions/${sessionId}/files`);
  const files = await expectOk(filesResponse, "list session files");
  const existing = files.demoPages?.[0]?.id;
  if (existing) return existing;

  const createResponse = await context.request.post(`${AUTHOR_URL}/api/projects/${projectId}/demos`, {
    data: { sessionId, name: "首页" },
  });
  const page = await expectOk(createResponse, "create page");
  return page.id;
}

async function writeInitialCode(context, sessionId, pageId) {
  const code = `import React from "react";

export default function AcceptancePage() {
  return <div data-testid="acceptance-page">collab acceptance base</div>;
}
`;
  const schema = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {}
}
`;
  const response = await context.request.put(`${AUTHOR_URL}/api/sessions/${sessionId}/files/${pageId}`, {
    data: { code, schema },
  });
  await expectOk(response, "write initial page files");
}

function openCollab({ projectId, workspaceId, sessionId, resourcePath, kind, userLabel }) {
  const doc = new Y.Doc();
  const text = doc.getText("content");
  const endpoint = `${COLLAB_WS_URL}/api/collab/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}`;
  const provider = new WebsocketProvider(endpoint, encodeRoomName(resourcePath), doc, {
    WebSocketPolyfill: WebSocket,
    params: { sessionId, resourcePath, kind },
  });
  provider.on("status", (event) => {
    console.log(`status ${userLabel} ${resourcePath}: ${event.status}`);
  });
  provider.on("connection-close", (event) => {
    console.log(`close ${userLabel} ${resourcePath}: ${event?.code ?? "unknown"} ${event?.reason ?? ""}`);
  });
  provider.on("connection-error", (event) => {
    console.log(`error ${userLabel} ${resourcePath}: ${event?.message ?? event}`);
  });
  provider.awareness.setLocalStateField("presence", {
    userId: sessionId,
    username: userLabel,
    color: userLabel === "A" ? "#2563eb" : "#059669",
    resourcePath,
    lastActiveAt: Date.now(),
  });
  return { doc, text, provider };
}

async function waitForProvider(provider, label) {
  if (provider.synced || provider.wsconnected) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      provider.off("sync", onSync);
      provider.off("status", onStatus);
      reject(new Error(`${label} did not sync in time`));
    }, 15000);
    const onSync = (synced) => {
      if (!synced) return;
      clearTimeout(timeout);
      provider.off("sync", onSync);
      provider.off("status", onStatus);
      resolve();
    };
    const onStatus = ({ status }) => {
      if (status !== "connected") return;
      clearTimeout(timeout);
      provider.off("sync", onSync);
      provider.off("status", onStatus);
      resolve();
    };
    provider.on("sync", onSync);
    provider.on("status", onStatus);
  });
}

async function waitUntil(assertion, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await assertion();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw lastError ?? new Error(`${label} timed out`);
}

async function flushResource(projectId, workspaceId, sessionId, resourcePath, kind) {
  const params = new URLSearchParams({ sessionId, resourcePath, kind });
  const response = await fetch(`${AGENT_URL}/api/collab/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/flush?${params}`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`flush ${resourcePath} failed: ${response.status()} ${await response.text()}`);
  }
}

async function readWorkspaceFile(context, sessionId, resourcePath) {
  const response = await context.request.get(`${AUTHOR_URL}/api/sessions/${sessionId}/workspace/files/${encodeURIComponent(resourcePath)}`);
  const data = await expectOk(response, `read ${resourcePath}`);
  return data.content;
}

async function verifyTextResource({ context, projectId, workspaceId, sessionA, sessionB, resourcePath, kind, marker, mutate }) {
  const a = openCollab({ projectId, workspaceId, sessionId: sessionA, resourcePath, kind, userLabel: "A" });
  const b = openCollab({ projectId, workspaceId, sessionId: sessionB, resourcePath, kind, userLabel: "B" });
  try {
    await Promise.all([
      waitForProvider(a.provider, `${resourcePath} A`),
      waitForProvider(b.provider, `${resourcePath} B`),
    ]);
    mutate(a.text, marker);
    await waitUntil(() => b.text.toString().includes(marker), `${resourcePath} remote update`);
    await flushResource(projectId, workspaceId, sessionA, resourcePath, kind);
    await waitUntil(async () => {
      const content = await readWorkspaceFile(context, sessionB, resourcePath);
      return content.includes(marker);
    }, `${resourcePath} persisted`);
  } finally {
    a.provider.destroy();
    b.provider.destroy();
    a.doc.destroy();
    b.doc.destroy();
  }
}

const browser = await chromium.launch({ headless: true });
const contextA = await browser.newContext();
const contextB = await browser.newContext();
contextA.setDefaultNavigationTimeout(90000);
contextB.setDefaultNavigationTimeout(90000);

try {
  const pageA = await contextA.newPage();
  await pageA.goto(`${AUTHOR_URL}/login`);
  await login(contextA, "A");
  await login(contextB, "B");
  await pageA.screenshot({ path: ".tmp/collab-acceptance-login.png", fullPage: true });

  const project = await createProject(contextA);
  const sessionA = await createSession(contextA, project.id);
  const pageId = await ensurePage(contextA, project.id, sessionA.sessionId);
  await writeInitialCode(contextA, sessionA.sessionId, pageId);
  const sessionB = await createSession(contextB, project.id, sessionA.workspaceId);
  console.log(JSON.stringify({
    setup: true,
    projectId: project.id,
    workspaceId: sessionA.workspaceId,
    sessionA: sessionA.sessionId,
    sessionB: sessionB.sessionId,
    pageId,
    agentUrl: AGENT_URL,
  }));

  const codeMarker = `// collab-code-${Date.now()}`;
  await verifyTextResource({
    context: contextB,
    projectId: project.id,
    workspaceId: sessionA.workspaceId,
    sessionA: sessionA.sessionId,
    sessionB: sessionB.sessionId,
    resourcePath: `demos/${pageId}/index.tsx`,
    kind: "page-code",
    marker: codeMarker,
    mutate: (text, marker) => text.insert(text.length, `\n${marker}\n`),
  });
  console.log(`PASS page-code sync and persistence: ${codeMarker}`);

  const treeMarker = `协同树-${Date.now()}`;
  await verifyTextResource({
    context: contextB,
    projectId: project.id,
    workspaceId: sessionA.workspaceId,
    sessionA: sessionA.sessionId,
    sessionB: sessionB.sessionId,
    resourcePath: "workspace-tree.json",
    kind: "workspace-tree",
    marker: treeMarker,
    mutate: (text, marker) => {
      const parsed = JSON.parse(text.toString());
      parsed.pages = parsed.pages.map((page, index) =>
        index === 0 ? { ...page, name: `${page.name}-${marker}` } : page,
      );
      text.delete(0, text.length);
      text.insert(0, JSON.stringify(parsed, null, 2));
    },
  });
  console.log(`PASS workspace-tree sync and persistence: ${treeMarker}`);

  const canvasMarker = `canvas-${Date.now()}`;
  await verifyTextResource({
    context: contextB,
    projectId: project.id,
    workspaceId: sessionA.workspaceId,
    sessionA: sessionA.sessionId,
    sessionB: sessionB.sessionId,
    resourcePath: ".canvas-layout.json",
    kind: "canvas-layout",
    marker: canvasMarker,
    mutate: (text, marker) => {
      const parsed = text.toString().trim()
        ? JSON.parse(text.toString())
        : { version: 1, projectId: project.id, state: { viewport: { x: 40, y: 40, zoom: 0.5 }, pages: {}, nodes: {}, hiddenKnowledgeDocumentIds: [] } };
      parsed.state = {
        ...(parsed.state ?? {}),
        hiddenKnowledgeDocumentIds: [marker],
      };
      text.delete(0, text.length);
      text.insert(0, JSON.stringify(parsed, null, 2));
    },
  });
  console.log(`PASS canvas-layout sync and persistence: ${canvasMarker}`);

  console.log(JSON.stringify({
    ok: true,
    projectId: project.id,
    workspaceId: sessionA.workspaceId,
    sessionA: sessionA.sessionId,
    sessionB: sessionB.sessionId,
    pageId,
    screenshots: [
      ".tmp/collab-acceptance-login.png",
    ],
  }, null, 2));
} finally {
  await contextA.close();
  await contextB.close();
  await browser.close();
}
