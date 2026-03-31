const OPENCODE_SERVER_URL = process.env.OPENCODE_SERVER_URL || 'http://localhost:4096';

export interface OpenCodeSession {
  id: string;
  title?: string;
}

export interface OpenCodeMessagePart {
  type: 'text';
  text: string;
}

export interface OpenCodeMessageResponse {
  info: Record<string, unknown>;
  parts: Array<{ type: string; text?: string }>;
}

export interface OpenCodeFileContent {
  path: string;
  content: string;
}

export interface OpenCodeFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'unchanged';
}

export async function createOpencodeSession(title: string): Promise<OpenCodeSession> {
  const res = await fetch(`${OPENCODE_SERVER_URL}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`创建 opencode session 失败: ${await res.text()}`);
  }

  return res.json();
}

export async function sendOpencodeMessage(
  sessionId: string,
  text: string
): Promise<OpenCodeMessageResponse> {
  const res = await fetch(`${OPENCODE_SERVER_URL}/session/${sessionId}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parts: [{ type: 'text', text }],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    throw new Error(`发送消息失败: ${await res.text()}`);
  }

  return res.json();
}

export async function readOpencodeFile(
  sessionId: string,
  filePath: string
): Promise<string> {
  const url = `${OPENCODE_SERVER_URL}/file/content?path=${encodeURIComponent(filePath)}&sessionId=${sessionId}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`读取文件失败: ${await res.text()}`);
  }

  const data = await res.json();
  return data.content || '';
}

export async function getFileStatus(
  sessionId: string
): Promise<OpenCodeFileStatus[]> {
  const url = `${OPENCODE_SERVER_URL}/file/status?sessionId=${sessionId}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`获取文件状态失败: ${await res.text()}`);
  }

  return res.json();
}
