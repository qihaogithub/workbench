const MARKDOWN_FILE_EXTENSIONS = [".md", ".markdown", ".mdown"];
const MARKDOWN_MIME_TYPES = new Set(["text/markdown", "text/x-markdown"]);

export const DOCUMENT_NODE_DEFAULT_HEIGHT = 360;
export const DOCUMENT_NODE_COLLAPSED_HEIGHT = 48;

function getLowerFileName(file: File): string {
  return file.name.toLowerCase();
}

export function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
}

export function isMarkdownFile(file: File): boolean {
  const lowerName = getLowerFileName(file);
  return (
    MARKDOWN_MIME_TYPES.has(file.type) ||
    MARKDOWN_FILE_EXTENSIONS.some((extension) =>
      lowerName.endsWith(extension),
    )
  );
}
