import path from 'path';
import fs from 'fs';
import { OPENCODE_CONFIG_TEMPLATE, AGENTS_MD_TEMPLATE } from './templates/permission-config';
import {
  getDemosDir,
  getSessionsDir,
  getDemoPath,
  getSessionPath,
  demoExists,
  sessionExists,
  deleteSession,
} from './fs-utils';

const SESSION_EXPIRY_MS = 2 * 60 * 60 * 1000;

export interface CreateSessionResult {
  sessionId: string;
  code: string;
  schema: string;
}

export function createEditSession(demoId: string): CreateSessionResult {
  if (!demoExists(demoId)) {
    throw new Error(`Demo "${demoId}" 不存在`);
  }

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  const demoPath = getDemoPath(demoId);
  const sessionPath = getSessionPath(sessionId);

  fs.cpSync(demoPath, sessionPath, { recursive: true });

  const opencodeConfigPath = path.join(sessionPath, 'opencode.json');
  fs.writeFileSync(opencodeConfigPath, JSON.stringify(OPENCODE_CONFIG_TEMPLATE, null, 2), 'utf-8');

  const agentsMdPath = path.join(sessionPath, 'AGENTS.md');
  if (!fs.existsSync(agentsMdPath)) {
    fs.writeFileSync(agentsMdPath, AGENTS_MD_TEMPLATE, 'utf-8');
  }

  const sessionMeta = {
    sessionId,
    demoId,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_EXPIRY_MS,
  };
  fs.writeFileSync(
    path.join(sessionPath, '.session.json'),
    JSON.stringify(sessionMeta, null, 2),
    'utf-8'
  );

  const codePath = path.join(sessionPath, 'index.tsx');
  const schemaPath = path.join(sessionPath, 'config.schema.json');

  return {
    sessionId,
    code: fs.readFileSync(codePath, 'utf-8'),
    schema: fs.readFileSync(schemaPath, 'utf-8'),
  };
}

export function getEditSession(sessionId: string) {
  if (!sessionExists(sessionId)) {
    return null;
  }

  const metaPath = path.join(getSessionPath(sessionId), '.session.json');
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  const codePath = path.join(getSessionPath(sessionId), 'index.tsx');
  const schemaPath = path.join(getSessionPath(sessionId), 'config.schema.json');

  return {
    sessionId: meta.sessionId,
    demoId: meta.demoId,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    code: fs.existsSync(codePath) ? fs.readFileSync(codePath, 'utf-8') : '',
    schema: fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '',
  };
}

export function saveEditSession(sessionId: string): boolean {
  const sessionMeta = getEditSession(sessionId);
  if (!sessionMeta) {
    return false;
  }

  const { demoId } = sessionMeta;
  const sessionPath = getSessionPath(sessionId);
  const demoPath = getDemoPath(demoId);

  fs.rmSync(demoPath, { recursive: true, force: true });
  fs.cpSync(sessionPath, demoPath, { recursive: true });

  const metaInDemo = path.join(demoPath, '.session.json');
  if (fs.existsSync(metaInDemo)) {
    fs.rmSync(metaInDemo, { force: true });
  }

  const opencodeConfig = path.join(demoPath, 'opencode.json');
  if (fs.existsSync(opencodeConfig)) {
    fs.rmSync(opencodeConfig, { force: true });
  }

  deleteSession(sessionId);
  return true;
}

export function dropEditSession(sessionId: string): boolean {
  return deleteSession(sessionId);
}

export function cleanupExpiredSessions(): string[] {
  const sessionsDir = getSessionsDir();
  if (!fs.existsSync(sessionsDir)) {
    return [];
  }

  const cleaned: string[] = [];
  const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(sessionsDir, entry.name, '.session.json');
    if (!fs.existsSync(metaPath)) continue;

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (Date.now() > meta.expiresAt) {
        fs.rmSync(path.join(sessionsDir, entry.name), { recursive: true, force: true });
        cleaned.push(entry.name);
      }
    } catch {
      continue;
    }
  }

  return cleaned;
}
