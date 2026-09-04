import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import readline from "node:readline";

export interface JsonlRetentionResult {
  filePath: string;
  removedLines: number;
  keptLines: number;
  removedFile: boolean;
}

export type JsonlRetentionTransform = (record: unknown) => string | undefined;

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function recordTimestamp(
  value: unknown,
  timestampKeys: readonly string[],
): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of timestampKeys) {
    const timestamp = parseTimestamp(record[key]);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

async function closeWriteStream(stream: fs.WriteStream): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.once("error", reject);
    stream.once("finish", resolve);
    stream.end();
  });
}

/**
 * Rewrites one JSONL log while preserving malformed/unknown-timestamp lines.
 * An optional transform can compact retained records without loading the file
 * into memory. This intentionally uses a stream because Authority journals
 * can be large.
 */
export async function pruneJsonlFile(
  filePath: string,
  cutoffAt: number,
  timestampKeys: readonly string[],
  transformRecord?: JsonlRetentionTransform,
): Promise<JsonlRetentionResult> {
  const result: JsonlRetentionResult = {
    filePath,
    removedLines: 0,
    keptLines: 0,
    removedFile: false,
  };
  if (!fs.existsSync(filePath)) return result;

  const initialStat = await fs.promises.stat(filePath).catch(() => null);
  if (!initialStat) return result;
  const tempPath = `${filePath}.retention-${process.pid}-${Date.now()}`;
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const output = fs.createWriteStream(tempPath, {
    encoding: "utf8",
    mode: initialStat.mode & 0o777,
  });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let rewritten = false;

  try {
    for await (const line of lines) {
      let shouldRemove = false;
      let outputLine = line;
      try {
        const parsed = JSON.parse(line) as unknown;
        const timestamp = recordTimestamp(parsed, timestampKeys);
        shouldRemove = timestamp !== null && timestamp < cutoffAt;
        if (!shouldRemove && transformRecord) {
          const transformed = transformRecord(parsed);
          if (transformed !== undefined && transformed !== line) {
            outputLine = transformed;
            rewritten = true;
          }
        }
      } catch {
        // Keep malformed lines for diagnostics instead of destroying evidence.
      }

      if (shouldRemove) {
        result.removedLines += 1;
        continue;
      }

      result.keptLines += 1;
      if (!output.write(`${outputLine}\n`)) await once(output, "drain");
    }
    await closeWriteStream(output);
    const currentStat = await fs.promises.stat(filePath).catch(() => null);
    if (
      !currentStat ||
      currentStat.size !== initialStat.size ||
      currentStat.mtimeMs !== initialStat.mtimeMs
    ) {
      // A concurrent append won the race. Do not replace the newer file.
      await fs.promises.unlink(tempPath).catch(() => undefined);
      return { ...result, removedLines: 0, keptLines: 0 };
    }
    if (result.removedLines === 0 && !rewritten) {
      await fs.promises.unlink(tempPath).catch(() => undefined);
      return result;
    }

    if (result.keptLines === 0) {
      await fs.promises.unlink(tempPath).catch(() => undefined);
      await fs.promises.unlink(filePath).catch(() => undefined);
      result.removedFile = true;
      return result;
    }

    await fs.promises.rename(tempPath, filePath);
    return result;
  } catch (error) {
    output.destroy();
    await fs.promises.unlink(tempPath).catch(() => undefined);
    throw error;
  } finally {
    lines.close();
    input.destroy();
  }
}

export function removeEmptyParentDirectories(
  startDir: string,
  stopDir: string,
): void {
  let current = path.resolve(startDir);
  const boundary = path.resolve(stopDir);
  while (current !== boundary && current.startsWith(`${boundary}${path.sep}`)) {
    try {
      fs.rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}
