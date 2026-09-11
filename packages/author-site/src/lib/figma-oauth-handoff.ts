import crypto from "crypto";

import type { FigmaExternalAuthCredential } from "@workbench/shared";

import { getDb } from "@/lib/db";
import {
  decryptExternalAuthCredential,
  encryptExternalAuthCredential,
} from "@/lib/external-auth";

const HANDOFF_ISSUER = "oneflow-figma-oauth";
const OAUTH_STATE_AUDIENCE = "figma-oauth-callback";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const LOGIN_HANDOFF_TTL_MS = 60 * 1000;
const TARGET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;

interface SignedPayload extends Record<string, unknown> {
  version: 1;
  issuer: typeof HANDOFF_ISSUER;
  audience: string;
  issuedAt: number;
  expiresAt: number;
}

export interface FigmaOAuthStateClaims {
  targetId: string;
  userId: string;
  sessionId?: string;
  nonce: string;
}

export interface FigmaOAuthHandoffInput extends FigmaOAuthStateClaims {
  credential: FigmaExternalAuthCredential;
  accountLabel?: string;
}

export interface RedeemedFigmaOAuthHandoff {
  targetId: string;
  userId: string;
  sessionId?: string;
  credential: FigmaExternalAuthCredential;
  accountLabel?: string;
  expiresAt?: number;
}

interface StoredFigmaOAuthHandoff {
  ticket_hash: string;
  target_id: string;
  user_id: string;
  session_id?: string;
  nonce: string;
  account_label?: string;
  expires_at: number;
  credential_encrypted: string;
  created_at: number;
  consumed_at?: number;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function isWildcardHost(hostname: string): boolean {
  return hostname === "0.0.0.0" || hostname === "::" || hostname === "[::]";
}

function parseBrowserOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid http or https origin`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    isWildcardHost(url.hostname)
  ) {
    throw new Error(`${label} must be a browser-reachable http or https origin`);
  }
  return url.origin;
}

function readHandoffSecret(): Uint8Array {
  const secret = readEnv("FIGMA_OAUTH_HANDOFF_SECRET");
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("FIGMA_OAUTH_HANDOFF_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(secret);
}

export function getFigmaOAuthHandoffSecret(): string {
  readHandoffSecret();
  return readEnv("FIGMA_OAUTH_HANDOFF_SECRET") as string;
}

export function getFigmaOAuthTargetId(): string {
  const targetId = readEnv("FIGMA_OAUTH_TARGET_ID");
  if (!targetId || !TARGET_ID_PATTERN.test(targetId)) {
    throw new Error(
      "FIGMA_OAUTH_TARGET_ID must use lowercase letters, numbers, hyphens, or underscores",
    );
  }
  return targetId;
}

function readRedirectUri(): string {
  const redirectUri = readEnv("FIGMA_OAUTH_REDIRECT_URI");
  if (!redirectUri) {
    throw new Error("FIGMA_OAUTH_REDIRECT_URI is not configured");
  }
  try {
    const url = new URL(redirectUri);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      isWildcardHost(url.hostname)
    ) {
      throw new Error("invalid redirect URI");
    }
  } catch {
    throw new Error("FIGMA_OAUTH_REDIRECT_URI must be a valid http or https URL");
  }
  return redirectUri;
}

function parseTargetOrigins(): Record<string, string> {
  const raw = readEnv("FIGMA_OAUTH_TARGETS_JSON");
  if (!raw) {
    throw new Error("FIGMA_OAUTH_TARGETS_JSON is not configured");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("FIGMA_OAUTH_TARGETS_JSON must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("FIGMA_OAUTH_TARGETS_JSON must be a JSON object");
  }

  const targets: Record<string, string> = {};
  for (const [targetId, value] of Object.entries(parsed)) {
    if (!TARGET_ID_PATTERN.test(targetId) || typeof value !== "string") {
      throw new Error("Figma OAuth target entries are invalid");
    }
    targets[targetId] = parseBrowserOrigin(
      value,
      `Figma OAuth target ${targetId}`,
    );
  }
  return targets;
}

function signPayload(
  payload: { audience: string } & Record<string, unknown>,
  ttlSeconds: number,
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const body: SignedPayload = {
    ...payload,
    version: 1,
    issuer: HANDOFF_ISSUER,
    audience: payload.audience,
    issuedAt,
    expiresAt: issuedAt + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", readHandoffSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySignedPayload(token: string, audience: string): SignedPayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid Figma OAuth signature");
  }
  const [encoded, receivedSignature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", readHandoffSecret())
    .update(encoded)
    .digest();
  const receivedBuffer = Buffer.from(receivedSignature, "base64url");
  if (
    expectedSignature.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedSignature, receivedBuffer)
  ) {
    throw new Error("Invalid Figma OAuth signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid Figma OAuth payload");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid Figma OAuth payload");
  }
  const record = payload as Record<string, unknown>;
  const now = Math.floor(Date.now() / 1000);
  if (
    record.version !== 1 ||
    record.issuer !== HANDOFF_ISSUER ||
    record.audience !== audience ||
    typeof record.issuedAt !== "number" ||
    typeof record.expiresAt !== "number" ||
    record.issuedAt > now + 5 ||
    record.expiresAt < now - 5
  ) {
    throw new Error("Figma OAuth payload is invalid or expired");
  }
  return record as SignedPayload;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseOAuthStateClaims(payload: Record<string, unknown>): FigmaOAuthStateClaims {
  if (payload.kind !== "oauth_state") {
    throw new Error("Invalid Figma OAuth state kind");
  }
  const targetId = normalizeString(payload.targetId);
  const userId = normalizeString(payload.userId);
  const sessionId = normalizeString(payload.sessionId);
  const nonce = normalizeString(payload.nonce);
  if (
    !targetId ||
    !TARGET_ID_PATTERN.test(targetId) ||
    !userId ||
    !nonce
  ) {
    throw new Error("Invalid Figma OAuth state payload");
  }
  return { targetId, userId, sessionId, nonce };
}

export function isFigmaOAuthHandoffConfigured(): boolean {
  const targetId = readEnv("FIGMA_OAUTH_TARGET_ID");
  const secret = readEnv("FIGMA_OAUTH_HANDOFF_SECRET");
  const redirectUri = readEnv("FIGMA_OAUTH_REDIRECT_URI");
  return Boolean(
    targetId &&
      TARGET_ID_PATTERN.test(targetId) &&
      secret &&
      Buffer.byteLength(secret, "utf8") >= 32 &&
      redirectUri,
  );
}

export async function createFigmaOAuthState(input: {
  userId: string;
  sessionId?: string;
}): Promise<{ state: string; nonce: string; targetId: string }> {
  const targetId = getFigmaOAuthTargetId();
  const nonce = crypto.randomBytes(32).toString("base64url");
  const state = signPayload(
    {
      audience: OAUTH_STATE_AUDIENCE,
      kind: "oauth_state",
      targetId,
      userId: input.userId,
      sessionId: input.sessionId,
      nonce,
    },
    OAUTH_STATE_TTL_SECONDS,
  );
  return { state, nonce, targetId };
}

export async function verifyFigmaOAuthState(
  state: string,
): Promise<FigmaOAuthStateClaims> {
  return parseOAuthStateClaims(
    verifySignedPayload(state, OAUTH_STATE_AUDIENCE),
  );
}

export function resolveFigmaOAuthTargetOrigin(targetId: string): string {
  const target = parseTargetOrigins()[targetId];
  if (!target) {
    throw new Error(`Figma OAuth target ${targetId} is not allowlisted`);
  }
  return target;
}

export function getFigmaOAuthCallbackOrigin(): string {
  return new URL(readRedirectUri()).origin;
}

export function getFigmaOAuthPostAuthOrigin(): string {
  const configuredOrigin = readEnv("FIGMA_OAUTH_POST_AUTH_ORIGIN");
  if (configuredOrigin) {
    return parseBrowserOrigin(
      configuredOrigin,
      "FIGMA_OAUTH_POST_AUTH_ORIGIN",
    );
  }
  return getFigmaOAuthCallbackOrigin();
}

function hashTicket(ticket: string): string {
  return crypto.createHash("sha256").update(ticket, "utf8").digest("hex");
}

export function createFigmaOAuthHandoff(input: FigmaOAuthHandoffInput): string {
  const now = Date.now();
  const ticket = crypto.randomBytes(32).toString("base64url");
  const expiresAt = now + LOGIN_HANDOFF_TTL_MS;
  const db = getDb();
  db.prepare(
    "DELETE FROM figma_oauth_handoffs WHERE expires_at <= ? OR consumed_at IS NOT NULL",
  ).run(now);
  db.prepare(
    `INSERT INTO figma_oauth_handoffs
      (ticket_hash, target_id, user_id, session_id, nonce, account_label, expires_at, credential_encrypted, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    hashTicket(ticket),
    input.targetId,
    input.userId,
    input.sessionId ?? null,
    input.nonce,
    input.accountLabel ?? null,
    expiresAt,
    encryptExternalAuthCredential(input.credential),
    now,
  );
  return ticket;
}

export function redeemFigmaOAuthHandoff(input: {
  ticket: string;
  targetId: string;
  nonce: string;
}): RedeemedFigmaOAuthHandoff {
  const now = Date.now();
  const ticketHash = hashTicket(input.ticket);
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM figma_oauth_handoffs WHERE ticket_hash = ?")
    .get(ticketHash) as StoredFigmaOAuthHandoff | undefined;
  if (
    !row ||
    row.target_id !== input.targetId ||
    row.nonce !== input.nonce ||
    row.expires_at <= now ||
    row.consumed_at
  ) {
    throw new Error("Figma OAuth handoff is invalid, expired, or already used");
  }

  const updated = db
    .prepare(
      `UPDATE figma_oauth_handoffs
       SET consumed_at = ?
       WHERE ticket_hash = ? AND target_id = ? AND nonce = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .run(now, ticketHash, input.targetId, input.nonce, now);
  if (updated.changes !== 1) {
    throw new Error("Figma OAuth handoff is invalid, expired, or already used");
  }

  const credential = decryptExternalAuthCredential(
    row.credential_encrypted,
  ) as FigmaExternalAuthCredential;

  return {
    targetId: row.target_id,
    userId: row.user_id,
    sessionId: row.session_id || undefined,
    accountLabel: row.account_label || undefined,
    expiresAt: credential.expiresAt,
    credential,
  };
}
