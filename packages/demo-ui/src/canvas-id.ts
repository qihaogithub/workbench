/**
 * Creates an identifier for a canvas object in both secure and insecure
 * browser contexts. `crypto.randomUUID()` is unavailable on HTTP origins,
 * including the LAN URL used by the local Docker deployment.
 */
export function createCanvasId(
  prefix: string,
  separator = "-",
  randomUUID: () => string | undefined = () =>
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : undefined,
): string {
  const uuid =
    randomUUID() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}${separator}${uuid}`;
}
