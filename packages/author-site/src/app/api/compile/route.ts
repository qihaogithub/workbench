import { NextRequest, NextResponse } from 'next/server';
import { createApiSuccess, createApiError, readProjectMeta, writeProjectMeta, getSessionMeta } from '@/lib/fs-utils';
import { compileCode, compileSession, resolveDependencyVersions } from '@/lib/compiler';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, sessionId, demoId } = body;

    let result;
    let projectId: string | undefined;

    if (code && typeof code === 'string') {
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
      result = compileCode(code, lockedDependencies);
    } else if (sessionId) {
      if (typeof sessionId !== 'string') {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', 'sessionId 必须为字符串'),
          { status: 400 }
        );
      }

      // 多页面模式下需要 demoId
      result = compileSession(sessionId, demoId);
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

    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    console.error('编译错误:', error);

    const message = error instanceof Error ? error.message : '编译失败';
    return NextResponse.json(
      createApiError('VALIDATION_ERROR', message),
      { status: 500 }
    );
  }
}
