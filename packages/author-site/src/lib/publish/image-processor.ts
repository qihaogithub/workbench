import type { PublishContext, UploadResult } from './types';
import { scanImageReferences, isLocalPath, isApiImagePath } from './image-scanner';
import { OSSUploader } from './oss-uploader';
import { getOSSConfig, isOSSConfigured } from './oss-config';

export interface ImageProcessResult {
  success: boolean;
  urlMap: Map<string, string>;
  errors: UploadResult[];
  imageCount: number;
}

export async function processImagesForPublish(
  context: PublishContext,
): Promise<ImageProcessResult> {
  const { workspacePath, onProgress } = context;

  if (!isOSSConfigured()) {
    onProgress?.(100, 100, 'OSS 未配置，跳过图片处理');
    return { success: true, urlMap: new Map(), errors: [], imageCount: 0 };
  }

  onProgress?.(0, 100, '扫描图片引用...');
  const references = scanImageReferences(workspacePath);
  const uploadableImages = references.filter(
    (ref) => isLocalPath(ref.originalPath) || isApiImagePath(ref.originalPath),
  );

  if (uploadableImages.length === 0) {
    onProgress?.(100, 100, '未发现本地图片引用');
    return { success: true, urlMap: new Map(), errors: [], imageCount: 0 };
  }

  onProgress?.(10, 100, `发现 ${uploadableImages.length} 张图片，准备上传...`);

  const ossConfig = getOSSConfig();
  const uploader = new OSSUploader(ossConfig, context.projectId);
  const results = await uploader.uploadBatch(uploadableImages, {
    concurrency: 5,
    onProgress: (current, total) => {
      const percent = 10 + Math.floor((current / Math.max(total, 1)) * 80);
      onProgress?.(percent, 100, `上传图片 ${current}/${total}...`);
    },
  });

  const urlMap = new Map<string, string>();
  const errors: UploadResult[] = [];

  for (const result of results) {
    if (result.success) {
      urlMap.set(result.localPath, result.ossUrl);
    } else {
      errors.push(result);
    }
  }

  onProgress?.(90, 100, `图片处理完成（成功: ${urlMap.size}, 失败: ${errors.length}）`);

  return {
    success: errors.length === 0,
    urlMap,
    errors,
    imageCount: uploadableImages.length,
  };
}
