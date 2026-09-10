/**
 * Validate a user-facing workspace identifier before it is used as one
 * filesystem path segment. Unicode is intentional: page ids are persisted
 * directory names and must round-trip unchanged across all workspace APIs.
 */
export interface WorkspacePathSegmentValidation {
  ok: boolean;
  code?: "EMPTY" | "DOT_SEGMENT" | "SEPARATOR" | "CONTROL" | "UNPAIRED_SURROGATE";
}

export function validateWorkspacePathSegment(
  value: string,
): WorkspacePathSegmentValidation {
  if (!value) return { ok: false, code: "EMPTY" };
  if (value === "." || value === "..") return { ok: false, code: "DOT_SEGMENT" };
  if (/[\\/]/.test(value)) return { ok: false, code: "SEPARATOR" };

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) {
      return { ok: false, code: "CONTROL" };
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isInteger(next) || next < 0xdc00 || next > 0xdfff) {
        return { ok: false, code: "UNPAIRED_SURROGATE" };
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return { ok: false, code: "UNPAIRED_SURROGATE" };
    }
  }
  return { ok: true };
}

export function isValidWorkspacePathSegment(value: string): boolean {
  return validateWorkspacePathSegment(value).ok;
}
