const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encodeText = (value: string): Uint8Array => encoder.encode(value);
export const decodeText = (value: Uint8Array): string => decoder.decode(value);

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function decodeDataUrl(value: string): { mediaType: string; bytes: Uint8Array } | undefined {
  const match = /^data:([^,]*?),(.*)$/s.exec(value);
  if (!match) return undefined;
  const meta = match[1];
  const payload = match[2];
  const base64 = /(?:^|;)base64(?:;|$)/i.test(meta);
  const mediaType = meta.split(";")[0] || "text/plain";
  try {
    if (base64) {
      const binary = atob(payload.replace(/\s/g, ""));
      return { mediaType, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
    }
    return { mediaType, bytes: encodeText(decodeURIComponent(payload)) };
  } catch {
    return undefined;
  }
}
