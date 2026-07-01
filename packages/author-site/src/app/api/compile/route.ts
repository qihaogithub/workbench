import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createApiSuccess, createApiError, readProjectMeta, writeProjectMeta, getSessionMeta } from '@/lib/fs-utils';
import { compileCode, compileSession, resolveDependencyVersions } from '@/lib/compiler';
import { PreviewRuntimeContractError } from '@/lib/preview-dependency-policy';
import { registerPreviewModule } from '@/lib/preview-module-store';
import { shouldUsePreviewRuntimeCdn } from '@/lib/preview-runtime-manifest';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let requestKind = 'unknown';
  let codeLength = 0;
  let codeHash: string | undefined;
  let requestDemoId: string | undefined;
  try {
    const body = await request.json();
    const { code, sessionId, demoId } = body;
    requestDemoId = typeof demoId === 'string' ? demoId : undefined;
    codeHash = typeof code === 'string'
      ? createHash('sha256').update(code).digest('hex')
      : undefined;
    const runtimeBaseUrl = request.headers.get('origin') || request.nextUrl.origin;
    const runtimeOptions = {
      baseUrl: runtimeBaseUrl,
      preferCdn: shouldUsePreviewRuntimeCdn(),
    };

    let result;
    let projectId: string | undefined;

    if (code && typeof code === 'string') {
      requestKind = 'inline-code';
      codeLength = code.length;
      let lockedDependencies: Record<string, string> | undefined;
      if (sessionId && typeof sessionId === 'string') {
        try {
          const sessionMeta = getSessionMeta(sessionId);
          if (sessionMeta?.demoId) {
            projectId = sessionMeta.demoId;
            const project = readProjectMeta(projectId);
            if (project?.lockedDependencies) {
              lockedDependencies = project.lockedDependencies;
            }
          }
        } catch {
          // 忽略元数据读取错误
        }
      }
      result = compileCode(code, lockedDependencies, runtimeOptions);
    } else if (sessionId) {
      requestKind = 'session';
      if (typeof sessionId !== 'string') {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', 'sessionId 必须为字符串'),
          { status: 400 }
        );
      }

      // 多页面模式下需要 demoId
      result = compileSession(sessionId, demoId, runtimeOptions);
      if (!result) {
        return NextResponse.json(
          createApiError('SESSION_NOT_FOUND', '无法读取 Session 文件'),
          { status: 404 }
        );
      }

      try {
        const sessionMeta = getSessionMeta(sessionId);
        projectId = sessionMeta?.demoId;
      } catch {
        // 忽略元数据读取错误
      }
    } else {
      return NextResponse.json(
        createApiError('INVALID_REQUEST', 'code 或 sessionId 参数必填'),
        { status: 400 }
      );
    }

    if (result && sessionId && typeof sessionId === 'string') {
      // 图片已通过图床绝对 URL 直接访问，无需路径重写
    }

    registerPreviewModule(result.moduleHash, result.compiledCode);
    const resultWithModuleUrl = {
      ...result,
      moduleUrl: `/api/preview-modules/${result.moduleHash}.js`,
    };

    // 异步解析并锁定依赖版本（不阻塞响应）
    if (projectId && result.dependencies.length > 0) {
      const project = readProjectMeta(projectId);
      if (project) {
        // 筛选出尚未锁定的 npm 依赖
        const existingLocks = project.lockedDependencies || {};
        const unresolvedDeps = result.dependencies.filter((dep) => {
          if (dep.startsWith('.') || dep.startsWith('/')) return false;
          if (dep.endsWith('.css') || dep.endsWith('.scss') || dep.endsWith('.less')) return false;
          return !existingLocks[dep];
        });

        if (unresolvedDeps.length > 0) {
          // 后台解析版本并保存（不 await，不阻塞响应）
          resolveDependencyVersions(unresolvedDeps).then((newLocks) => {
            if (Object.keys(newLocks).length > 0) {
              project.lockedDependencies = { ...existingLocks, ...newLocks };
              writeProjectMeta(projectId, project);
            }
          }).catch((err) => {
            console.error('[compile] 依赖版本锁定失败:', err);
          });
        }
      }
    }

    console.info('[PreviewRuntime][compile-api]', {
      requestKind,
      sessionId: typeof sessionId === 'string' ? sessionId : undefined,
      demoId: requestDemoId,
      pageId: requestDemoId,
      codeHash,
      codeLength,
      dependencies: resultWithModuleUrl.dependencies.length,
      cssImports: resultWithModuleUrl.cssImports.length,
      moduleHash: resultWithModuleUrl.moduleHash,
      elapsedMs: Date.now() - startedAt,
    });

    return NextResponse.json(createApiSuccess(resultWithModuleUrl));
  } catch (error) {
    console.error('编译错误:', {
      error,
      requestKind,
      codeLength,
      elapsedMs: Date.now() - startedAt,
    });

    if (error instanceof PreviewRuntimeContractError) {
      return NextResponse.json(
        createApiError('VALIDATION_ERROR', error.message, {
          issues: error.issues,
          demoId: requestDemoId,
          pageId: requestDemoId,
          codeHash,
          requestKind,
        }),
        { status: 422 },
      );
    }

    const message = error instanceof Error ? error.message : '编译失败';
    return NextResponse.json(
      createApiError('VALIDATION_ERROR', message),
      { status: 500 }
    );
  }
}
