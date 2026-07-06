import { NextRequest, NextResponse } from 'next/server';
import { publishProject } from '@/lib/publish-manager';
import {
  createApiSuccess,
  createApiError,
  getWorkspaceMeta,
  readProjectMeta,
} from '@/lib/fs-utils';
import { getAuthCookie, verifyToken } from '@/lib/auth/jwt';
import {
  createEditSession,
  getEditSession,
} from '@/lib/session-manager';
import {
  flushAndSyncProjectWorkspace,
  getWorkspaceFlushErrorResponse,
} from "@/lib/workspace-flush";

interface PublishRequestBody {
  sessionId?: unknown;
  workspaceId?: unknown;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const token = getAuthCookie();
    if (!token) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '未登录'), { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json(createApiError('UNAUTHORIZED', '登录已过期'), { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PublishRequestBody;
    let sessionId = readNonEmptyString(body.sessionId);
    const workspaceId = readNonEmptyString(body.workspaceId);
    if (workspaceId) {
      let session = sessionId ? getEditSession(sessionId) : null;
      if (!session) {
        const workspaceMeta = getWorkspaceMeta(workspaceId);
        if (!workspaceMeta || workspaceMeta.demoId !== params.projectId) {
          return NextResponse.json(createApiError('SESSION_NOT_FOUND'), { status: 404 });
        }
        if (workspaceMeta.userId && workspaceMeta.userId !== payload.userId) {
          return NextResponse.json(createApiError('FORBIDDEN', '无权操作其他用户的 Workspace'), { status: 403 });
        }

        const resumed = await createEditSession(payload.userId, params.projectId, workspaceId);
        sessionId = resumed.sessionId;
        session = getEditSession(sessionId);
      }
      if (!session || !sessionId || session.demoId !== params.projectId) {
        return NextResponse.json(createApiError('SESSION_NOT_FOUND'), { status: 404 });
      }
      if (session.userId && session.userId !== payload.userId) {
        return NextResponse.json(createApiError('FORBIDDEN', '无权操作其他用户的 Session'), { status: 403 });
      }
      try {
        await flushAndSyncProjectWorkspace({
          projectId: params.projectId,
          workspaceId: session.workspaceId,
          sessionId,
        });
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }
    } else {
      const project = readProjectMeta(params.projectId);
      const activeUpdatedAt = project?.activeWorkspaceId
        ? getWorkspaceMeta(project.activeWorkspaceId)?.updatedAt ??
          project.activeWorkspaceUpdatedAt ??
          0
        : 0;
      if (
        project?.activeWorkspaceId &&
        (project.canonicalSyncedWorkspaceId !== project.activeWorkspaceId ||
          activeUpdatedAt > (project.canonicalSyncedAt ?? 0))
      ) {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', '发布前需要同步当前共享工作区'),
          { status: 400 },
        );
      }
      sessionId = undefined;
    }

    const result = await publishProject(params.projectId);
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'PROJECT_NOT_FOUND') {
        return NextResponse.json(createApiError('PROJECT_NOT_FOUND'), { status: 404 });
      }
      if (error.message === 'NO_CONTENT_TO_PUBLISH') {
        return NextResponse.json(createApiError('NO_CONTENT_TO_PUBLISH', '项目没有可发布的Demo页面'), { status: 400 });
      }
      if (error.message === 'SNAPSHOT_CREATE_ERROR') {
        return NextResponse.json(createApiError('SNAPSHOT_CREATE_ERROR', '创建发布快照失败'), { status: 500 });
      }
      if (error.message === 'IMAGE_LOCALIZATION_FAILED') {
        return NextResponse.json(
          createApiError('PUBLISH_FAILED', '发布图片资源本地化失败，请检查外部图片是否可访问后重试'),
          { status: 400 },
        );
      }
    }
    console.error('发布失败:', error);
    return NextResponse.json(createApiError('PUBLISH_FAILED'), { status: 500 });
  }
}
