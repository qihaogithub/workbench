import { NextRequest, NextResponse } from "next/server";
import {
  claimWhiteboardDraftImage,
  collectExpiredWhiteboardImages,
  getImage,
  getImageInfo,
  releaseWhiteboardDraftImage,
  discardUnclaimedImage,
  uploadImage,
} from "@/lib/image-store";
import {
  createApiError,
  createApiSuccess,
  getSessionMeta,
  isSessionExpired,
  projectExists,
  sessionExists,
} from "@/lib/fs-utils";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import {
  getInternalApiToken,
  getServerAgentServiceUrl,
} from "@/lib/runtime-config";

type GenerationBody = {
  sessionId?: unknown;
  draftId?: unknown;
  prompt?: unknown;
  count?: unknown;
  qualityId?: unknown;
  sizeId?: unknown;
  width?: unknown;
  height?: unknown;
  referenceAssetIds?: unknown;
};

type AgentCapabilities = {
  enabled?: boolean;
  model?: string;
  qualityIds?: string[];
  sizeIds?: string[];
  maxCount?: number;
  remainingCount?: number;
  supportsReferences?: boolean;
  maxPromptLength?: number;
};

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function describeSize(id: string) {
  if (id === "auto") return { id, label: "自动" };
  const match = /^(\d+)x(\d+)$/.exec(id);
  if (!match) return { id, label: id };
  const width = Number(match[1]);
  const height = Number(match[2]);
  const divisor = greatestCommonDivisor(width, height);
  return {
    id,
    label:
      String(width / divisor) +
      ":" +
      String(height / divisor) +
      " · " +
      String(width) +
      "×" +
      String(height),
    width,
    height,
  };
}

function describeQuality(id: string) {
  const labels: Record<string, string> = {
    auto: "自动",
    low: "低",
    medium: "中",
    high: "高",
    standard: "标准",
    hd: "高清",
  };
  return { id, label: labels[id] ?? id };
}

async function getAgentCapabilities(
  signal?: AbortSignal,
  sessionId?: string,
): Promise<AgentCapabilities> {
  const response = await fetch(
    getServerAgentServiceUrl() + "/internal/image-gen/capabilities" +
      (sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : ""),
    {
      headers: { "X-Internal-Token": getInternalApiToken() },
      signal: signal ?? AbortSignal.timeout(8_000),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    data?: AgentCapabilities;
  } | null;
  if (!response.ok || !payload?.data)
    throw new Error("capabilities unavailable");
  return payload.data;
}

async function authProject(projectId: string) {
  if (!projectExists(projectId))
    return {
      response: NextResponse.json(createApiError("PROJECT_NOT_FOUND"), {
        status: 404,
      }),
    };
  const token = await getAuthCookie();
  const user = token ? await verifyToken(token) : null;
  if (!user)
    return {
      response: NextResponse.json(
        createApiError("UNAUTHORIZED", "登录已过期"),
        { status: 401 },
      ),
    };
  return { user };
}

function validDraft(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

function sessionAllowed(projectId: string, sessionId: string, userId: string) {
  const meta = sessionExists(sessionId) ? getSessionMeta(sessionId) : null;
  return Boolean(
    meta &&
      meta.demoId === projectId &&
      (!meta.userId || meta.userId === userId) &&
      !isSessionExpired(meta),
  );
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authProject(projectId);
  if (auth.response) return auth.response;
  const body = new URL(_request.url).searchParams;
  const sessionId = body.get("sessionId") || "";
  if (!sessionId || !sessionAllowed(projectId, sessionId, auth.user.userId))
    return NextResponse.json(
      createApiError("FORBIDDEN", "无权访问白板绘图能力"),
      { status: 403 },
    );
  try {
    const raw = await getAgentCapabilities(undefined, sessionId);
    const supportsReferences = Boolean(raw.supportsReferences);
    const quotaAvailable = raw.remainingCount === undefined || raw.remainingCount > 0;
    const enabled = Boolean(raw.enabled) && quotaAvailable;
    const maxImages = Math.max(1, Math.min(4, raw.maxCount ?? 1, raw.remainingCount ?? 4));
    return NextResponse.json(
      createApiSuccess({
        enabled,
        ...(enabled ? {} : {
          unavailableReason: quotaAvailable ? "管理员尚未启用 AI 绘图服务" : "本会话 AI 绘图配额已用完",
        }),
        modelId: raw.model ?? "auto",
        qualities: (raw.qualityIds ?? ["auto"]).map(describeQuality),
        sizes: (raw.sizeIds ?? ["1024x1024"]).map(describeSize),
        maxImages,
        maxReferences: supportsReferences ? 4 : 0,
        supportsReferences,
        allowCustomSize: false,
        maxPromptLength: Math.max(1, raw.maxPromptLength ?? 10_000),
      }),
    );
  } catch {
    return NextResponse.json(
      createApiError("AGENT_SERVICE_ERROR", "AI 绘图服务暂不可用，请稍后重试"),
      { status: 502 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const auth = await authProject(projectId);
  if (auth.response) return auth.response;
  collectExpiredWhiteboardImages();
  const body = (await request
    .json()
    .catch(() => null)) as GenerationBody | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const draftId = body?.draftId;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const count =
    typeof body?.count === "number" ? body.count : Number(body?.count);
  const qualityId = typeof body?.qualityId === "string" ? body.qualityId : "";
  const sizeId = typeof body?.sizeId === "string" ? body.sizeId : "";
  const width = body?.width === undefined ? undefined : Number(body.width);
  const height = body?.height === undefined ? undefined : Number(body.height);
  const ids = Array.isArray(body?.referenceAssetIds)
    ? body.referenceAssetIds
    : [];
  if (
    !sessionId ||
    !validDraft(draftId) ||
    !sessionAllowed(projectId, sessionId, auth.user.userId) ||
    !qualityId ||
    !sizeId ||
    (width !== undefined &&
      (!Number.isInteger(width) || width < 64 || width > 4096)) ||
    (height !== undefined &&
      (!Number.isInteger(height) || height < 64 || height > 4096)) ||
    ids.length > 4 ||
    !ids.every(validDraft)
  ) {
    return NextResponse.json(
      createApiError(
        "INVALID_REQUEST",
        "AI 绘图参数无效，请检查提示词、尺寸和参考图",
      ),
      { status: 400 },
    );
  }
  let capabilities: AgentCapabilities;
  try {
    capabilities = await getAgentCapabilities(request.signal, sessionId);
  } catch {
    return NextResponse.json(
      createApiError("AGENT_SERVICE_ERROR", "AI 绘图服务暂不可用，请稍后重试"),
      { status: 502 },
    );
  }
  if (
    !capabilities.enabled ||
    prompt.length < 1 ||
    prompt.length > (capabilities.maxPromptLength ?? 10_000) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > Math.min(4, capabilities.maxCount ?? 1) ||
    !(capabilities.qualityIds ?? []).includes(qualityId) ||
    !(capabilities.sizeIds ?? []).includes(sizeId) ||
    (ids.length > 0 && !capabilities.supportsReferences) ||
    width !== undefined ||
    height !== undefined
  ) {
    return NextResponse.json(
      createApiError(
        "INVALID_REQUEST",
        "当前模型不支持所选的质量、尺寸、数量或参考图",
      ),
      { status: 400 },
    );
  }
  const references: { mimeType: string; dataBase64: string }[] = [];
  for (const id of ids) {
    const info = getImageInfo(id);
    if (!info?.whiteboardDrafts?.[draftId])
      return NextResponse.json(
        createApiError("FORBIDDEN", "参考图不属于当前白板草稿"),
        { status: 403 },
      );
    const image = getImage(id);
    if (!image.buffer || !image.mimeType)
      return NextResponse.json(
        createApiError("VALIDATION_ERROR", "参考图资源已失效，请重新添加"),
        { status: 422 },
      );
    references.push({
      mimeType: image.mimeType,
      dataBase64: image.buffer.toString("base64"),
    });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  let claimed: string[] = [];
  try {
    const upstream = await fetch(
      `${getServerAgentServiceUrl()}/internal/image-gen/generate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": getInternalApiToken(),
        },
        body: JSON.stringify({
          sessionId,
          prompt,
          count,
          qualityId,
          sizeId,
          references,
        }),
        signal: controller.signal,
      },
    );
    const payload = (await upstream.json().catch(() => null)) as {
      data?: {
        images?: Array<{
          dataBase64?: string;
          mimeType?: string;
          width?: number;
          height?: number;
        }>;
      };
      error?: { message?: string };
    } | null;
    if (!upstream.ok || payload?.data?.images?.length !== count)
      throw new Error(payload?.error?.message || "AI 绘图服务未返回图片");
    const images = [];
    for (const [index, generated] of payload.data.images.entries()) {
      if (!generated.dataBase64) throw new Error("生成图片数据无效");
      const mime = generated.mimeType?.startsWith("image/")
        ? generated.mimeType
        : "image/png";
      const ext = mime === "image/jpeg" ? "jpg" : "png";
      const saved = await uploadImage({
        buffer: Buffer.from(generated.dataBase64, "base64"),
        filename: `whiteboard-ai-${Date.now()}-${index}.${ext}`,
        sourceType: "ai_generated",
        createdBy: auth.user.userId,
      });
      if (!saved.success) throw new Error(saved.error.message);
      claimed.push(saved.imageId);
      if (!claimWhiteboardDraftImage(saved.imageId, draftId)) {
        discardUnclaimedImage(saved.imageId);
        throw new Error("生成图片无法登记到白板草稿");
      }
      images.push({
        id: saved.imageId,
        src: saved.url,
        mimeType: saved.mimeType,
        width: generated.width ?? saved.width,
        height: generated.height ?? saved.height,
      });
    }
    return NextResponse.json(createApiSuccess({ images }));
  } catch (error) {
    for (const imageId of claimed)
      releaseWhiteboardDraftImage(imageId, draftId);
    if (controller.signal.aborted)
      return NextResponse.json(
        createApiError("AGENT_SERVICE_ERROR", "已取消 AI 绘图"),
        { status: 499 },
      );
    return NextResponse.json(
      createApiError(
        "AGENT_SERVICE_ERROR",
        error instanceof Error ? error.message : "AI 绘图失败，请稍后重试",
      ),
      { status: 502 },
    );
  } finally {
    request.signal.removeEventListener("abort", abort);
  }
}
