import { NextRequest, NextResponse } from 'next/server';
import { publishProject, PublishError } from '@/lib/publish-manager';
import {
  createApiSuccess,
  createApiError,
  getWorkspaceMeta,
  readProjectMeta,
  writeProjectMeta,
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
  dryRun?: unknown;
  imageOptions?: unknown;
}

interface ParsedImageOptions {
  skip?: boolean;
  timeoutMs?: number;
  concurrency?: number;
}

function parseImageOptions(value: unknown): ParsedImageOptions | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const options: ParsedImageOptions = {};
  if (raw.skip === true) options.skip = true;
  if (typeof raw.timeoutMs === 'number' && raw.timeoutMs >= 1000) {
    options.timeoutMs = Math.min(raw.timeoutMs, 120_000);
  }
  if (typeof raw.concurrency === 'number' && raw.concurrency >= 1) {
    options.concurrency = Math.min(Math.floor(raw.concurrency), 16);
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

interface PublishWorkspaceProof {
  workspaceId: string;
  workspaceRevision: number;
  workspaceRootHash: string;
}

function hasCanonicalRevisionMetadata(project: {
  canonicalSyncedRevision?: number;
  canonicalSyncedRootHash?: string;
}): boolean {
  return (
    typeof project.canonicalSyncedRevision === "number" &&
    Number.isFinite(project.canonicalSyncedRevision) &&
    typeof project.canonicalSyncedRootHash === "string" &&
    project.canonicalSyncedRootHash.length > 0
  );
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
    let workspaceProof: PublishWorkspaceProof | undefined;
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
        const synced = await flushAndSyncProjectWorkspace({
          projectId: params.projectId,
          workspaceId: session.workspaceId,
          sessionId,
        });
        if (
          synced.canonicalRevision === undefined ||
          !synced.canonicalRootHash
        ) {
          return NextResponse.json(
            createApiError('WORKSPACE_STALE', '项目基准工作区尚未绑定 committed revision'),
            { status: 409 },
          );
        }
        workspaceProof = {
          workspaceId: session.workspaceId,
          workspaceRevision: synced.canonicalRevision,
          workspaceRootHash: synced.canonicalRootHash,
        };
      } catch (error) {
        const flushError = getWorkspaceFlushErrorResponse(error);
        return NextResponse.json(
          createApiError(flushError.code, flushError.message),
          { status: flushError.status },
        );
      }
    } else {
      const project = readProjectMeta(params.projectId);
      // 治本修复：activeWorkspaceId 指向已删除的 workspace 时，旧逻辑会让同步前置检查
      // 恒不满足、发布永远 400。此处视为无活跃工作区，清理悬空引用后放行。
      if (
        project?.activeWorkspaceId &&
        !getWorkspaceMeta(project.activeWorkspaceId)
      ) {
        console.warn(
          `[publish] activeWorkspaceId ${project.activeWorkspaceId} 指向不存在的 workspace，已自动清理`,
        );
        delete project.activeWorkspaceId;
        delete project.activeWorkspaceUpdatedAt;
        writeProjectMeta(params.projectId, project);
      }
      const activeUpdatedAt = project?.activeWorkspaceId
        ? getWorkspaceMeta(project.activeWorkspaceId)?.updatedAt ??
          project.activeWorkspaceUpdatedAt ??
          0
        : 0;
      if (
        project?.activeWorkspaceId &&
        (project.canonicalSyncedWorkspaceId !== project.activeWorkspaceId ||
          !hasCanonicalRevisionMetadata(project) ||
          activeUpdatedAt > (project.canonicalSyncedAt ?? 0))
      ) {
        return NextResponse.json(
          createApiError('INVALID_REQUEST', '发布前需要同步当前共享工作区'),
          { status: 400 },
        );
      }
      sessionId = undefined;
    }

    const imageOptions = parseImageOptions(body.imageOptions);
    const publishOptions: Parameters<typeof publishProject>[1] = {
      ...(workspaceProof ?? {}),
      ...(body.dryRun === true ? { dryRun: true as const } : {}),
      ...(imageOptions ? { imageOptions } : {}),
    };
    const result =
      Object.keys(publishOptions).length > 0
        ? await publishProject(params.projectId, publishOptions)
        : await publishProject(params.projectId);
    return NextResponse.json(createApiSuccess(result));
  } catch (error) {
    if (error instanceof PublishError) {
      const status =
        error.code === 'PROJECT_NOT_FOUND'
          ? 404
          : error.code === 'SNAPSHOT_CREATE_ERROR'
            ? 500
            : 400;
      return NextResponse.json(
        createApiError(error.code, error.message, error.details),
        { status },
      );
    }
    console.error('发布失败:', error);
    return NextResponse.json(
      createApiError(
        'PUBLISH_FAILED',
        error instanceof Error && error.message
          ? `发布失败：${error.message}`
          : undefined,
      ),
      { status: 500 },
    );
  }
}
