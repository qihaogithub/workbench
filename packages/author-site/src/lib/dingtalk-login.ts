export interface DingtalkLoginConfig {
  enabled: boolean;
  corpId?: string;
  appKey?: string;
  appSecret?: string;
  authUrl?: string;
  oapiBaseUrl: string;
  apiBaseUrl: string;
}

export interface SafeDingtalkLoginConfig {
  enabled: boolean;
  corpId?: string;
  authUrl?: string;
  message?: string;
}

export interface DingtalkLoginProfile {
  corpId: string;
  dingtalkUserId: string;
  unionId?: string;
  name?: string;
  avatar?: string;
  raw: unknown;
}

interface AccessTokenCache {
  token: string;
  expiresAt: number;
}

let appAccessTokenCache: AccessTokenCache | null = null;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function readDingtalkLoginConfig(): DingtalkLoginConfig {
  const corpId = readEnv("DINGTALK_CORP_ID");
  const appKey = readEnv("DINGTALK_APP_KEY");
  const appSecret = readEnv("DINGTALK_APP_SECRET");
  const authUrl = readEnv("DINGTALK_LOGIN_AUTH_URL");
  const enabled =
    readEnv("DINGTALK_LOGIN_ENABLED") === "true" ||
    Boolean(corpId && appKey && appSecret);

  return {
    enabled,
    corpId,
    appKey,
    appSecret,
    authUrl,
    oapiBaseUrl: readEnv("DINGTALK_OAPI_BASE_URL") || "https://oapi.dingtalk.com",
    apiBaseUrl: readEnv("DINGTALK_API_BASE_URL") || "https://api.dingtalk.com",
  };
}

export function readSafeDingtalkLoginConfig(): SafeDingtalkLoginConfig {
  const config = readDingtalkLoginConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      message: "DingTalk enterprise login is not configured",
    };
  }

  if (!config.corpId || !config.appKey || !config.appSecret) {
    return {
      enabled: false,
      corpId: config.corpId,
      authUrl: config.authUrl,
      message: "DingTalk enterprise login is missing corpId, appKey, or appSecret",
    };
  }

  return {
    enabled: true,
    corpId: config.corpId,
    authUrl: config.authUrl,
  };
}

function readString(value: unknown, keys: string[]): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return undefined;
}

async function requestAppAccessToken(config: DingtalkLoginConfig): Promise<{
  token: string;
  expiresIn?: number;
}> {
  const modernResponse = await fetch(`${config.apiBaseUrl}/v1.0/oauth2/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: config.appKey,
      appSecret: config.appSecret,
    }),
  });

  if (modernResponse.ok) {
    const body = await modernResponse.json() as Record<string, unknown>;
    const token = readString(body, ["accessToken", "access_token"]);
    if (token) {
      return {
        token,
        expiresIn:
          typeof body.expireIn === "number"
            ? body.expireIn
            : typeof body.expiresIn === "number"
              ? body.expiresIn
              : undefined,
      };
    }
  }

  const legacyUrl = new URL("/gettoken", config.oapiBaseUrl);
  legacyUrl.searchParams.set("appkey", config.appKey || "");
  legacyUrl.searchParams.set("appsecret", config.appSecret || "");
  const legacyResponse = await fetch(legacyUrl.toString());
  const legacyBody = await legacyResponse.json() as Record<string, unknown>;
  const token = readString(legacyBody, ["access_token", "accessToken"]);
  if (!legacyResponse.ok || !token) {
    throw new Error(
      typeof legacyBody.errmsg === "string"
        ? legacyBody.errmsg
        : "Failed to obtain DingTalk app access token",
    );
  }

  return {
    token,
    expiresIn:
      typeof legacyBody.expires_in === "number"
        ? legacyBody.expires_in
        : undefined,
  };
}

export async function getDingtalkAppAccessToken(): Promise<string> {
  const config = readDingtalkLoginConfig();
  if (!config.enabled || !config.corpId || !config.appKey || !config.appSecret) {
    throw new Error("DingTalk enterprise login is not configured");
  }

  if (appAccessTokenCache && appAccessTokenCache.expiresAt > Date.now() + 60_000) {
    return appAccessTokenCache.token;
  }

  const result = await requestAppAccessToken(config);
  appAccessTokenCache = {
    token: result.token,
    expiresAt: Date.now() + (result.expiresIn ?? 7200) * 1000,
  };
  return result.token;
}

async function fetchDingtalkUserBaseInfo(
  config: DingtalkLoginConfig,
  accessToken: string,
  authCode: string,
): Promise<Record<string, unknown>> {
  const url = new URL("/topapi/v2/user/getuserinfo", config.oapiBaseUrl);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: authCode }),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.errcode !== 0) {
    throw new Error(
      typeof body.errmsg === "string"
        ? body.errmsg
        : "Failed to exchange DingTalk auth code",
    );
  }

  const result = body.result;
  if (typeof result !== "object" || result === null) {
    throw new Error("DingTalk auth code response is missing result");
  }
  return result as Record<string, unknown>;
}

async function fetchDingtalkUserDetail(
  config: DingtalkLoginConfig,
  accessToken: string,
  dingtalkUserId: string,
): Promise<Record<string, unknown>> {
  const url = new URL("/topapi/v2/user/get", config.oapiBaseUrl);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userid: dingtalkUserId, language: "zh_CN" }),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.errcode !== 0) {
    return {};
  }

  const result = body.result;
  return typeof result === "object" && result !== null
    ? result as Record<string, unknown>
    : {};
}

export async function exchangeDingtalkAuthCode(
  authCode: string,
): Promise<DingtalkLoginProfile> {
  const config = readDingtalkLoginConfig();
  if (!config.enabled || !config.corpId || !config.appKey || !config.appSecret) {
    throw new Error("DingTalk enterprise login is not configured");
  }

  const accessToken = await getDingtalkAppAccessToken();
  const baseInfo = await fetchDingtalkUserBaseInfo(config, accessToken, authCode);
  const dingtalkUserId = readString(baseInfo, ["userid", "userId"]);
  if (!dingtalkUserId) {
    throw new Error("DingTalk auth response is missing userId");
  }

  const detail = await fetchDingtalkUserDetail(config, accessToken, dingtalkUserId);
  const unionId =
    readString(detail, ["unionid", "unionId"]) ||
    readString(baseInfo, ["unionid", "unionId"]);

  return {
    corpId: config.corpId,
    dingtalkUserId,
    unionId,
    name: readString(detail, ["name"]) || readString(baseInfo, ["name"]),
    avatar: readString(detail, ["avatar"]) || readString(baseInfo, ["avatar"]),
    raw: { baseInfo, detail },
  };
}

export function clearDingtalkLoginTokenCache(): void {
  appAccessTokenCache = null;
}
