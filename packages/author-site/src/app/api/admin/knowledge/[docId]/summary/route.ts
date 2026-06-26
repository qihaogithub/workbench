import { NextRequest, NextResponse } from "next/server";

import { pushSystemKnowledgeToAgent } from "@/lib/agent-providers";
import { verifyAdminRequest } from "@/lib/admin-auth";
import {
  createSystemKnowledgeSnapshot,
  generateAndSaveSummary,
  getSystemKnowledgeDocument,
} from "@/lib/knowledge/system-knowledge";

export async function POST(
  request: NextRequest,
  { params }: { params: { docId: string } },
) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHORIZED", message: "未授权访问" } },
      { status: 401 },
    );
  }

  const summaryResult = await generateAndSaveSummary(params.docId, "admin");
  const document = getSystemKnowledgeDocument(params.docId);
  if (!document) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "文档不存在" } },
      { status: 404 },
    );
  }

  const pushResult = await pushSystemKnowledgeToAgent(
    createSystemKnowledgeSnapshot(),
  );
  return NextResponse.json({
    success: true,
    data: document,
    summaryResult,
    agentPushResult: pushResult,
  });
}
