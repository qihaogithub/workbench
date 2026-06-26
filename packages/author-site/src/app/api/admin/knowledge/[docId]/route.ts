import { NextRequest, NextResponse } from "next/server";

import { pushSystemKnowledgeToAgent } from "@/lib/agent-providers";
import { verifyAdminRequest } from "@/lib/admin-auth";
import {
  createSystemKnowledgeSnapshot,
  deleteSystemKnowledgeDocument,
  getSystemKnowledgeDocument,
  updateSystemKnowledgeDocument,
} from "@/lib/knowledge/system-knowledge";

function parseTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function pushKnowledgeSnapshot() {
  return pushSystemKnowledgeToAgent(createSystemKnowledgeSnapshot());
}

export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  const document = getSystemKnowledgeDocument(params.docId);
  if (!document) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "文档不存在" } },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: document });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const { document, summaryResult } = await updateSystemKnowledgeDocument(
      params.docId,
      {
        title: typeof body.title === "string" ? body.title : undefined,
        description:
          typeof body.description === "string" ? body.description : undefined,
        fileName: typeof body.fileName === "string" ? body.fileName : undefined,
        content: typeof body.content === "string" ? body.content : undefined,
        category: typeof body.category === "string" ? body.category : undefined,
        tags: parseTags(body.tags),
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        sortOrder:
          typeof body.sortOrder === "number" ? body.sortOrder : undefined,
        aiSummary:
          typeof body.aiSummary === "string" ? body.aiSummary : undefined,
        aiKeywords: parseTags(body.aiKeywords),
      },
    );

    if (!document) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "文档不存在" } },
        { status: 404 },
      );
    }

    const pushResult = await pushKnowledgeSnapshot();
    return NextResponse.json({
      success: true,
      data: document,
      summaryResult,
      agentPushResult: pushResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json(
      { success: false, error: { code: "UPDATE_FAILED", message } },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  const deleted = deleteSystemKnowledgeDocument(params.docId);
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "文档不存在" } },
      { status: 404 },
    );
  }

  const pushResult = await pushKnowledgeSnapshot();
  return NextResponse.json({ success: true, data: null, agentPushResult: pushResult });
}
