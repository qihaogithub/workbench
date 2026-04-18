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

  constructor() {
    const scriptDir = __dirname;
    const rootDir = path.resolve(scriptDir, '..', '..');
    const logDir = path.join(rootDir, 'test-logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logPath = path.join(logDir, generateLogFilename());
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

test.describe('项目创建和代码编辑完整流程', () => {
  const logger = new TestLogger();
  let projectName = '';

  test.beforeAll(async () => {
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

  test('完整流程: 打开首页 -> 新建项目 -> 编辑代码 -> 保存', async ({ page }) => {
    try {
      // ========== 步骤 1: 打开项目首页 ==========
      logger.step('1', '打开项目首页 http://localhost:3200');
      await page.goto('http://localhost:3200', { waitUntil: 'networkidle' });
      logger.success('已打开首页');

      // 截图保存首页状态
      await page.screenshot({ path: `test-logs/01-homepage-${Date.now()}.png` });
      logger.log('已保存首页截图');

      // ========== 步骤 2: 新建项目 ==========
      logger.step('2', '点击新建项目按钮');

      // 等待页面加载并查找新建项目按钮
      await page.waitForLoadState('domcontentloaded');

      // 尝试多种可能的新建项目按钮定位方式
      const newProjectButton = page.getByRole('button', { name: /新建|新建项目|new project/i })
        .or(page.getByText(/新建.*项目/i))
        .or(page.locator('button').filter({ hasText: /新建/i }));

      await newProjectButton.click();
      logger.success('已点击新建项目按钮');

      // 等待对话框或表单出现
      await page.waitForTimeout(1000);

      // 生成随机项目名称
      projectName = `测试项目-${crypto.randomBytes(4).toString('hex')}`;
      logger.log(`项目名称: ${projectName}`);

      // 查找项目名称输入框并填写
      const nameInput = page.getByPlaceholder(/项目.*名称/i)
        .or(page.getByLabel(/项目.*名称/i))
        .or(page.locator('input[type="text"]').first());

      await nameInput.fill(projectName);
      logger.log(`已填写项目名称: ${projectName}`);

      // 点击确认/创建按钮
      const confirmButton = page.getByRole('button', { name: /创建|确认|确定|create/i });
      await confirmButton.click();
      logger.success('已创建项目');

      await page.waitForTimeout(2000);

      // ========== 步骤 3: 打开项目编辑页 ==========
      logger.step('3', '等待并打开项目编辑页');

      // 等待项目创建完成并导航到编辑页
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // 尝试点击编辑按钮或直接导航到编辑页
      const editButton = page.getByRole('button', { name: /编辑|edit/i })
        .or(page.getByText(/编辑/i))
        .first();

      if (await editButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editButton.click();
        logger.success('已点击编辑按钮');
      }

      await page.waitForTimeout(2000);

      // 截图保存编辑页状态
      await page.screenshot({ path: `test-logs/02-edit-page-${Date.now()}.png` });
      logger.log('已保存编辑页截图');

      // ========== 步骤 4: 粘贴模板代码到代码编辑区 ==========
      logger.step('4', '将预设内容粘贴到代码编辑区');

      // 查找代码编辑器区域
      // 可能是 CodeMirror, Monaco, 或其他编辑器
      const editorSelectors = [
        '.cm-editor',
        '.cm-content',
        '[class*="editor"]',
        'textarea',
        'pre',
        '[contenteditable="true"]'
      ];

      let editorFound = false;
      for (const selector of editorSelectors) {
        const editor = page.locator(selector).first();
        if (await editor.isVisible({ timeout: 2000 }).catch(() => false)) {
          logger.log(`找到编辑器: ${selector}`);

          // 点击编辑器获取焦点
          await editor.click();
          await page.waitForTimeout(500);

          // 使用 Ctrl+A 全选，然后粘贴新内容
          await page.keyboard.press('Control+a');
          await page.waitForTimeout(200);

          // 将模板代码写入剪贴板并粘贴
          await page.evaluate((code: string) => {
            navigator.clipboard.writeText(code);
          }, TEMPLATE_CODE);

          await page.keyboard.press('Control+v');
          await page.waitForTimeout(500);

          editorFound = true;
          logger.success('已粘贴模板代码到编辑器');
          break;
        }
      }

      if (!editorFound) {
        logger.error('编辑器', new Error('未找到代码编辑器'));
        throw new Error('未找到代码编辑器');
      }

      // 截图保存粘贴后的状态
      await page.screenshot({ path: `test-logs/03-code-pasted-${Date.now()}.png` });
      logger.log('已保存粘贴代码后的截图');

      // ========== 步骤 5: 点击保存按钮 ==========
      logger.step('5', '点击保存按钮');

      // 查找保存按钮
      const saveButton = page.getByRole('button', { name: /保存|save/i })
        .or(page.getByText(/保存/))
        .or(page.locator('button').filter({ hasText: /保存/i }))
        .first();

      await saveButton.click();
      logger.success('已点击保存按钮');

      // 等待保存完成
      await page.waitForTimeout(2000);

      // 截图保存最终状态
      await page.screenshot({ path: `test-logs/04-saved-${Date.now()}.png` });
      logger.log('已保存最终状态截图');

      // ========== 验证 ==========
      logger.log('========================================');
      logger.log('流程执行完成，验证结果:');
      logger.log(`- 项目名称: ${projectName}`);
      logger.log(`- 模板代码长度: ${TEMPLATE_CODE.length} 字符`);
      logger.log('- 所有步骤均已执行');
      logger.log('========================================');

    } catch (error) {
      logger.error('测试执行', error);

      // 截图保存错误状态
      await page.screenshot({ path: `test-logs/error-${Date.now()}.png` }).catch(() => {});

      throw error;
    }
  });
});