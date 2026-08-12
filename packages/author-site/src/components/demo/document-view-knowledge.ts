const KNOWLEDGE_UPLOAD_EXTENSION = /\.(?:md|markdown|txt)$/i;

export function isSupportedKnowledgeUpload(file: Pick<File, "name">): boolean {
  return KNOWLEDGE_UPLOAD_EXTENSION.test(file.name);
}

export function getKnowledgeUploadTitle(fileName: string): string {
  const title = fileName.replace(KNOWLEDGE_UPLOAD_EXTENSION, "").trim();
  return title || "未命名文档";
}
