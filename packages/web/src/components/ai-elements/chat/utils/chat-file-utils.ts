import type { MessagePart } from "@/components/ai-elements";

const CODE_FILE_EXTENSIONS = [
  "index.tsx",
  "index.ts",
  "Demo.tsx",
  "Demo.ts",
] as const;

const SCHEMA_FILE_EXTENSION = "config.schema.json";

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isCodeFile(path: string): boolean {
  const normalized = normalizePath(path);
  return CODE_FILE_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

export function isSchemaFile(path: string): boolean {
  return normalizePath(path).endsWith(SCHEMA_FILE_EXTENSION);
}

export interface FileChangeEntry {
  path: string;
  action: "created" | "modified" | "deleted";
  content?: string;
}

export interface CodeAndSchemaResult {
  codeUpdated: boolean;
  schemaUpdated: boolean;
}

export function extractCodeAndSchemaUpdates(
  files: FileChangeEntry[],
  callbacks: {
    onCodeUpdate?: (code: string) => void;
    onSchemaUpdate?: (schema: string) => void;
  },
): CodeAndSchemaResult {
  let codeUpdated = false;
  let schemaUpdated = false;

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);

    if (isCodeFile(normalizedPath)) {
      if ("content" in file && typeof file.content === "string" && file.content.length > 0) {
        codeUpdated = true;
        callbacks.onCodeUpdate?.(file.content);
      }
    } else if (isSchemaFile(normalizedPath)) {
      if ("content" in file && typeof file.content === "string") {
        schemaUpdated = true;
        callbacks.onSchemaUpdate?.(file.content);
      }
    }
  }

  return { codeUpdated, schemaUpdated };
}

export function processFileChanges(
  files: FileChangeEntry[],
  callbacks: {
    onCodeUpdate?: (code: string) => void;
    onSchemaUpdate?: (schema: string) => void;
    onFilesChange?: (files: FileChangeEntry[]) => void;
  },
): void {
  if (files.length > 0) {
    callbacks.onFilesChange?.(files);
    extractCodeAndSchemaUpdates(files, callbacks);
  }
}
