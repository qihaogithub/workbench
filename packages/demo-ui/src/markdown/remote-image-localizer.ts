export interface SessionRemoteImageResponse {
  success?: boolean;
  data?: {
    editPreviewUrl?: unknown;
  };
  error?: {
    message?: unknown;
  };
}

/** Localizes an external image through the current author session. */
export async function localizeRemoteImageForSession(
  sessionId: string,
  url: string,
): Promise<string> {
  if (!sessionId.trim()) throw new Error("当前会话不可用，无法保存外链图片");
  let response: Response;
  try {
    response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/assets/localize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: { kind: "selected-image", src: url, currentSrc: url },
        }),
      },
    );
  } catch {
    throw new Error("外链图片保存失败");
  }
  const payload = (await response.json().catch(() => null)) as
    | SessionRemoteImageResponse
    | null;
  const localizedUrl = payload?.data?.editPreviewUrl;
  if (
    !response.ok ||
    payload?.success !== true ||
    typeof localizedUrl !== "string" ||
    !localizedUrl
  ) {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "外链图片保存失败";
    throw new Error(message);
  }
  return localizedUrl;
}
