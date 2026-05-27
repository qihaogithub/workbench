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

  console.log(
    "[extractCodeAndSchemaUpdates] 检查文件列表:",
    files.map((f) => f.path),
  );

  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    const isCode = isCodeFile(normalizedPath);
    const isSchema = isSchemaFile(normalizedPath);
    const hasContent =
      "content" in file &&
      typeof file.content === "string" &&
      (file.content?.length ?? 0) > 0;

    console.log(
      `[extractCodeAndSchemaUpdates] 文件: ${file.path}, isCode: ${isCode}, isSchema: ${isSchema}, hasContent: ${hasContent}, contentLength: ${file.content?.length ?? 0}`,
    );

    if (isCode) {
      if (hasContent) {
        codeUpdated = true;
        console.log(
          "[extractCodeAndSchemaUpdates] ✅ 匹配代码文件, 触发 onCodeUpdate",
        );
        callbacks.onCodeUpdate?.(file.content!);
      }
    } else if (isSchema) {
      if ("content" in file && typeof file.content === "string") {
        schemaUpdated = true;
        console.log(
          "[extractCodeAndSchemaUpdates] ✅ 匹配 schema 文件, 触发 onSchemaUpdate",
        );
        callbacks.onSchemaUpdate?.(file.content);
      }
    }
  }

  console.log(
    "[extractCodeAndSchemaUpdates] 结果: codeUpdated=",
    codeUpdated,
    "schemaUpdated=",
    schemaUpdated,
  );
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
