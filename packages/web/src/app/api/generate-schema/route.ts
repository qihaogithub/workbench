import { NextRequest, NextResponse } from 'next/server';
import {
  createApiSuccess,
  createApiError,
  getSessionMeta,
  sessionExists,
  isSessionExpired,
  findWorkspacePath,
  getWorkspaceDemoPageFiles,
  getProjectConfigSchema,
} from '@/lib/fs-utils';
import { generateSchemaFromCode, mergeWithExistingSchema } from '@/lib/schema-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, demoId, code: rawCode, excludeFields } = body;

    let code: string;
    let existingSchema: Record<string, unknown> = {};

    if (sessionId) {
      if (!sessionExists(sessionId)) {
        return NextResponse.json(
          createApiError('SESSION_NOT_FOUND', '无法读取 Session 文件'),
          { status: 404 }
        );
      }

      const meta = getSessionMeta(sessionId);
      if (!meta) {
        return NextResponse.json(
          createApiError('SESSION_NOT_FOUND', '无法读取 Session 元数据'),
          { status: 404 }
        );
      }

      if (isSessionExpired(meta)) {
        return NextResponse.json(
          createApiError('SESSION_EXPIRED', 'Session 已过期'),
          { status: 410 }
        );
      }

      if (!meta.workspaceId) {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', 'Session 未绑定 workspace'),
          { status: 400 }
        );
      }

      // 如果传了 demoId，读取对应页面；否则尝试读取 workspace 根目录的旧格式（兼容）
      if (demoId && typeof demoId === 'string') {
        const files = getWorkspaceDemoPageFiles(meta.workspaceId, demoId);
        if (!files) {
          return NextResponse.json(
            createApiError('DEMO_PAGE_NOT_FOUND', '无法读取页面文件'),
            { status: 404 }
          );
        }
        code = files.code;
        try {
          existingSchema = JSON.parse(files.schema);
        } catch {
          existingSchema = {};
        }
      } else if (rawCode && typeof rawCode === 'string') {
        code = rawCode;
      } else {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', '多页面模式下 demoId 必填'),
          { status: 400 }
        );
      }
    } else if (rawCode && typeof rawCode === 'string') {
      code = rawCode;
    } else {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'sessionId 或 code 参数必填'),
        { status: 400 }
      );
    }

    const generated = generateSchemaFromCode(code);
    if (!generated) {
      return NextResponse.json(
        createApiError('VALIDATION_ERROR', '无法从代码中解析 Props 定义'),
        { status: 400 }
      );
    }

    // 如果传了 excludeFields，从生成结果中过滤掉项目级字段
    const excluded = Array.isArray(excludeFields) ? excludeFields : [];
    if (excluded.length > 0) {
      for (const field of excluded) {
        if (field in generated.properties) {
          delete generated.properties[field];
        }
      }
      generated.required = generated.required.filter((r) => !excluded.includes(r));
    }

    // 合并现有 Schema 的扩展配置
    const merged = Object.keys(existingSchema).length > 0
      ? mergeWithExistingSchema(generated, existingSchema)
      : generated;

    return NextResponse.json(createApiSuccess({
      schema: merged,
      excludedCount: excluded.length,
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('生成 Schema 错误:', error);

    const message = error instanceof Error ? error.message : '生成失败';
    return NextResponse.json(
      createApiError('VALIDATION_ERROR', message),
      { status: 500 }
    );
  }
}
