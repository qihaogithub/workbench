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
  sketchScene?: string;
  sketchMeta?: Record<string, unknown>;
  requirements?: string;
  designSpecs?: ReferencedDesignSpec[];
};

type ApiResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
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
  request?: (url: string) => Promise<ApiResponse>;
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

  return { pageId: input.page.id, ...payload.data };
}
