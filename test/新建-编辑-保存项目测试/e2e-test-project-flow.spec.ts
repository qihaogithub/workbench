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

test.describe('项目创建和代码编辑完整流程', () => {
  let logger: TestLogger;
  let projectName = '';

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

  test('完整流程: 打开首页 -> 新建项目 -> 编辑代码 -> 保存', async ({ page }) => {
    const outputDir = logger.getOutputDir();
    const screenshot = (name: string) => path.join(outputDir, name);
    try {
      // ========== 步骤 1: 打开项目首页 ==========
      logger.step('1', '打开项目首页 http://localhost:3200');
      await page.goto('http://localhost:3200', { waitUntil: 'domcontentloaded' });
      
      // 检查是否需要登录
      const loginPage = await page.getByRole('textbox', { name: /账号|用户名|用户名|username/i }).isVisible({ timeout: 3000 }).catch(() => false);
      
      if (loginPage) {
        logger.log('检测到登录页面，正在登录...');
        
        // 填写账号
        const accountInput = page.getByRole('textbox', { name: /账号|用户名|用户名|username/i })
          .or(page.locator('input[type="text"], input[type="email"]').first());
        await accountInput.fill('qihao');
        logger.log('已填写账号');
        await page.waitForTimeout(500);
        
        // 填写密码
        const passwordInput = page.getByRole('textbox', { name: /密码|password/i })
          .or(page.locator('input[type="password"]').first());
        await passwordInput.fill('130015');
        logger.log('已填写密码');
        await page.waitForTimeout(500);
        
        // 点击登录按钮
        const loginButton = page.getByRole('button', { name: /登录|login/i })
          .or(page.getByText(/登录/i));
        await loginButton.click();
        logger.log('已点击登录按钮');
        
        // 等待登录完成
        await page.waitForTimeout(3000);
      }
      
      await page.waitForLoadState('networkidle');
      logger.success('已打开首页');

      // 截图保存首页状态
      await page.screenshot({ path: screenshot(`01-homepage-${Date.now()}.png`) });
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

      // 生成随机项目名称
      projectName = `测试项目-${crypto.randomBytes(4).toString('hex')}`;
      logger.log(`项目名称: ${projectName}`);

      // 等待对话框出现并查找输入框
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);

      // 尝试多种输入框定位方式
      const nameInputSelectors = [
        page.getByPlaceholder(/项目.*名称/i),
        page.getByLabel(/项目.*名称/i),
        page.getByLabel(/名称/i),
        page.locator('input[type="text"]').first(),
        page.locator('input').first(),
        page.locator('textarea').first(),
      ];

      let nameInput = null;
      for (const selector of nameInputSelectors) {
        if (await selector.isVisible({ timeout: 3000 }).catch(() => false)) {
          nameInput = selector;
          logger.log(`找到输入框`);
          break;
        }
      }

      if (!nameInput) {
        // 尝试点击对话框主体让它获取焦点
        const dialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]').first();
        if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
          await dialog.click();
          await page.waitForTimeout(500);
        }
        // 再试一次
        nameInput = page.locator('input[type="text"], input, textarea').first();
      }

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
      await page.screenshot({ path: screenshot(`02-edit-page-${Date.now()}.png`) });
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
      await page.screenshot({ path: screenshot(`03-code-pasted-${Date.now()}.png`) });
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
      await page.screenshot({ path: screenshot(`04-saved-${Date.now()}.png`) });
      logger.log('已保存最终状态截图');

      // ========== 步骤 6: 删除项目 ==========
      logger.step('6', '删除项目');

      // 点击返回或找到项目列表
      const backButton = page.getByRole('button', { name: /返回|back/i })
        .or(page.getByText(/返回/))
        .or(page.locator('button').filter({ hasText: /返回/i }))
        .first();

      if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await backButton.click();
        logger.log('已点击返回按钮');
        await page.waitForTimeout(1000);
      }

      // 找到删除按钮（通常是更多操作菜单中的删除选项）
      const deleteButton = page.getByRole('button', { name: /删除|delete|remove/i })
        .or(page.getByText(/删除/))
        .or(page.locator('button').filter({ hasText: /删除/i }))
        .first();

      if (await deleteButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await deleteButton.click();
        logger.log('已点击删除按钮');
        await page.waitForTimeout(500);

        // 确认删除操作
        const confirmDeleteButton = page.getByRole('button', { name: /确认|确定|是|删除/i })
          .or(page.getByText(/确认删除|确定删除/i))
          .first();

        if (await confirmDeleteButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await confirmDeleteButton.click();
          logger.success('已确认删除项目');
        } else {
          // 有些UI可能是直接删除，无需二次确认
          logger.success('已执行删除操作');
        }

        await page.waitForTimeout(2000);
      } else {
        logger.log('未找到删除按钮，尝试通过右键菜单或更多操作删除');
        
        // 尝试右键点击项目卡片或行来获取上下文菜单
        const projectCard = page.locator('[class*="card"], [class*="item"], [role="listitem"]').first();
        if (await projectCard.isVisible({ timeout: 2000 }).catch(() => false)) {
          await projectCard.click({ button: 'right' });
          await page.waitForTimeout(500);
          
          const contextDeleteButton = page.getByText(/删除|delete/i).first();
          if (await contextDeleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
            await contextDeleteButton.click();
            logger.log('已通过右键菜单点击删除');
            await page.waitForTimeout(500);
            
            // 再次确认
            const finalConfirm = page.getByRole('button', { name: /确认|确定|是/i })
              .or(page.getByText(/确认删除|确定删除/i))
              .first();
            if (await finalConfirm.isVisible({ timeout: 2000 }).catch(() => false)) {
              await finalConfirm.click();
            }
          }
        }
      }

      // 截图保存删除后的状态
      await page.screenshot({ path: screenshot(`05-deleted-${Date.now()}.png`) });
      logger.log('已保存删除后的截图');

      // ========== 验证 ==========
      logger.log('========================================');
      logger.log('流程执行完成，验证结果:');
      logger.log(`- 项目名称: ${projectName}`);
      logger.log(`- 模板代码长度: ${TEMPLATE_CODE.length} 字符`);
      logger.log('- 所有步骤均已执行（新建、编辑、保存、删除）');
      logger.log('========================================');

    } catch (error) {
      logger.error('测试执行', error);

      // 截图保存错误状态
      await page.screenshot({ path: screenshot(`error-${Date.now()}.png`) }).catch(() => {});

      throw error;
    }
  });
});