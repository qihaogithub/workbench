import { NextRequest, NextResponse } from "next/server";
import { getAuthCookie, verifyToken } from "@/lib/auth/jwt";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";
import {
  listFeedback,
  createFeedback,
  type ListFeedbackOptions,
} from "@/lib/feedback-store";
import type {
  FeedbackCategory,
  FeedbackSeverity,
} from "@workbench/shared";

const VALID_CATEGORIES: FeedbackCategory[] = ["bug", "suggestion", "question", "other"];
const VALID_SEVERITIES: FeedbackSeverity[] = ["high", "medium", "low"];

async function resolveUser(request: NextRequest) {
  const cookieToken = getAuthCookie();
  if (cookieToken) {
    const payload = await verifyToken(cookieToken);
    if (payload) return payload;
  }
  const headerToken = request.headers.get("x-auth-token");
  if (headerToken) {
    const payload = await verifyToken(headerToken);
    if (payload) return payload;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const options: ListFeedbackOptions = {};

  const status = searchParams.get("status");
  if (status === "open" || status === "in_progress" || status === "done") {
    options.status = status;
  }
  const category = searchParams.get("category");
  if (category && VALID_CATEGORIES.includes(category as FeedbackCategory)) {
    options.category = category as FeedbackCategory;
  }
  const severity = searchParams.get("severity");
  if (severity && VALID_SEVERITIES.includes(severity as FeedbackSeverity)) {
    options.severity = severity as FeedbackSeverity;
  }

  const items = listFeedback(options);
  return NextResponse.json(createApiSuccess(items));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, severity, tags, title, content, contact } = body;

    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", "反馈内容不能为空"), { status: 400 });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", `无效的反馈类别: ${category}`), { status: 400 });
    }
    if (!severity || !VALID_SEVERITIES.includes(severity)) {
      return NextResponse.json(createApiError("VALIDATION_ERROR", `无效的严重程度: ${severity}`), { status: 400 });
    }

    let author = {
      id: request.headers.get("x-anonymous-id") || `anon_${Date.now().toString(36)}`,
      name: decodeURIComponent(request.headers.get("x-anonymous-name") || "") || "匿名用户",
      isAnonymous: true,
      contact: typeof contact === "string" ? contact : undefined,
    };

    const user = await resolveUser(request);
    if (user) {
      author = {
        id: user.userId,
        name: user.username,
        isAnonymous: false,
        contact: typeof contact === "string" ? contact : undefined,
      };
    }

    const item = createFeedback({
      category,
      severity,
      tags: Array.isArray(tags) ? tags.map(String) : undefined,
      title: typeof title === "string" ? title : undefined,
      content: content.trim(),
      author,
      channel: "manual",
      source: body.source === "viewer-site" ? "viewer-site" : "author-site",
    });

    return NextResponse.json(createApiSuccess(item), { status: 201 });
  } catch {
    return NextResponse.json(createApiError("VALIDATION_ERROR", "请求格式错误"), { status: 400 });
  }
}
