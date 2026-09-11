import { DEFAULT_CDN_BASE_URL } from '@workbench/runtime-config/topology';

const CDN_BASE_URL = process.env.CDN_BASE_URL || DEFAULT_CDN_BASE_URL;

export function getCdnBaseUrl(): string {
  return CDN_BASE_URL;
}
