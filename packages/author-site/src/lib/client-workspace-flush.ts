interface ClientWorkspaceFlushEnvelope {
  success?: boolean;
  error?: {
    message?: string;
  };
}

async function readFlushEnvelope(response: Response): Promise<ClientWorkspaceFlushEnvelope> {
  try {
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== "object") return {};
    return body as ClientWorkspaceFlushEnvelope;
  } catch {
    return {};
  }
}

export async function flushWorkspaceCollab(
  projectId: string,
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  if (!projectId || !workspaceId || !sessionId) return;

  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/workspace-flush`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, workspaceId }),
    },
  );
  const result = await readFlushEnvelope(response);

  if (!response.ok || result.success === false) {
    throw new Error(result.error?.message || "协同草稿同步失败");
  }
}
