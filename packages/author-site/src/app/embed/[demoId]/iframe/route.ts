import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProjectPath, projectExists, readProjectMeta } from '@/lib/fs-utils';
import { compileCode } from '@/lib/compiler';
import { generateIframeHtml } from '@/lib/iframe-template';

export async function GET(
  _request: Request,
  { params }: { params: { demoId: string } }
) {
  try {
    const { demoId } = params;

    if (!projectExists(demoId)) {
      return new NextResponse('Demo not found', { status: 404 });
    }

    const projectPath = getProjectPath(demoId);
    const workspacePath = path.join(projectPath, 'workspace');
    const codePath = path.join(workspacePath, 'index.tsx');
    const schemaPath = path.join(workspacePath, 'config.schema.json');

    if (!fs.existsSync(codePath)) {
      return new NextResponse('Component code not found', { status: 404 });
    }

    // 读取组件代码
    const code = fs.readFileSync(codePath, 'utf-8');

    // 读取项目元数据中的锁定依赖
    const project = readProjectMeta(demoId);
    const lockedDependencies = project?.lockedDependencies;

    // 编译代码（使用锁定版本）
    const compileResult = compileCode(code, lockedDependencies);

    // 读取 schema 获取默认配置
    let configData: Record<string, unknown> = {};
    if (fs.existsSync(schemaPath)) {
      try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            const p = prop as Record<string, unknown>;
            if (p.default !== undefined) {
              configData[key] = p.default;
            }
          }
        }
      } catch {
        // schema 解析失败时忽略
      }
    }

    // 生成完整 HTML
    const html = generateIframeHtml({
      compiledCode: compileResult.compiledCode,
      cssImports: compileResult.cssImports,
      configData,
    });

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('Embed iframe error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return new NextResponse(message, { status: 500 });
  }
}
