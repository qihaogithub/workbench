const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://esm.sh';

export function getCdnBaseUrl(): string {
  return CDN_BASE_URL;
}
