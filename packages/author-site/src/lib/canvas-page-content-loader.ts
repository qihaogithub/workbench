import type { DemoPageMeta } from "@workbench/shared";

export type ReferencedDesignSpec = {
  id: string;
  title: string;
  entries: Array<{ id: string; title: string; markdown: string }>;
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

type SuccessfulPayload = {
  success?: boolean;
  data?: Omit<CanvasPageContent, "pageId">;
  error?: { message?: string };
};

function isSuccessfulPayload(value: unknown): value is SuccessfulPayload {
  return typeof value === "object" && value !== null;
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
  const request = input.request ?? ((url: string) => fetch(url));
  const encodedSessionId = encodeURIComponent(input.sessionId);
  const url = input.page.reference
    ? `/api/projects/${input.projectId}/reference-page/${input.page.id}?sessionId=${encodedSessionId}`
    : `/api/sessions/${input.sessionId}/files/${input.page.id}`;
  const response = await request(url);
  const payload = await response.json();

  if (!response.ok || !isSuccessfulPayload(payload) || !payload.success || !payload.data) {
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
    const executionResponse = await request(
      `/api/projects/${encodeURIComponent(input.projectId)}/demos/${encodeURIComponent(input.page.id)}/html-execution`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: input.sessionId }),
      },
    );
    const executionPayload = await executionResponse.json();
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
