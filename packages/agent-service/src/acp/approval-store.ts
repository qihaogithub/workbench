export interface AcpApprovalKey {
  kind: string;
  title: string;
  rawInput?: {
    command?: string;
    description?: string;
    [key: string]: unknown;
  };
}

function serializeKey(key: AcpApprovalKey): string {
  const normalizedInput: Record<string, unknown> = {};

  if (key.rawInput) {
    if (key.rawInput.command) {
      normalizedInput.command = key.rawInput.command;
    }
    if (key.rawInput.path) {
      normalizedInput.path = key.rawInput.path;
    }
    if (key.rawInput.file_path) {
      normalizedInput.file_path = key.rawInput.file_path;
    }
  }

  return JSON.stringify({
    kind: key.kind || 'unknown',
    title: key.title || '',
    rawInput: normalizedInput,
  });
}

export class AcpApprovalStore {
  private map: Map<string, string> = new Map();

  get(key: AcpApprovalKey): string | undefined {
    const serialized = serializeKey(key);
    return this.map.get(serialized);
  }

  put(key: AcpApprovalKey, optionId: string): void {
    if (optionId === 'allow_always') {
      const serialized = serializeKey(key);
      this.map.set(serialized, optionId);
    }
  }

  isApprovedForSession(key: AcpApprovalKey): boolean {
    return this.get(key) === 'allow_always';
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

export function createAcpApprovalKey(toolCall: {
  kind?: string;
  title?: string;
  rawInput?: Record<string, unknown>;
}): AcpApprovalKey {
  return {
    kind: toolCall.kind || 'unknown',
    title: toolCall.title || '',
    rawInput: toolCall.rawInput as AcpApprovalKey['rawInput'],
  };
}
