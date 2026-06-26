import path from "path";

import { getSystemKnowledgeByFileName } from "../../config/system-knowledge";

export interface VirtualKnowledgeFile {
  path: string;
  content: string;
}

export function resolveVirtualKnowledgeFile(
  targetPath: string,
  workingDir: string,
): VirtualKnowledgeFile | null {
  if (!workingDir) return null;

  const resolved = targetPath.startsWith("/")
    ? path.resolve(targetPath)
    : path.resolve(workingDir, targetPath);
  const workDirResolved = path.resolve(workingDir);
  if (!resolved.startsWith(workDirResolved + path.sep) && resolved !== workDirResolved) {
    return null;
  }

  const relative = path.relative(workDirResolved, resolved).replace(/\\/g, "/");
  const parts = relative.split("/");
  if (parts.length !== 2 || parts[0] !== "knowledge") return null;

  const doc = getSystemKnowledgeByFileName(parts[1]);
  if (!doc) return null;
  return {
    path: `knowledge/${doc.fileName}`,
    content: doc.content,
  };
}
