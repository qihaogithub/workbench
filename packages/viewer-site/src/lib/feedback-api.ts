/**
 * viewer-site 意见反馈 API 客户端。
 *
 * 跨域调用 author-site 的 /api/feedback REST API：
 * - 已登录用户：通过 X-Auth-Token 携带 JWT
 * - 匿名用户：通过 x-anonymous-id / x-anonymous-name header
 */
import { DATA_BASE, getAuthToken } from "./api";
import { getAnonymousId, getAnonymousDisplayName } from "./comment-api";
import type { FeedbackItem, FeedbackStatus } from "@workbench/shared";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  error?: { code: string; message?: string };
}

async function feedbackRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  const token = getAuthToken();
  if (token) headers["X-Auth-Token"] = token;
  headers["x-anonymous-id"] = getAnonymousId();
  headers["x-anonymous-name"] = encodeURIComponent(getAnonymousDisplayName());

  const res = await fetch(`${DATA_BASE}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as ApiEnvelope<T> & {
    error?: { message?: string };
  };
  if (!res.ok || body.success === false) {
    throw new Error(body.error?.message || `反馈请求失败 (${res.status})`);
  }
  return body.data;
}

export async function listFeedback(options?: {
  status?: FeedbackStatus;
  category?: string;
  severity?: string;
}): Promise<FeedbackItem[]> {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  if (options?.category) params.set("category", options.category);
  if (options?.severity) params.set("severity", options.severity);
  const qs = params.toString();
  return feedbackRequest<FeedbackItem[]>(`/api/feedback${qs ? `?${qs}` : ""}`);
}

export async function createFeedback(input: {
  category: string;
  severity: string;
  tags?: string[];
  title?: string;
  content: string;
  contact?: string;
}): Promise<FeedbackItem> {
  return feedbackRequest<FeedbackItem>("/api/feedback", {
    method: "POST",
    body: JSON.stringify({ ...input, source: "viewer-site" }),
  });
}
