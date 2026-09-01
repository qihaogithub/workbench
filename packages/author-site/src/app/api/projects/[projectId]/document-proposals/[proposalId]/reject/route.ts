import { NextRequest, NextResponse } from "next/server";

import { DocumentProposalStore, DocumentProposalStoreError } from "@workbench/project-core";

import { resolveUser } from "@/lib/comment-auth";
import { setDocumentProposalTaskStatus } from "@/lib/comment-store";
import { getDataDir, getSessionMeta, isSessionExpired, projectExists, sessionExists } from "@/lib/fs-utils";

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string; proposalId: string }> }) {
  const { projectId, proposalId } = await params;
  const user = await resolveUser(request);
  if (!user) return NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 });
  if (!projectExists(projectId)) return NextResponse.json({ success: false, error: { code: "PROJECT_NOT_FOUND" } }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const proposalVersion = typeof body.proposalVersion === "number" ? body.proposalVersion : NaN;
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
  const store = new DocumentProposalStore({ dataDir: getDataDir() });
  const proposal = store.get(proposalId);
  if (!proposal || proposal.projectId !== projectId) return NextResponse.json({ success: false, error: { code: "PROPOSAL_NOT_FOUND" } }, { status: 404 });
  if (!sessionId || !Number.isInteger(proposalVersion) || !idempotencyKey || !sessionExists(sessionId)) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST" } }, { status: 400 });
  const session = getSessionMeta(sessionId);
  if (!session || !session.userId || session.userId !== user.userId || session.demoId !== projectId || session.workspaceId !== proposal.workspaceId || isSessionExpired(session)) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  try {
    const rejected = store.reject(proposalId, proposalVersion, { id: user.userId }, idempotencyKey).proposal;
    await setDocumentProposalTaskStatus(projectId, proposalId, "failed");
    return NextResponse.json({ success: true, data: rejected });
  } catch (error) {
    const code = error instanceof DocumentProposalStoreError ? error.code : "INVALID_REQUEST";
    return NextResponse.json({ success: false, error: { code } }, { status: 409 });
  }
}
