import fs from 'fs';
import path from 'path';
import type { Browser } from 'playwright';
import { getProjectPath, readProjectMeta, writeProjectMeta } from './fs-utils';
import { compileCode } from './compiler';
import { generateIframeHtml } from './iframe-template';

const THUMBNAILS_DIR = path.join(process.cwd(), 'public', 'thumbnails');

/**
 * 确保缩略图目录存在
 */
function ensureThumbnailsDir(): void {
  if (!fs.existsSync(THUMBNAILS_DIR)) {
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
  }
}

/**
 * 为指定项目生成缩略图
 * 使用 playwright 加载编译后的 iframe HTML 并截图
 * 如果 playwright 未安装或浏览器不可用，静默跳过
 */
export async function generateThumbnail(projectId: string): Promise<string | null> {
  let browser: Browser | undefined;

  try {
    // 动态导入 playwright，未安装时不影响主流程
    const playwright = await import('playwright');

    const projectPath = getProjectPath(projectId);
    const codePath = path.join(projectPath, 'workspace', 'index.tsx');
    const schemaPath = path.join(projectPath, 'workspace', 'config.schema.json');

    if (!fs.existsSync(codePath)) {
      return null;
    }

    const code = fs.readFileSync(codePath, 'utf-8');
    const project = readProjectMeta(projectId);
    const compileResult = compileCode(code, project?.lockedDependencies);

    // 读取默认配置
    let configData: Record<string, unknown> = {};
    if (fs.existsSync(schemaPath)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            const p = prop as Record<string, unknown>;
            if (p.default !== undefined) {
              configData[key] = p.default;
            }
          }
        }
      } catch {
        // 忽略 schema 解析错误
      }
    }

    // 生成 iframe HTML
    const html = generateIframeHtml({
      compiledCode: compileResult.compiledCode,
      cssImports: compileResult.cssImports,
      configData,
    });

    // 启动浏览器
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();

    // 设置视口为常见移动端尺寸
    await page.setViewportSize({ width: 375, height: 812 });

    // 加载 HTML 内容
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 等待组件渲染完成（iframe 内 READY + 短暂延时确保样式生效）
    await page.waitForTimeout(2000);

    // 截图
    ensureThumbnailsDir();
    const thumbnailPath = path.join(THUMBNAILS_DIR, `${projectId}.png`);
    await page.screenshot({
      path: thumbnailPath,
      fullPage: false,
      clip: { x: 0, y: 0, width: 375, height: 812 },
    });

    // 更新项目元数据
    if (project) {
      project.thumbnail = `/thumbnails/${projectId}.png`;
      writeProjectMeta(projectId, project);
    }

    return `/thumbnails/${projectId}.png`;
  } catch (error) {
    console.warn(`[screenshot] 生成缩略图失败 (${projectId}):`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}
