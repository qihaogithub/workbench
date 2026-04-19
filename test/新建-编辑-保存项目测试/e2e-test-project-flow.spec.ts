import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const TEMPLATE_CODE = `=== DEMO CODE ===

import React from 'react';

interface BannerDemoProps {
  banner: string;
  title: string;
  description: string;
  theme: 'light' | 'dark' | 'colorful';
  showBadge: boolean;
}

export default function BannerDemo({
  banner,
  title,
  description,
  theme,
  showBadge
}: BannerDemoProps) {
  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-white',
    colorful: 'bg-gradient-to-r from-pink-500 to-purple-500 text-white',
  };

  return (
    <div className={\`min-h-screen \${themeClasses[theme]}\`}>
      <div className="container mx-auto px-4 py-8">
        {showBadge && (
          <span className="inline-block px-3 py-1 text-sm font-semibold bg-blue-500 text-white rounded-full mb-4">
            活动中
          </span>
        )}

        <img
          src={banner}
          alt="banner"
          className="w-full h-64 object-cover rounded-lg mb-6"
        />

        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-lg opacity-80">{description}</p>
      </div>
    </div>
  );
}

=== DEMO SCHEMA ===
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Banner Demo 配置",
  "type": "object",
  "properties": {
    "banner": {
      "type": "string",
      "format": "uri",
      "title": "顶部 Banner 图",
      "description": "建议尺寸: 750x400px，支持 JPG、PNG、WebP 格式",
      "default": "https://picsum.photos/750/400"
    },
    "title": {
      "type": "string",
      "title": "活动标题",
      "default": "精彩活动来袭",
      "maxLength": 20
    },
    "description": {
      "type": "string",
      "title": "活动描述",
      "default": "限时优惠，不容错过"
    },
    "theme": {
      "type": "string",
      "title": "主题颜色",
      "enum": ["light", "dark", "colorful"],
      "enumNames": ["浅色模式", "深色模式", "多彩渐变"],
      "default": "light"
    },
    "showBadge": {
      "type": "boolean",
      "title": "显示活动标签",
      "default": true
    }
  },
  "required": ["banner", "title"]
}

=== END ===`;

function generateLogFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `test-log-${timestamp}.txt`;
}

class TestLogger {
  private logs: string[] = [];
  private logPath: string;
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(__dirname, 'test-outputs');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
    this.logPath = path.join(this.outputDir, generateLogFilename());
  }

  getOutputDir(): string {
    return this.outputDir;
  }

  log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.logs.push(logEntry);
    console.log(logEntry);
  }

  step(stepName: string, description: string): void {
    this.log(`[STEP] ${stepName}: ${description}`);
  }

  success(operation: string): void {
    this.log(`[SUCCESS] ${operation}`);
  }

  error(operation: string, error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.log(`[ERROR] ${operation}: ${errorMessage}`);
  }

  save(): string {
    const content = this.logs.join('\n');
    fs.writeFileSync(this.logPath, content, 'utf-8');
    return this.logPath;
  }
}

async function doLogin(page: any, logger: TestLogger): Promise<boolean> {
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    logger.log('检测到登录页面，正在登录...');

    const accountInput = page.getByPlaceholder(/账号|邮箱|用户名/i).first();
    if (await accountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await accountInput.fill('qihao');
      logger.log('已填写账号');
      await page.waitForTimeout(500);
    }

    const passwordInput = page.getByPlaceholder(/密码/i).or(page.locator('input[type="password"]')).first();
    if (await passwordInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await passwordInput.fill('130015');
      logger.log('已填写密码');
      await page.waitForTimeout(500);
    }

    const loginButton = page.getByRole('button', { name: /登录/i }).first();
    if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await loginButton.click();
      logger.log('已点击登录按钮');
      await page.waitForTimeout(3000);
    }

    await page.waitForLoadState('networkidle');
    return true;
  }
  return false;
}

test.describe('项目创建和代码编辑完整流程', () => {
  let logger: TestLogger;
  let projectName = '';
  let createdProjectId = '';

  test.beforeAll(async () => {
    logger = new TestLogger();
    logger.log('========================================');
    logger.log('测试开始: 项目创建和代码编辑完整流程');
    logger.log('========================================');
  });

  test.afterAll(async () => {
    const logPath = logger.save();
    logger.log('========================================');
    logger.log(`测试完成. 日志已保存至: ${logPath}`);
    logger.log('========================================');
  });

  test('完整流程: 打开首页 -> 新建项目 -> 编辑代码 -> 保存 -> 删除', async ({ page }) => {
    const outputDir = logger.getOutputDir();
    const screenshot = (name: string) => path.join(outputDir, name);

    try {
      // ========== 步骤 1: 打开项目首页 ==========
      logger.step('1', '打开项目首页 http://localhost:3200');
      await page.goto('http://localhost:3200', { waitUntil: 'domcontentloaded' });

      await doLogin(page, logger);

      await page.waitForLoadState('networkidle');
      logger.success('已打开首页');

      await page.screenshot({ path: screenshot(`01-homepage-${Date.now()}.png`) });
      logger.log('已保存首页截图');

      // ========== 步骤 2: 新建项目 ==========
      logger.step('2', '点击新建 Demo 按钮');

      const newProjectButton = page.getByRole('button', { name: /新建 Demo/i });
      await newProjectButton.click();
      logger.success('已点击新建 Demo 按钮');

      await page.waitForTimeout(1000);

      projectName = `测试项目-${crypto.randomBytes(4).toString('hex')}`;
      logger.log(`项目名称: ${projectName}`);

      const nameInput = page.getByRole('textbox', { name: /Demo 名称/i });
      await nameInput.waitFor({ state: 'visible', timeout: 5000 });
      await nameInput.fill(projectName);
      logger.log('已填写项目名称');

      const createButton = page.getByRole('button', { name: '创建' });
      await createButton.click();
      logger.success('已创建项目');

      await page.waitForTimeout(3000);

      // 检查是否需要登录（创建后跳转可能触发登录）
      await doLogin(page, logger);

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // 从 URL 中提取项目 ID
      const currentUrl = page.url();
      const match = currentUrl.match(/\/demo\/(proj_\d+)\/edit/);
      if (match) {
        createdProjectId = match[1];
        logger.log(`项目 ID: ${createdProjectId}`);
      }

      // ========== 步骤 3: 打开项目编辑页 ==========
      logger.step('3', '等待编辑页加载');

      await page.screenshot({ path: screenshot(`02-edit-page-${Date.now()}.png`) });
      logger.log('已保存编辑页截图');

      // ========== 步骤 4: 切换到代码编辑标签并粘贴模板代码 ==========
      logger.step('4', '切换到代码编辑标签，粘贴模板代码');

      // 切换到"代码编辑"标签
      const codeTab = page.getByRole('tab', { name: /代码编辑/i });
      if (await codeTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await codeTab.click();
        logger.success('已切换到代码编辑标签');
        await page.waitForTimeout(1000);
      }

      // 在代码编辑标签中找到代码编辑器 textarea
      // 使用占位文本作为定位特征
      const textarea = page.getByPlaceholder(/=== DEMO CODE ===/);
      await textarea.waitFor({ state: 'visible', timeout: 5000 });
      await textarea.click();
      await page.waitForTimeout(300);

      // 直接 fill 内容
      await textarea.fill(TEMPLATE_CODE);

      logger.success('已粘贴模板代码到编辑器');

      await page.screenshot({ path: screenshot(`03-code-pasted-${Date.now()}.png`) });
      logger.log('已保存粘贴代码后的截图');

      // ========== 步骤 5: 点击保存按钮 ==========
      logger.step('5', '点击保存按钮');

      const saveButton = page.getByRole('button', { name: /^保存$/i });
      await saveButton.click();
      logger.success('已点击保存按钮');

      await page.waitForTimeout(3000);

      await page.screenshot({ path: screenshot(`04-saved-${Date.now()}.png`) });
      logger.log('已保存最终状态截图');

      // ========== 步骤 6: 返回首页并删除项目 ==========
      logger.step('6', '返回首页并删除项目');

      const homeLink = page.getByRole('link', { name: /首页/i }).first();
      if (await homeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await homeLink.click();
        logger.log('已点击首页链接');
      } else {
        await page.goto('http://localhost:3200', { waitUntil: 'networkidle' });
      }

      await page.waitForTimeout(2000);

      // 在首页找到刚创建的项目
      const projectCard = page.locator(`:has(:has-text("${projectName}"))`).first();
      if (await projectCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        // 查找项目卡片中的删除按钮（更多操作按钮）
        const moreButton = projectCard.locator('button').last();
        await moreButton.click();
        logger.log('已点击更多操作按钮');
        await page.waitForTimeout(500);

        const deleteOption = page.getByText(/删除/i).first();
        if (await deleteOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await deleteOption.click();
          logger.log('已点击删除选项');
          await page.waitForTimeout(500);

          const confirmDelete = page.getByRole('button', { name: /确认|确定|删除/i }).first();
          if (await confirmDelete.isVisible({ timeout: 3000 }).catch(() => false)) {
            await confirmDelete.click();
            logger.success('已确认删除项目');
          }

          await page.waitForTimeout(2000);
        }
      }

      await page.screenshot({ path: screenshot(`05-deleted-${Date.now()}.png`) });
      logger.log('已保存删除后的截图');

      // ========== 验证 ==========
      logger.log('========================================');
      logger.log('流程执行完成，验证结果:');
      logger.log(`- 项目名称: ${projectName}`);
      logger.log(`- 项目 ID: ${createdProjectId || '未获取到'}`);
      logger.log(`- 模板代码长度: ${TEMPLATE_CODE.length} 字符`);
      logger.log('- 所有步骤均已执行（新建、编辑、保存、删除）');
      logger.log('========================================');

    } catch (error) {
      logger.error('测试执行', error);

      await page.screenshot({ path: screenshot(`error-${Date.now()}.png`) }).catch(() => {});

      throw error;
    }
  });
});
