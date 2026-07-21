import {
  buildProjectManifest,
  createProjectArchive,
  diffProjectManifests,
  importProjectArchive,
  type ProjectImportResult,
  type ProjectManifest,
} from "../../project-core/src/project-transfer.js";

import {
  RemoteApiError,
  remoteFetch,
  remoteJson,
  remoteTokenWarnings,
  resolveRemoteTarget,
  type RemoteTargetArgs,
} from "./remote-api.js";

interface SyncCommandInput extends RemoteTargetArgs {
  dataDir: string;
  projectId: string;
}

function remoteLabel(remoteName: string | undefined, url: string): string {
  return remoteName ?? url;
}

async function readRemoteError(response: Response): Promise<RemoteApiError> {
  const payload = (await response.json().catch(() => null)) as
    | {
        error?: { code?: string; message?: string; details?: unknown };
      }
    | null;
  return new RemoteApiError(
    payload?.error?.code ?? `HTTP_${response.status}`,
    payload?.error?.message ?? `远程请求失败 (HTTP ${response.status})`,
    response.status === 401 ? ["重新执行 ow login"] : [],
    payload?.error?.details,
  );
}

export async function syncPush(input: SyncCommandInput) {
  const target = resolveRemoteTarget(input);
  const archive = await createProjectArchive(input.dataDir, input.projectId);
  const response = await remoteFetch(
    target,
    `/api/projects/${encodeURIComponent(input.projectId)}/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/gzip" },
      body: Uint8Array.from(archive).buffer,
    },
  );
  if (!response.ok) throw await readRemoteError(response);
  const payload = (await response.json()) as {
    success: boolean;
    data?: ProjectImportResult;
    error?: { code?: string; message?: string; details?: unknown };
  };
  if (!payload.success || !payload.data) {
    throw new RemoteApiError(
      payload.error?.code ?? "REMOTE_RESPONSE_INVALID",
      payload.error?.message ?? "远程导入响应缺少结果",
      [],
      payload.error?.details,
    );
  }
  return {
    ok: true as const,
    data: {
      projectId: input.projectId,
      direction: "push" as const,
      remote: remoteLabel(target.remoteName, target.url),
      archiveBytes: archive.byteLength,
      import: payload.data,
    },
    warnings: remoteTokenWarnings(target),
    nextActions: [
      `ow sync diff ${input.projectId}${target.remoteName ? ` --remote ${target.remoteName}` : ""} --json`,
      `ow publish project ${input.projectId}${target.remoteName ? ` --remote ${target.remoteName}` : ""} --dry-run --json`,
    ],
  };
}

export async function syncPull(input: SyncCommandInput) {
  const target = resolveRemoteTarget(input);
  const response = await remoteFetch(
    target,
    `/api/projects/${encodeURIComponent(input.projectId)}/export`,
  );
  if (!response.ok) throw await readRemoteError(response);
  const archive = Buffer.from(await response.arrayBuffer());
  const imported = await importProjectArchive(
    input.dataDir,
    input.projectId,
    archive,
  );
  return {
    ok: true as const,
    data: {
      projectId: input.projectId,
      direction: "pull" as const,
      remote: remoteLabel(target.remoteName, target.url),
      archiveBytes: archive.byteLength,
      import: imported,
    },
    warnings: remoteTokenWarnings(target),
    nextActions: [`ow project get ${input.projectId} --json`],
  };
}

export async function syncDiff(input: SyncCommandInput) {
  const target = resolveRemoteTarget(input);
  const local = buildProjectManifest(input.dataDir, input.projectId);
  const { status, payload } = await remoteJson<ProjectManifest>(
    target,
    `/api/projects/${encodeURIComponent(input.projectId)}/export?manifest=1`,
  );
  if (status < 200 || status >= 300 || !payload.success || !payload.data) {
    throw new RemoteApiError(
      payload.error?.code ?? `HTTP_${status}`,
      payload.error?.message ?? "获取远程项目清单失败",
      [],
      payload.error?.details,
    );
  }
  const diff = diffProjectManifests(local, payload.data);
  return {
    ok: true as const,
    data: {
      projectId: input.projectId,
      remote: remoteLabel(target.remoteName, target.url),
      local: {
        fileCount: local.fileCount,
        totalSize: local.totalSize,
      },
      remoteManifest: {
        fileCount: payload.data.fileCount,
        totalSize: payload.data.totalSize,
      },
      diff,
    },
    warnings: remoteTokenWarnings(target),
    nextActions: diff.identical
      ? []
      : [
          `ow sync push ${input.projectId}${target.remoteName ? ` --remote ${target.remoteName}` : ""} --json`,
          `ow sync pull ${input.projectId}${target.remoteName ? ` --remote ${target.remoteName}` : ""} --json`,
        ],
  };
}
