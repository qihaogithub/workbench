export interface OSSConfig {
  region: string;
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint?: string;
  pathPrefix?: string;
}

export function getOSSConfig(): OSSConfig {
  const config: OSSConfig = {
    region: process.env.OSS_REGION || '',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    bucket: process.env.OSS_BUCKET || '',
    endpoint: process.env.OSS_ENDPOINT,
    pathPrefix: process.env.OSS_PATH_PREFIX,
  };

  if (!config.region || !config.accessKeyId || !config.accessKeySecret || !config.bucket) {
    throw new Error('OSS_NOT_CONFIGURED');
  }

  return config;
}

export function isOSSConfigured(): boolean {
  try {
    getOSSConfig();
    return true;
  } catch {
    return false;
  }
}
