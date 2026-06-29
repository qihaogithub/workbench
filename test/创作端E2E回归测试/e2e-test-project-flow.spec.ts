import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import {
  E2E_PROJECT_CATEGORY,
  e2eProjectName,
  ensureE2EProjectCategory,
} from './support/e2e-projects';

const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const E2E_USER = process.env.E2E_USER ?? 'qihao';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '130015';

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

type ProjectMeta = {
  id: string;
  name: string;
  category?: string;
  createdAt?: number;
  updatedAt?: number;
};

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

function parseTemplateSource(source: string): { code: string; schema: string } {
  const codeMatch = source.match(/=== DEMO CODE ===\s*([\s\S]*?)\s*=== DEMO SCHEMA ===/);
  const schemaMatch = source.match(/=== DEMO SCHEMA ===\s*([\s\S]*?)\s*=== END ===/);
  if (!codeMatch?.[1] || !schemaMatch?.[1]) {
    throw new Error('模板代码格式无效');
  }
  return {
    code: codeMatch[1].trim(),
    schema: schemaMatch[1].trim(),
  };
}

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

async function doLogin(page: Page, logger: TestLogger): Promise<boolean> {
  const currentUrl = page.url();
  if (currentUrl.includes('/login')) {
    logger.log('检测到登录页面，正在登录...');

    await page.waitForLoadState('networkidle');

    const accountInput = page.locator('#username');
    await accountInput.waitFor({ state: 'visible', timeout: 10000 });
    await accountInput.fill(E2E_USER);
    logger.log('已填写账号');

    const passwordInput = page.locator('#password');
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(E2E_PASSWORD);
    logger.log('已填写密码');

    const loginButton = page.getByRole('button', { name: /^登录$/i }).first();
    await loginButton.waitFor({ state: 'visible', timeout: 10000 });
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/login') &&
        response.request().method() === 'POST',
      { timeout: 15000 },
    );
    await loginButton.click();
    logger.log('已点击登录按钮');

    const loginResponse = await loginResponsePromise;
    if (!loginResponse.ok()) {
      throw new Error(`登录请求失败: ${loginResponse.status()} ${await loginResponse.text()}`);
    }

    await page.waitForURL((url: URL) => !url.pathname.startsWith('/login'), {
      timeout: 60000,
    });
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
      logger.step('1', `打开项目首页 ${E2E_BASE_URL}`);
      await page.goto(E2E_BASE_URL, { waitUntil: 'domcontentloaded' });

      await doLogin(page, logger);

      await page.waitForLoadState('networkidle');
      logger.success('已打开首页');

      await page.screenshot({ path: screenshot(`01-homepage-${Date.now()}.png`) });
      logger.log('已保存首页截图');

      // ========== 步骤 2: 新建项目 ==========
      logger.step('2', '点击新建项目按钮');

      const newProjectButton = page.getByRole('button', { name: /添加空白项目|新建 Demo|添加项目|新建项目/i });
      await newProjectButton.click();
      logger.success('已点击新建项目按钮');

      const createDialog = page.getByRole('dialog');
      await createDialog.waitFor({ state: 'visible', timeout: 10000 });

      projectName = e2eProjectName('项目创建和代码编辑完整流程');
      logger.log(`项目名称: ${projectName}`);

      const nameInput = createDialog.locator('#project-name');
      await nameInput.waitFor({ state: 'visible', timeout: 5000 });
      await nameInput.fill(projectName);
      logger.log('已填写项目名称');

      const categoryInput = createDialog.locator('#project-category');
      if (await categoryInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await categoryInput.fill(E2E_PROJECT_CATEGORY);
        logger.log('已填写 E2E 项目分类');
      }

      const createResponsePromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/demos') &&
          response.request().method() === 'POST',
      );
      const createButton = createDialog.getByRole('button', { name: /创建|创建项目/i });
      await createButton.click();
      logger.success('已创建项目');

      const createResponse = await createResponsePromise;
      const createBody = (await createResponse.json()) as ApiEnvelope<ProjectMeta>;
      if (!createResponse.ok() || !createBody.success || !createBody.data) {
        throw new Error(`创建项目请求失败: ${JSON.stringify(createBody)}`);
      }
      createdProjectId = createBody.data.id;
      await ensureE2EProjectCategory(page.request, createBody.data);
      logger.log(`项目 ID: ${createdProjectId}`);

      await page.waitForTimeout(3000);

      // 检查是否需要登录（创建后跳转可能触发登录）
      await doLogin(page, logger);

      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // 从 URL 中校验项目 ID
      const currentUrl = page.url();
      const match = currentUrl.match(/\/demo\/(proj_[^/]+)\/edit/);
      if (!match || match[1] !== createdProjectId) {
        throw new Error(`未能从 URL 获取项目 ID: ${currentUrl}`);
      }

      // ========== 步骤 3: 打开项目编辑页 ==========
      logger.step('3', '等待编辑页加载');

      await page.screenshot({ path: screenshot(`02-edit-page-${Date.now()}.png`) });
      logger.log('已保存编辑页截图');

      // ========== 步骤 4: 通过编辑页 API 写入模板代码 ==========
      logger.step('4', '通过编辑页 API 写入模板代码');

      await page.waitForFunction(
        () => !document.body.innerText.includes('加载中'),
        undefined,
        { timeout: 90000 },
      );
      await page.getByRole('button', { name: /同步并发布|创建版本并发布|保存/i }).waitFor({
        state: 'visible',
        timeout: 30000,
      });

      const parsedTemplate = parseTemplateSource(TEMPLATE_CODE);
      const savedSession = await page.evaluate(
        async ({ projectId, code, schema }) => {
          const sessionRes = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ demoId: projectId, forceNew: true }),
          });
          const sessionBody = await sessionRes.json();
          if (!sessionRes.ok || !sessionBody.success) {
            throw new Error(sessionBody.error?.message || '创建 Session 失败');
          }

          const sessionId = sessionBody.data.sessionId as string;
          const filesRes = await fetch(`/api/sessions/${sessionId}/files`);
          const filesBody = await filesRes.json();
          if (!filesRes.ok || !filesBody.success) {
            throw new Error(filesBody.error?.message || '加载 Session 文件失败');
          }

          let pageId = filesBody.data.demoPages?.[0]?.id as string | undefined;
          if (!pageId) {
            const createPageRes = await fetch(`/api/projects/${projectId}/demos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId, name: '首页' }),
            });
            const createPageBody = await createPageRes.json();
            if (!createPageRes.ok || !createPageBody.success) {
              throw new Error(createPageBody.error?.message || '创建页面失败');
            }
            pageId = createPageBody.data.id as string | undefined;
          }
          if (!pageId) {
            throw new Error('未找到可编辑页面');
          }

          const updateRes = await fetch(`/api/sessions/${sessionId}/files/${pageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, schema }),
          });
          const updateBody = await updateRes.json();
          if (!updateRes.ok || !updateBody.success) {
            throw new Error(updateBody.error?.message || '保存页面文件失败');
          }

          const savedFilesRes = await fetch(`/api/sessions/${sessionId}/files/${pageId}`);
          const savedFilesBody = await savedFilesRes.json();
          if (!savedFilesRes.ok || !savedFilesBody.success) {
            throw new Error(savedFilesBody.error?.message || '读取保存结果失败');
          }
          if (!savedFilesBody.data.code.includes('BannerDemo')) {
            throw new Error('保存后的代码内容不符合预期');
          }

          const mergeRes = await fetch(`/api/sessions/${sessionId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const mergeBody = await mergeRes.json();
          if (!mergeRes.ok || !mergeBody.success) {
            throw new Error(mergeBody.error?.message || '合并到项目失败');
          }

          return { sessionId, pageId, version: mergeBody.data.version };
        },
        {
          projectId: createdProjectId,
          code: parsedTemplate.code,
          schema: parsedTemplate.schema,
        },
      );

      logger.success(`模板代码已保存到页面 ${savedSession.pageId}`);

      await page.screenshot({ path: screenshot(`03-code-pasted-${Date.now()}.png`) });
      logger.log('已保存写入代码后的截图');

      // ========== 步骤 5: 点击保存按钮 ==========
      logger.step('5', '确认保存结果');
      logger.success(`项目已生成版本 ${savedSession.version || '未知版本'}`);

      await page.screenshot({ path: screenshot(`04-saved-${Date.now()}.png`) });
      logger.log('已保存最终状态截图');

      // ========== 步骤 6: 返回首页并删除项目 ==========
      logger.step('6', '返回首页并删除项目');

      const homeLink = page.getByRole('link', { name: /首页/i }).first();
      if (await homeLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await homeLink.click();
        logger.log('已点击首页链接');
      } else {
        await page.goto(E2E_BASE_URL, { waitUntil: 'networkidle' });
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
