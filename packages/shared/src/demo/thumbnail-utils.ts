import type { ThumbnailMeta, ThumbnailHashInput } from "./thumbnail-types";
import { THUMBNAIL_GENERATOR_VERSION } from "./thumbnail-types";

export function computeThumbnailHash(input: ThumbnailHashInput): string {
  const normalized = JSON.stringify({
    codeHash: input.codeHash,
    configHash: input.configHash,
    previewSize: input.previewSize || {},
    generatorVersion: input.generatorVersion,
  });
  return simpleHash(normalized);
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function computeCodeHash(code: string): string {
  return simpleHash(code);
}

export function computeConfigHash(config: Record<string, unknown>): string {
  return simpleHash(JSON.stringify(config));
}

export function shouldRegenerateThumbnail(
  existingHash: string | undefined,
  code: string,
  config: Record<string, unknown>,
): boolean {
  if (!existingHash) return true;

  const newHash = computeThumbnailHash({
    codeHash: computeCodeHash(code),
    configHash: computeConfigHash(config),
    generatorVersion: THUMBNAIL_GENERATOR_VERSION,
  });

  return newHash !== existingHash;
}

export function isThumbnailReady(meta: ThumbnailMeta | undefined): boolean {
  if (!meta) return false;
  return meta.confidence >= 0.4 && meta.blocks.length >= 3;
}
