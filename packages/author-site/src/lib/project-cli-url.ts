export const PROJECT_CLI_FALLBACK_AUTHOR_SITE_URL = "http://localhost:3200";

type HeaderReader = Pick<Headers, "get">;

interface AuthorSiteUrlEnv {
  [key: string]: string | undefined;
  AUTHOR_SITE_URL?: string;
  NEXT_PUBLIC_AUTHOR_SITE_URL?: string;
}

function firstHeaderValue(value: string | null | undefined): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function normalizeHttpUrl(value: string | null | undefined): string | null {
  const candidate = firstHeaderValue(value);
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function normalizeHost(value: string | null | undefined): string | null {
  const host = firstHeaderValue(value);
  if (!host || /[\s/?#@\\]/.test(host)) {
    return null;
  }
  return host;
}

function normalizeProtocol(value: string | null | undefined): string | null {
  const protocol = firstHeaderValue(value)?.replace(/:$/, "").toLowerCase();
  return protocol === "http" || protocol === "https" ? protocol : null;
}

function inferProtocol(host: string): "http" | "https" {
  const normalizedHost = host.toLowerCase();
  if (
    normalizedHost.startsWith("localhost") ||
    normalizedHost.startsWith("127.") ||
    normalizedHost.startsWith("[::1]") ||
    (normalizedHost.includes(":") && !normalizedHost.endsWith(":443"))
  ) {
    return "http";
  }
  return "https";
}

function getConfiguredAuthorSiteUrl(env: AuthorSiteUrlEnv): string | null {
  return (
    normalizeHttpUrl(env.AUTHOR_SITE_URL) ??
    normalizeHttpUrl(env.NEXT_PUBLIC_AUTHOR_SITE_URL)
  );
}

export function resolveProjectCliRequestOrigin(
  requestHeaders: HeaderReader,
): string | null {
  const host =
    normalizeHost(requestHeaders.get("x-forwarded-host")) ??
    normalizeHost(requestHeaders.get("host"));

  if (!host) {
    return null;
  }

  const protocol =
    normalizeProtocol(requestHeaders.get("x-forwarded-proto")) ??
    inferProtocol(host);

  return normalizeHttpUrl(`${protocol}://${host}`);
}

export function getProjectCliAuthorSiteUrl(
  requestHeaders: HeaderReader,
  env: AuthorSiteUrlEnv = process.env,
): string {
  return (
    resolveProjectCliRequestOrigin(requestHeaders) ??
    getConfiguredAuthorSiteUrl(env) ??
    PROJECT_CLI_FALLBACK_AUTHOR_SITE_URL
  );
}
