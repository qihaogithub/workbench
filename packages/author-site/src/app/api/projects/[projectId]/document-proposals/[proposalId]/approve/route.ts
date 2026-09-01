import { NextRequest, NextResponse } from "next/server";

import { DocumentProposalStore, DocumentProposalStoreError } from "@workbench/project-core";

import { resolveUser } from "@/lib/comment-auth";
import { approveDocumentProposal } from "@/lib/document-proposal-approval";
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
  if (!sessionId || !Number.isInteger(proposalVersion) || !idempotencyKey || idempotencyKey.length > 200) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST" } }, { status: 400 });
  const proposal = new DocumentProposalStore({ dataDir: getDataDir() }).get(proposalId);
  if (!proposal || proposal.projectId !== projectId) return NextResponse.json({ success: false, error: { code: "PROPOSAL_NOT_FOUND" } }, { status: 404 });
  if (!sessionExists(sessionId)) return NextResponse.json({ success: false, error: { code: "SESSION_NOT_FOUND" } }, { status: 404 });
  const session = getSessionMeta(sessionId);
  if (!session || !session.userId || session.userId !== user.userId) return NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  if (session.demoId !== projectId || session.workspaceId !== proposal.workspaceId || isSessionExpired(session)) return NextResponse.json({ success: false, error: { code: "INVALID_REQUEST" } }, { status: 400 });
  try {
    const applied = await approveDocumentProposal({ proposalId, proposalVersion, idempotencyKey, actorId: user.userId, sessionId });
    if (applied.status === "applied") await setDocumentProposalTaskStatus(projectId, proposalId, "done");
    return NextResponse.json({ success: true, data: applied });
  } catch (error) {
    const code = error instanceof DocumentProposalStoreError ? error.code : "WORKSPACE_MUTATION_FAILED";
    if (code === "WORKSPACE_RESOURCE_CONFLICT" || code === "PROPOSAL_EXPIRED") {
      await setDocumentProposalTaskStatus(projectId, proposalId, "failed");
    }
    const status = code === "PROPOSAL_VERSION_CONFLICT" ? 409 : code === "PROPOSAL_NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ success: false, error: { code } }, { status });
  }
}
