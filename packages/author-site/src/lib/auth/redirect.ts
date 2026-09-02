export const DEFAULT_AUTH_REDIRECT = "/workbench";

/**
 * Keep post-auth navigation inside the current author-site origin.
 *
 * The value normally comes from a query string, so it is already decoded by
 * URLSearchParams. We still reject protocol-relative URLs, backslashes and
 * control characters before handing it to the client router.
 */
export function getSafeRedirectPath(
  value: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT,
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  if (value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) {
    return fallback;
  }

  return value;
}
