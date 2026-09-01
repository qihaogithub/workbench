import type { DemoPageMeta } from "@workbench/shared";

export type ReferencedDesignSpec = {
  id: string;
  title: string;
  entries: Array<{ id: string; title: string; markdown: string }>;
};

export type ReferencedDesignSpecEntry = {
  docId: string;
  docTitle: string;
  entryId: string;
  entryTitle: string;
  markdown: string;
  scope: "project" | "page";
  pageId?: string;
  fieldKey: string;
};

export type CanvasPageContent = {
  pageId: string;
  code?: string;
  schema?: string;
  projectConfigSchema?: string;
  configData?: Record<string, unknown>;
  runtimeType?: DemoPageMeta["runtimeType"];
  prototypeHtml?: string;
  prototypeCss?: string;
  prototypeMeta?: Record<string, unknown>;
  sandboxHtml?: string;
  htmlImportMeta?: Record<string, unknown>;
  sandboxExecutionUrl?: string;
  sandboxChannelId?: string;
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
  requirements?: string;
  designSpecs?: ReferencedDesignSpec[];
  designSpecEntries?: ReferencedDesignSpecEntry[];
};

type ApiResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

type ApiRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

const TRANSIENT_JSON_RETRY_DELAYS_MS = [200, 600, 1200];

type SuccessfulPayload = {
  success?: boolean;
  data?: Omit<CanvasPageContent, "pageId">;
  error?: { message?: string };
};

function isSuccessfulPayload(value: unknown): value is SuccessfulPayload {
  return typeof value === "object" && value !== null;
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

/**
 * Turbopack may briefly return its HTML error document while it is compiling a
 * lazily visited dynamic API route. Retry only malformed JSON responses so a
 * normal JSON API error remains observable to the caller.
 */
async function requestJsonWithTransientRetry(
  request: (url: string, init?: ApiRequestInit) => Promise<ApiResponse>,
  url: string,
  init: ApiRequestInit | undefined,
  endpointLabel: string,
): Promise<{ response: ApiResponse; payload: unknown }> {
  for (
    let attempt = 0;
    attempt <= TRANSIENT_JSON_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    const response =
      init === undefined ? await request(url) : await request(url, init);
    try {
      return { response, payload: await response.json() };
    } catch (error) {
      if (
        !(error instanceof SyntaxError) ||
        attempt === TRANSIENT_JSON_RETRY_DELAYS_MS.length
      ) {
        throw new Error(`${endpointLabel} 返回了非 JSON 响应`, {
          cause: error,
        });
      }
      await waitForRetry(TRANSIENT_JSON_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw new Error(`${endpointLabel} 返回了非 JSON 响应`);
}

/**
 * 原型页只有在 HTML 具有实际内容时才能作为可渲染的已加载状态。
 *
 * 协同文档初始化会短暂提供空文本；仅依据缓存对象是否存在会把该中间状态
 * 误判成已加载，导致单页预览不再请求工作区中的真实原型文件。
 */
export function hasLoadedPrototypeHtml(html: string | undefined): boolean {
  return typeof html === "string" && html.trim().length > 0;
}

/**
 * Resolves a page's preview content from its owning workspace. Reference pages
 * do not have a local demos/<pageId> directory, so they must always go through
 * the reference endpoint which reads the current source-page content.
 */
export async function loadCanvasPageContent(input: {
  page: DemoPageMeta;
  projectId: string;
  sessionId: string;
  request?: (url: string, init?: ApiRequestInit) => Promise<ApiResponse>;
}): Promise<CanvasPageContent> {
  const request =
    input.request ?? ((url: string, init?: ApiRequestInit) => fetch(url, init));
  const encodedSessionId = encodeURIComponent(input.sessionId);
  const url = input.page.reference
    ? `/api/projects/${input.projectId}/reference-page/${input.page.id}?sessionId=${encodedSessionId}`
    : `/api/sessions/${input.sessionId}/files/${input.page.id}`;
  const { response, payload } = await requestJsonWithTransientRetry(
    request,
    url,
    undefined,
    "页面内容接口",
  );

  if (
    !response.ok ||
    !isSuccessfulPayload(payload) ||
    !payload.success ||
    !payload.data
  ) {
    const message =
      isSuccessfulPayload(payload) && payload.error?.message
        ? payload.error.message
        : "加载页面内容失败";
    throw new Error(message);
  }

  const pageData = { pageId: input.page.id, ...payload.data };

  // sandboxed-html 页面只能通过服务端签发的一次性执行票据运行。
  // 原始 HTML 永远不作为 iframe src 或客户端执行输入传递。
  if (input.page.runtimeType === "sandboxed-html" && !input.page.reference) {
    const { response: executionResponse, payload: executionPayload } =
      await requestJsonWithTransientRetry(
        request,
        `/api/projects/${encodeURIComponent(input.projectId)}/demos/${encodeURIComponent(input.page.id)}/html-execution`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: input.sessionId }),
        },
        "HTML 执行票据接口",
      );
    if (
      !executionResponse.ok ||
      !isSuccessfulPayload(executionPayload) ||
      !executionPayload.success ||
      !executionPayload.data ||
      typeof executionPayload.data !== "object"
    ) {
      const message =
        isSuccessfulPayload(executionPayload) && executionPayload.error?.message
          ? executionPayload.error.message
          : "创建 HTML 预览执行票据失败";
      throw new Error(message);
    }
    const executionData = executionPayload.data as Record<string, unknown>;
    return {
      ...pageData,
      sandboxExecutionUrl:
        typeof executionData.executionUrl === "string"
          ? executionData.executionUrl
          : undefined,
      sandboxChannelId:
        typeof executionData.channelId === "string"
          ? executionData.channelId
          : undefined,
    };
  }

  return pageData;
}
