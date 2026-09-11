import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getSafeRedirectPath } from "@/lib/auth/redirect";
import type { DingtalkLoginProfile } from "@/lib/dingtalk-login";

const HANDOFF_ISSUER = "oneflow-dingtalk-login";
const OAUTH_STATE_AUDIENCE = "dingtalk-oauth-callback";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const LOGIN_HANDOFF_TTL_SECONDS = 60;
const TARGET_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;

interface SignedPayload extends Record<string, unknown> {
  version: 1;
  issuer: typeof HANDOFF_ISSUER;
  audience: string;
  issuedAt: number;
  expiresAt: number;
}

interface OAuthStateClaims {
  targetId: string;
  redirectPath: string;
  nonce: string;
}

interface SafeDingtalkLoginProfile {
  corpId: string;
  dingtalkUserId: string;
  unionId?: string;
  name?: string;
  avatar?: string;
}

export interface DingtalkLoginHandoffClaims extends OAuthStateClaims {
  profile: SafeDingtalkLoginProfile;
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function readTargetId(): string {
  const targetId = readEnv("DINGTALK_LOGIN_TARGET_ID");
  if (!targetId || !TARGET_ID_PATTERN.test(targetId)) {
    throw new Error(
      "DINGTALK_LOGIN_TARGET_ID must use lowercase letters, numbers, hyphens, or underscores",
    );
  }
  return targetId;
}

function readHandoffSecret(): Uint8Array {
  const secret = readEnv("DINGTALK_LOGIN_HANDOFF_SECRET");
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("DINGTALK_LOGIN_HANDOFF_SECRET must be at least 32 bytes");
  }
  return new TextEncoder().encode(secret);
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
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", readHandoffSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifySignedPayload(token: string, audience: string): SignedPayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid DingTalk login signature");
  }
  const [encoded, receivedSignature] = parts;
  const expectedSignature = createHmac("sha256", readHandoffSecret())
    .update(encoded)
    .digest();
  const receivedBuffer = Buffer.from(receivedSignature, "base64url");
  if (
    expectedSignature.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedSignature, receivedBuffer)
  ) {
    throw new Error("Invalid DingTalk login signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid DingTalk login payload");
  }
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid DingTalk login payload");
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
    throw new Error("DingTalk login payload is invalid or expired");
  }
  return record as SignedPayload;
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseOAuthStateClaims(
  payload: Record<string, unknown>,
): OAuthStateClaims {
  if (payload.kind !== "oauth_state") {
    throw new Error("Invalid DingTalk OAuth state kind");
  }
  const targetId = normalizeString(payload.targetId);
  const redirectPath = normalizeString(payload.redirectPath);
  const nonce = normalizeString(payload.nonce);
  if (
    !targetId ||
    !TARGET_ID_PATTERN.test(targetId) ||
    !redirectPath ||
    !nonce
  ) {
    throw new Error("Invalid DingTalk OAuth state payload");
  }
  return {
    targetId,
    redirectPath: getSafeRedirectPath(redirectPath),
    nonce,
  };
}

function parseProfile(value: unknown): SafeDingtalkLoginProfile {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid DingTalk login handoff profile");
  }
  const record = value as Record<string, unknown>;
  const corpId = normalizeString(record.corpId);
  const dingtalkUserId = normalizeString(record.dingtalkUserId);
  if (!corpId || !dingtalkUserId) {
    throw new Error("Invalid DingTalk login handoff profile");
  }
  return {
    corpId,
    dingtalkUserId,
    unionId: normalizeString(record.unionId),
    name: normalizeString(record.name),
    avatar: normalizeString(record.avatar),
  };
}

function parseTargetOrigins(): Record<string, string> {
  const raw = readEnv("DINGTALK_LOGIN_TARGETS_JSON");
  if (!raw) {
    throw new Error("DINGTALK_LOGIN_TARGETS_JSON is not configured");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("DINGTALK_LOGIN_TARGETS_JSON must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DINGTALK_LOGIN_TARGETS_JSON must be a JSON object");
  }

  const targets: Record<string, string> = {};
  for (const [targetId, value] of Object.entries(parsed)) {
    if (!TARGET_ID_PATTERN.test(targetId) || typeof value !== "string") {
      throw new Error("DingTalk login target entries are invalid");
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`DingTalk login target ${targetId} must be a valid URL`);
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        `DingTalk login target ${targetId} must be an http or https origin`,
      );
    }
    targets[targetId] = url.origin;
  }
  return targets;
}

export function isDingtalkLoginHandoffConfigured(): boolean {
  const targetId = readEnv("DINGTALK_LOGIN_TARGET_ID");
  const secret = readEnv("DINGTALK_LOGIN_HANDOFF_SECRET");
  return Boolean(
    targetId &&
      TARGET_ID_PATTERN.test(targetId) &&
      secret &&
      Buffer.byteLength(secret, "utf8") >= 32,
  );
}

export async function createDingtalkOAuthState(
  redirectPath: string | null | undefined,
): Promise<{ state: string; nonce: string; targetId: string }> {
  const targetId = readTargetId();
  const nonce = randomBytes(32).toString("base64url");
  const state = signPayload(
    {
      audience: OAUTH_STATE_AUDIENCE,
      kind: "oauth_state",
      targetId,
      redirectPath: getSafeRedirectPath(redirectPath),
      nonce,
    },
    OAUTH_STATE_TTL_SECONDS,
  );

  return { state, nonce, targetId };
}

export async function verifyDingtalkOAuthState(
  state: string,
): Promise<OAuthStateClaims> {
  return parseOAuthStateClaims(
    verifySignedPayload(state, OAUTH_STATE_AUDIENCE),
  );
}

export async function createDingtalkLoginHandoff(
  state: OAuthStateClaims,
  profile: DingtalkLoginProfile,
): Promise<string> {
  return signPayload(
    {
      audience: `dingtalk-login-target:${state.targetId}`,
      kind: "login_handoff",
      targetId: state.targetId,
      redirectPath: state.redirectPath,
      nonce: state.nonce,
      profile: {
        corpId: profile.corpId,
        dingtalkUserId: profile.dingtalkUserId,
        unionId: profile.unionId,
        name: profile.name,
        avatar: profile.avatar,
      },
    },
    LOGIN_HANDOFF_TTL_SECONDS,
  );
}

export async function verifyDingtalkLoginHandoff(
  token: string,
  expectedTargetId = readTargetId(),
): Promise<DingtalkLoginHandoffClaims> {
  if (!TARGET_ID_PATTERN.test(expectedTargetId)) {
    throw new Error("Invalid DingTalk login target id");
  }
  const payload = verifySignedPayload(
    token,
    `dingtalk-login-target:${expectedTargetId}`,
  );
  if (payload.kind !== "login_handoff") {
    throw new Error("Invalid DingTalk login handoff kind");
  }
  const targetId = normalizeString(payload.targetId);
  const redirectPath = normalizeString(payload.redirectPath);
  const nonce = normalizeString(payload.nonce);
  if (targetId !== expectedTargetId || !redirectPath || !nonce) {
    throw new Error("Invalid DingTalk login handoff payload");
  }
  return {
    targetId,
    redirectPath: getSafeRedirectPath(redirectPath),
    nonce,
    profile: parseProfile(payload.profile),
  };
}

export function resolveDingtalkLoginTargetOrigin(targetId: string): string {
  const target = parseTargetOrigins()[targetId];
  if (!target) {
    throw new Error(`DingTalk login target ${targetId} is not allowlisted`);
  }
  return target;
}
