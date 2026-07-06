/**
 * 内部配置同步路由
 *
 * 用途：author-site 管理后台修改 backendProviders 后，调用此端点推送到 agent-service
 * 鉴权：X-Internal-Token header（与 .env INTERNAL_API_TOKEN 匹配）
 *
 * 端点：
 * - POST /internal/backend-providers  设置完整配置
 * - GET  /internal/backend-providers  获取当前配置（用于调试/验证）
 */

import { createHash } from "crypto";
import { execFile, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

import { getBackendProvidersManager } from "../config/backend-providers";
import { getSessionModelConfigs } from "../config/session-model-configs";
import { getSessionExternalAuthConfigs } from "../config/session-external-auth";
import {
  getSystemKnowledgeSnapshot,
  setSystemKnowledgeSnapshot,
  validateSystemKnowledgeSnapshot,
} from "../config/system-knowledge";
import { getAgentManager } from "../core/agent-manager";
import { logger } from "../utils/logger";
import type {
  BackendProvidersConfig,
  ExternalAuthSessionConfig,
} from "@workbench/shared/contracts";

const TOKEN_HEADER = "x-internal-token";
const execFileAsync = promisify(execFile);

function getDwsConfigRoot(): string {
  return path.join(process.env.DATA_DIR || path.join(process.cwd(), "data"), "dws-auth");
}

function getDwsConfigDir(userId: string): string {
  const idHash = createHash("sha256").update(userId).digest("hex").slice(0, 32);
  return path.join(getDwsConfigRoot(), idHash);
}

function getRecordValue(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

export function parseDwsStatusOutput(stdout: string): {
  connected: boolean;
  accountLabel?: string;
} {
  let body: unknown = null;
  try {
    body = JSON.parse(stdout) as unknown;
  } catch {
    body = null;
  }

  const data = getRecordValue(body, "data");
  const nestedBody = getRecordValue(body, "body");
  const candidates = [body, data, nestedBody];
  for (const candidate of candidates) {
    const authenticated = getRecordValue(candidate, "authenticated");
    if (typeof authenticated === "boolean") {
      return {
        connected: authenticated,
        accountLabel:
          (getRecordValue(candidate, "userName") as string | undefined) ||
          (getRecordValue(candidate, "name") as string | undefined) ||
          (getRecordValue(candidate, "nick") as string | undefined),
      };
    }

    const loggedIn = getRecordValue(candidate, "loggedIn");
    if (typeof loggedIn === "boolean") {
      return {
        connected: loggedIn,
        accountLabel:
          (getRecordValue(candidate, "userName") as string | undefined) ||
          (getRecordValue(candidate, "name") as string | undefined) ||
          (getRecordValue(candidate, "nick") as string | undefined),
      };
    }
  }

  const status = candidates
    .map((candidate) => getRecordValue(candidate, "status"))
    .find((value): value is string => typeof value === "string")
    ?.toLowerCase();
  if (status) {
    return {
      connected: ["authenticated", "logged_in", "connected", "login"].includes(status),
      accountLabel:
        (getRecordValue(data, "userName") as string | undefined) ||
        (getRecordValue(data, "name") as string | undefined) ||
        (getRecordValue(nestedBody, "userName") as string | undefined) ||
        (getRecordValue(nestedBody, "name") as string | undefined),
    };
  }

  if (body === null) {
    const text = stdout.toLowerCase();
    const negative = text.includes("未登录") || text.includes("not logged in");
    const positive =
      text.includes("已登录") ||
      text.includes("登录成功") ||
      text.includes("logged in");
    return { connected: positive && !negative };
  }

  return { connected: false };
}

export function parseDwsAccessProbeOutput(stdout: string): boolean {
  let body: unknown = null;
  try {
    body = JSON.parse(stdout) as unknown;
  } catch {
    body = null;
  }

  if (getRecordValue(body, "success") === true) {
    return true;
  }

  const nodes = getRecordValue(body, "nodes");
  if (Array.isArray(nodes)) {
    return true;
  }

  const data = getRecordValue(body, "data");
  if (getRecordValue(data, "success") === true) {
    return true;
  }

  const dataNodes = getRecordValue(data, "nodes");
  return Array.isArray(dataNodes);
}

async function verifyDwsAccess(configDir: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "dws",
      ["doc", "list", "--format", "json", "--timeout", "10"],
      {
        env: { ...process.env, DWS_CONFIG_DIR: configDir },
        timeout: 15_000,
        maxBuffer: 512 * 1024,
      },
    );
    return parseDwsAccessProbeOutput(stdout);
  } catch {
    return false;
  }
}

async function readDwsStatus(configDir: string): Promise<{
  connected: boolean;
  accountLabel?: string;
}> {
  try {
    const { stdout } = await execFileAsync("dws", ["auth", "status", "--format", "json"], {
      env: { ...process.env, DWS_CONFIG_DIR: configDir },
      timeout: 10_000,
      maxBuffer: 512 * 1024,
    });
    const status = parseDwsStatusOutput(stdout);
    if (status.connected) {
      return status;
    }

    return {
      connected: await verifyDwsAccess(configDir),
      accountLabel: status.accountLabel,
    };
  } catch {
    return { connected: await verifyDwsAccess(configDir) };
  }
}

export function parseDwsDeviceOutput(output: string): {
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
} {
  let parsed: any = null;
  try {
    parsed = JSON.parse(output);
  } catch {
    parsed = null;
  }
  const body = parsed?.data || parsed?.body || parsed?.result || parsed || {};
  const authUrl =
    body.authUrl ||
    body.auth_url ||
    body.url ||
    body.deviceUrl ||
    body.device_url ||
    body.verificationUriComplete ||
    body.verification_uri_complete;
  const verificationUrl =
    body.verificationUrl ||
    body.verification_url ||
    body.verificationUri ||
    body.verification_uri ||
    body.authUrl ||
    body.auth_url ||
    body.url;
  const userCode =
    body.userCode ||
    body.user_code ||
    body.deviceCode ||
    body.device_code ||
    body.code;
  if (authUrl || verificationUrl || userCode) {
    return {
      authUrl,
      verificationUrl,
      userCode,
    };
  }

  const url = output.match(/https?:\/\/[^\s"'<>]+/);
  const code =
    output.match(/user[_ -]?code["':\s]+([A-Z0-9-]+)/i) ||
    output.match(/设备码[：:\s]+([A-Z0-9-]+)/);
  return {
    authUrl: url?.[0],
    verificationUrl: url?.[0],
    userCode: code?.[1],
  };
}

async function startDwsDeviceLogin(userId: string): Promise<{
  configDir: string;
  connected: boolean;
  accountLabel?: string;
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}> {
  const configDir = getDwsConfigDir(userId);
  fs.mkdirSync(configDir, { recursive: true });

  const current = await readDwsStatus(configDir);
  if (current.connected) {
    return { configDir, connected: true, accountLabel: current.accountLabel };
  }

  const child = spawn("dws", ["auth", "login", "--device", "--format", "json"], {
    env: { ...process.env, DWS_CONFIG_DIR: configDir },
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  let output = "";
  child.stdout?.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.on("error", (error) => {
    logger.warn({ error: error.message }, "dws device login failed to start");
  });
  child.on("exit", (code) => {
    logger.info({ code, configDir }, "dws device login finished");
  });

  await new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const parsed = parseDwsDeviceOutput(output);
      if (
        parsed.authUrl ||
        parsed.verificationUrl ||
        parsed.userCode ||
        Date.now() - startedAt >= 8000
      ) {
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
  return {
    configDir,
    connected: false,
    ...parseDwsDeviceOutput(output),
  };
}

function checkToken(request: FastifyRequest, reply: FastifyReply): boolean {
  const expected =
    process.env.INTERNAL_API_TOKEN ||
    (process.env.NODE_ENV === "production" ? "" : "dev-internal-token");
  if (!expected) {
    reply.code(503).send({
      success: false,
      error: {
        code: "INTERNAL_TOKEN_NOT_SET",
        message: "agent-service 未配置 INTERNAL_API_TOKEN，拒绝内部请求",
      },
    });
    return false;
  }

  const provided = request.headers[TOKEN_HEADER];
  if (provided !== expected) {
    reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "内部接口鉴权失败",
      },
    });
    return false;
  }
  return true;
}

export async function registerInternalConfigRoutes(fastify: FastifyInstance) {
  /**
   * 设置完整配置（author-site 推送）
   */
  fastify.post(
    "/internal/backend-providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkToken(request, reply)) return;

      const body = request.body as Partial<BackendProvidersConfig> | null;
      if (!body || !Array.isArray(body.providers)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "请求体必须包含 providers 数组",
          },
        });
      }

      // 字段校验
      const errors: string[] = [];
      for (let i = 0; i < body.providers.length; i++) {
        const p = body.providers[i];
        if (!p.id) errors.push(`providers[${i}].id 必填`);
        if (!p.baseURL) errors.push(`providers[${i}].baseURL 必填`);
        if (!Array.isArray(p.models)) errors.push(`providers[${i}].models 必须是数组`);
      }
      if (errors.length > 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.join("; "),
          },
        });
      }

      const config: BackendProvidersConfig = {
        providers: body.providers,
        activeProviderId: body.activeProviderId,
        activeModelId: body.activeModelId,
        multimodalModels: body.multimodalModels,
      };

      getBackendProvidersManager().setConfig(config);

      logger.info(
        {
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
        "BackendProviders config pushed from author-site",
      );

      return reply.send({
        success: true,
        data: {
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
      });
    },
  );

  fastify.post(
    "/internal/sessions/:sessionId/model-config",
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkToken(request, reply)) return;

      const body = request.body as Partial<BackendProvidersConfig> | null;
      if (!body || !Array.isArray(body.providers)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "请求体必须包含 providers 数组",
          },
        });
      }

      const errors: string[] = [];
      for (let i = 0; i < body.providers.length; i++) {
        const provider = body.providers[i];
        if (!provider.id) errors.push(`providers[${i}].id 必填`);
        if (!provider.baseURL) errors.push(`providers[${i}].baseURL 必填`);
        if (!Array.isArray(provider.models)) {
          errors.push(`providers[${i}].models 必须是数组`);
        }
      }
      if (errors.length > 0) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: errors.join("; "),
          },
        });
      }

      const config: BackendProvidersConfig = {
        providers: body.providers,
        activeProviderId: body.activeProviderId,
        activeModelId: body.activeModelId,
        multimodalModels: body.multimodalModels,
      };

      getSessionModelConfigs().set(request.params.sessionId, config);
      const existingAgent = getAgentManager().get(request.params.sessionId);
      if (existingAgent) {
        existingAgent.updateConfig({
          ...existingAgent.getConfig(),
          backendProviders: config,
        });
      }

      logger.info(
        {
          sessionId: request.params.sessionId,
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
        "Session model config pushed from author-site",
      );

      return reply.send({
        success: true,
        data: {
          sessionId: request.params.sessionId,
          providerCount: config.providers.length,
          activeProviderId: config.activeProviderId,
        },
      });
    },
  );

  fastify.post(
    "/internal/sessions/:sessionId/external-auth",
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkToken(request, reply)) return;

      const body = request.body as ExternalAuthSessionConfig | null;
      const config: ExternalAuthSessionConfig =
        body && typeof body === "object" ? body : {};

      getSessionExternalAuthConfigs().set(request.params.sessionId, config);
      const existingAgent = getAgentManager().get(request.params.sessionId);
      if (existingAgent) {
        existingAgent.updateConfig({
          ...existingAgent.getConfig(),
          externalAuth: config,
        });
      }

      logger.info(
        {
          sessionId: request.params.sessionId,
          hasFigma: Boolean(config.figma?.enabled),
          hasDingtalk: Boolean(config.dingtalk?.enabled),
        },
        "Session external auth config pushed from author-site",
      );

      return reply.send({
        success: true,
        data: {
          sessionId: request.params.sessionId,
          hasFigma: Boolean(config.figma?.enabled),
          hasDingtalk: Boolean(config.dingtalk?.enabled),
        },
      });
    },
  );

  fastify.post(
    "/internal/external-auth/dingtalk/start",
    async (
      request: FastifyRequest<{ Body: { userId?: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkToken(request, reply)) return;

      const userId = request.body?.userId;
      if (!userId) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "userId 必填",
          },
        });
      }

      const result = await startDwsDeviceLogin(userId);
      return reply.send({
        success: true,
        data: {
          connected: result.connected,
          configDir: result.connected ? result.configDir : undefined,
          accountLabel: result.accountLabel,
          authUrl: result.authUrl,
          verificationUrl: result.verificationUrl,
          userCode: result.userCode,
        },
      });
    },
  );

  fastify.delete(
    "/internal/external-auth/dingtalk/:userId",
    async (
      request: FastifyRequest<{ Params: { userId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkToken(request, reply)) return;

      const configDir = getDwsConfigDir(request.params.userId);
      fs.rmSync(configDir, { recursive: true, force: true });
      return reply.send({ success: true, data: { removed: true } });
    },
  );

  fastify.get(
    "/internal/external-auth/dingtalk/:userId",
    async (
      request: FastifyRequest<{ Params: { userId: string } }>,
      reply: FastifyReply,
    ) => {
      if (!checkToken(request, reply)) return;

      const configDir = getDwsConfigDir(request.params.userId);
      const status = await readDwsStatus(configDir);
      return reply.send({
        success: true,
        data: {
          connected: status.connected,
          configDir: status.connected ? configDir : undefined,
          accountLabel: status.accountLabel,
        },
      });
    },
  );

  /**
   * 获取当前配置（用于验证推送是否成功）
   */
  fastify.get(
    "/internal/backend-providers",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkToken(request, reply)) return;

      const cfg = getBackendProvidersManager().getConfig();

      // 返回时脱敏 apiKey（仅显示长度和前缀）
      const safeProviders = cfg.providers.map((p) => ({
        ...p,
        apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}...(${p.apiKey.length})` : "",
      }));

      return reply.send({
        success: true,
        data: {
          ...cfg,
          providers: safeProviders,
        },
      });
    },
  );

  fastify.post(
    "/internal/knowledge-documents",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkToken(request, reply)) return;

      const snapshot = validateSystemKnowledgeSnapshot(request.body);
      if (!snapshot) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_BODY",
            message: "请求体必须是系统知识库快照",
          },
        });
      }

      setSystemKnowledgeSnapshot(snapshot);
      logger.info(
        {
          documentCount: snapshot.documents.length,
          version: snapshot.version,
        },
        "System knowledge snapshot pushed from author-site",
      );

      return reply.send({
        success: true,
        data: {
          documentCount: snapshot.documents.length,
          version: snapshot.version,
        },
      });
    },
  );

  fastify.get(
    "/internal/knowledge-documents",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkToken(request, reply)) return;

      const snapshot = getSystemKnowledgeSnapshot();
      return reply.send({
        success: true,
        data: {
          version: snapshot.version,
          updatedAt: snapshot.updatedAt,
          documentCount: snapshot.documents.length,
          documents: snapshot.documents.map((doc) => ({
            id: doc.id,
            title: doc.title,
            fileName: doc.fileName,
            enabled: doc.enabled,
            version: doc.version,
            updatedAt: doc.updatedAt,
          })),
        },
      });
    },
  );

  logger.info("内部配置同步路由已注册: backend-providers + knowledge-documents");
}
