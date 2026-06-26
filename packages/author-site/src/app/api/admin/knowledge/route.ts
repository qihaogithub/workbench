import { NextRequest, NextResponse } from "next/server";

import { pushSystemKnowledgeToAgent } from "@/lib/agent-providers";
import { verifyAdminRequest } from "@/lib/admin-auth";
import {
  createSystemKnowledgeDocument,
  createSystemKnowledgeSnapshot,
  listSystemKnowledgeDocuments,
} from "@/lib/knowledge/system-knowledge";

async function pushKnowledgeSnapshot() {
  return pushSystemKnowledgeToAgent(createSystemKnowledgeSnapshot());
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  return NextResponse.json({
    success: true,
    data: listSystemKnowledgeDocuments({ includeDisabled: true }),
  });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content : "";
    if (!title || !content.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "标题和正文必填" },
        },
        { status: 400 },
      );
    }

    const { document, summaryResult } = await createSystemKnowledgeDocument({
      title,
      description:
        typeof body.description === "string" ? body.description : undefined,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
      content,
      category: typeof body.category === "string" ? body.category : undefined,
      tags: parseTags(body.tags),
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      sortOrder:
        typeof body.sortOrder === "number" ? body.sortOrder : undefined,
      aiSummary:
        typeof body.aiSummary === "string" ? body.aiSummary : undefined,
      aiKeywords: parseTags(body.aiKeywords),
    });
    const pushResult = await pushKnowledgeSnapshot();

    return NextResponse.json(
      {
        success: true,
        data: document,
        summaryResult,
        agentPushResult: pushResult,
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建失败";
    return NextResponse.json(
      { success: false, error: { code: "CREATE_FAILED", message } },
      { status: 500 },
    );
  }
}
