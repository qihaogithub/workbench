export interface ImageReference {
  originalPath: string;
  absolutePath: string;
  sourceFile: string;
  type: 'img-src' | 'css-url' | 'import' | 'external-url';
}

export interface UploadResult {
  localPath: string;
  ossUrl: string;
  ossKey: string;
  size: number;
  success: boolean;
  error?: string;
}

export interface PublishContext {
  projectId: string;
  workspacePath: string;
  publishDir: string;
  onProgress?: (percent: number, total: number, message: string) => void;
}
