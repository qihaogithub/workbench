import { NextRequest, NextResponse } from "next/server";

import { DocumentProposalStore } from "@workbench/project-core";

import { resolveUser } from "@/lib/comment-auth";
import { reconcileDocumentProposalFinalizations } from "@/lib/document-proposal-approval";
import { getDataDir, getSessionMeta, isSessionExpired, projectExists, sessionExists } from "@/lib/fs-utils";

async function authorize(request: NextRequest, projectId: string, proposalWorkspaceId: string) {
  const user = await resolveUser(request);
  if (!user) return { response: NextResponse.json({ success: false, error: { code: "UNAUTHORIZED" } }, { status: 401 }) };
  const sessionId = request.nextUrl.searchParams.get("sessionId") ?? "";
  if (!sessionId || !sessionExists(sessionId)) return { response: NextResponse.json({ success: false, error: { code: "SESSION_NOT_FOUND" } }, { status: 404 }) };
  const session = getSessionMeta(sessionId);
  if (!session || !session.userId || session.userId !== user.userId) return { response: NextResponse.json({ success: false, error: { code: "FORBIDDEN" } }, { status: 403 }) };
  if (session.demoId !== projectId || session.workspaceId !== proposalWorkspaceId || isSessionExpired(session)) return { response: NextResponse.json({ success: false, error: { code: "INVALID_REQUEST" } }, { status: 400 }) };
  return { user, sessionId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string; proposalId: string }> }) {
  const { projectId, proposalId } = await params;
  if (!projectExists(projectId)) return NextResponse.json({ success: false, error: { code: "PROJECT_NOT_FOUND" } }, { status: 404 });
  const proposal = new DocumentProposalStore({ dataDir: getDataDir() }).get(proposalId);
  if (!proposal || proposal.projectId !== projectId) return NextResponse.json({ success: false, error: { code: "PROPOSAL_NOT_FOUND" } }, { status: 404 });
  const auth = await authorize(request, projectId, proposal.workspaceId);
  if ("response" in auth) return auth.response;
  if (proposal.receipt && proposal.finalization?.status !== "completed") {
    await reconcileDocumentProposalFinalizations({ projectId });
  }
  return NextResponse.json({ success: true, data: new DocumentProposalStore({ dataDir: getDataDir() }).get(proposalId) });
}
