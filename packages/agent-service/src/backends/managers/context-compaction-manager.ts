export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_TOKENS = 4_096;
export const COMPACTION_RESERVE_TOKENS = 16_384;
export const CONTEXT_SAFETY_MARGIN_TOKENS = 4_096;

export interface ContextCapacity {
  contextWindow?: number;
  maxTokens?: number;
}

export interface ContextCompactionDecision {
  estimatedTokens: number;
  thresholdTokens: number;
  contextWindow: number;
  maxTokens: number;
  shouldCompact: boolean;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback;
}

/**
 * Keep enough space for the model response, Pi Core's compaction summary, and
 * provider-side token accounting drift. The resulting default threshold is
 * 103,424 tokens for a 128k/4k model, rather than waiting for a provider 400.
 */
export function decideContextCompaction(
  estimatedTokens: number,
  capacity: ContextCapacity,
): ContextCompactionDecision {
  const contextWindow = positiveInteger(
    capacity.contextWindow,
    DEFAULT_CONTEXT_WINDOW,
  );
  const maxTokens = positiveInteger(capacity.maxTokens, DEFAULT_MAX_TOKENS);
  const thresholdTokens = Math.max(
    1,
    contextWindow - maxTokens - COMPACTION_RESERVE_TOKENS - CONTEXT_SAFETY_MARGIN_TOKENS,
  );

  return {
    estimatedTokens: Math.max(0, Math.ceil(estimatedTokens)),
    thresholdTokens,
    contextWindow,
    maxTokens,
    shouldCompact: estimatedTokens >= thresholdTokens,
  };
}

/** Conservative text estimate for the pending user input, which is not in the session yet. */
export function estimatePendingPromptTokens(text: string, imageCount = 0): number {
  return Math.ceil(text.length / 4) + imageCount * 1_200;
}
