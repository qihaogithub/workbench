import { getOSSConfig, isOSSConfigured } from '../oss-config';

describe('oss-config', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  describe('isOSSConfigured', () => {
    it('未配置时应返回 false', () => {
      delete process.env.OSS_REGION;
      delete process.env.OSS_ACCESS_KEY_ID;
      delete process.env.OSS_ACCESS_KEY_SECRET;
      delete process.env.OSS_BUCKET;
      expect(isOSSConfigured()).toBe(false);
    });

    it('部分配置缺失应返回 false', () => {
      process.env.OSS_REGION = 'oss-cn-hangzhou';
      process.env.OSS_ACCESS_KEY_ID = 'test-id';
      process.env.OSS_ACCESS_KEY_SECRET = '';
      process.env.OSS_BUCKET = 'test-bucket';
      expect(isOSSConfigured()).toBe(false);
    });

    it('完整配置应返回 true', () => {
      process.env.OSS_REGION = 'oss-cn-hangzhou';
      process.env.OSS_ACCESS_KEY_ID = 'test-id';
      process.env.OSS_ACCESS_KEY_SECRET = 'test-secret';
      process.env.OSS_BUCKET = 'test-bucket';
      expect(isOSSConfigured()).toBe(true);
    });
  });

  describe('getOSSConfig', () => {
    it('完整配置应返回正确值', () => {
      process.env.OSS_REGION = 'oss-cn-hangzhou';
      process.env.OSS_ACCESS_KEY_ID = 'test-id';
      process.env.OSS_ACCESS_KEY_SECRET = 'test-secret';
      process.env.OSS_BUCKET = 'test-bucket';
      process.env.OSS_ENDPOINT = 'https://custom.endpoint.com';
      process.env.OSS_PATH_PREFIX = 'dev';

      const config = getOSSConfig();
      expect(config.region).toBe('oss-cn-hangzhou');
      expect(config.accessKeyId).toBe('test-id');
      expect(config.accessKeySecret).toBe('test-secret');
      expect(config.bucket).toBe('test-bucket');
      expect(config.endpoint).toBe('https://custom.endpoint.com');
      expect(config.pathPrefix).toBe('dev');
    });

    it('缺少必填项应抛出错误', () => {
      delete process.env.OSS_REGION;
      delete process.env.OSS_ACCESS_KEY_ID;
      delete process.env.OSS_ACCESS_KEY_SECRET;
      delete process.env.OSS_BUCKET;
      expect(() => getOSSConfig()).toThrow('OSS_NOT_CONFIGURED');
    });
  });
});
