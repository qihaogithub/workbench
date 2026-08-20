export interface OriginPermission {
  origin: string;
  pattern: string;
}

/**
 * Returns Chrome's narrowest host-permission pattern for a web URL.
 *
 * Match patterns cannot include ports, so the browser can only grant a
 * scheme-and-host permission (which covers every port of that host). Keep the
 * full origin separately for reporting; never silently broaden the scheme or
 * hostname.
 */
export function permissionForUrl(urlValue: string): OriginPermission | undefined {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return { origin: url.origin, pattern: `${url.protocol}//${url.hostname}/*` };
  } catch {
    return undefined;
  }
}

export function permissionRequestForUrl(urlValue: string): { origins: string[] } | undefined {
  const permission = permissionForUrl(urlValue);
  return permission ? { origins: [permission.pattern] } : undefined;
}
