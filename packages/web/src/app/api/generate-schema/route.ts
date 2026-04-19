import { NextRequest, NextResponse } from 'next/server';
import { createApiSuccess, createApiError, getSessionFiles } from '@/lib/fs-utils';
import { generateSchemaFromCode, mergeWithExistingSchema } from '@/lib/schema-generator';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, code: rawCode } = body;

    let code: string;
    let existingSchema: Record<string, unknown> = {};

    if (sessionId) {
      const files = getSessionFiles(sessionId);
      if (!files) {
        return NextResponse.json(
          createApiError('SESSION_NOT_FOUND', '无法读取 Session 文件'),
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

    // 合并现有 Schema 的扩展配置
    const merged = Object.keys(existingSchema).length > 0
      ? mergeWithExistingSchema(generated, existingSchema)
      : generated;

    return NextResponse.json(createApiSuccess({
      schema: merged,
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
