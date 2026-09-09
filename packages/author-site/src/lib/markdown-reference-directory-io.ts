import fs from "node:fs";
import path from "node:path";

export function isMissingReferenceFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** Missing registered resources are normal; unreadable/corrupt resources are not. */
export function referenceFile(
  workspacePath: string,
  relativePath: string,
): string | null {
  const root = fs.realpathSync(workspacePath);
  const candidate = path.resolve(root, relativePath);
  if (!candidate.startsWith(`${root}${path.sep}`))
    throw new Error("REFERENCE_DIRECTORY_UNAVAILABLE");
  try {
    const file = fs.realpathSync(candidate);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.statSync(file).isFile())
      throw new Error("REFERENCE_DIRECTORY_UNAVAILABLE");
    return file;
  } catch (error) {
    if (isMissingReferenceFile(error)) return null;
    throw error;
  }
}

export function readReferenceText(
  root: string,
  relativePath: string,
): string | null {
  const file = referenceFile(root, relativePath);
  if (!file) return null;
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (isMissingReferenceFile(error)) return null;
    throw error;
  }
}

export function readReferenceJson(
  root: string,
  relativePath: string,
): Record<string, unknown> | null {
  const text = readReferenceText(root, relativePath);
  if (text === null) return null;
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("REFERENCE_DIRECTORY_INVALID_JSON");
  return value as Record<string, unknown>;
}
