interface ClientWorkspaceFlushEnvelope {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
}

export class ClientWorkspaceFlushError extends Error {
  readonly code?: string;
  readonly status: number;

  constructor(message: string, options: { code?: string; status: number }) {
    super(message);
    this.name = "ClientWorkspaceFlushError";
    this.code = options.code;
    this.status = options.status;
  }
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
    throw new ClientWorkspaceFlushError(
      result.error?.message || "协同草稿同步失败",
      {
        code: result.error?.code,
        status: response.status || 0,
      },
    );
  }
}
