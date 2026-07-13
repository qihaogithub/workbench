import * as fs from "fs";
import * as path from "path";

import type { NextRequest } from "next/server";

import { findWorkspacePath, getSessionMeta } from "@/lib/fs-utils";

export interface LiveWorkspaceRouteContext {
  sessionId: string;
  workspaceId: string;
  projectId: string;
}

export function isLiveWorkspacePath(workingDir: string): boolean {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(workingDir, ".workspace.json"), "utf-8"),
    ) as { scope?: unknown; status?: unknown };
    return meta.scope === "live" && meta.status !== "archived";
  } catch {
    return false;
  }
}

export function getLiveWorkspaceRouteContext(input: {
  request: NextRequest;
  workingDir: string;
  projectId: string | null;
}): LiveWorkspaceRouteContext | null {
  const sessionId = input.request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) return null;

  const session = getSessionMeta(sessionId);
  const workspacePath = session?.workspaceId
    ? findWorkspacePath(session.workspaceId)
    : null;
  if (
    !session?.workspaceId ||
    !workspacePath ||
    path.resolve(workspacePath) !== path.resolve(input.workingDir)
  ) {
    return null;
  }

  const resolvedProjectId = input.projectId || session.demoId;
  if (!resolvedProjectId || resolvedProjectId !== session.demoId) return null;

  return {
    sessionId,
    workspaceId: session.workspaceId,
    projectId: resolvedProjectId,
  };
}

