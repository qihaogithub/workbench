interface RuntimeValidationSummary {
  ok?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Keeps the model-facing mutation state short while leaving the complete
 * receipt and validation details in the structured tool result.
 */
export function formatAuthorityCommitSummary(
  receipt: unknown,
  runtimeValidation?: RuntimeValidationSummary | null,
): string {
  if (
    !isRecord(receipt) ||
    receipt.committed !== true ||
    typeof receipt.revision !== "number" ||
    !Number.isFinite(receipt.revision) ||
    typeof receipt.rootHash !== "string" ||
    receipt.rootHash.length === 0
  ) {
    return "";
  }

  const runtimeValidationStatus = runtimeValidation == null
    ? "not_applicable"
    : runtimeValidation.ok === true
      ? "ok"
      : runtimeValidation.ok === false
        ? "failed"
        : "not_applicable";

  return `\nAuthority committed: revision=${receipt.revision}; runtimeValidation=${runtimeValidationStatus}; previewProjection=not_verified.`;
}
