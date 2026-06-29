import type { ExternalAuthSessionConfig } from "@opencode-workbench/shared/contracts";

class SessionExternalAuthConfigs {
  private configs = new Map<string, ExternalAuthSessionConfig>();

  set(sessionId: string, config: ExternalAuthSessionConfig): void {
    this.configs.set(sessionId, config);
  }

  get(sessionId: string): ExternalAuthSessionConfig | undefined {
    return this.configs.get(sessionId);
  }

  delete(sessionId: string): void {
    this.configs.delete(sessionId);
  }
}

let globalStore: SessionExternalAuthConfigs | null = null;

export function getSessionExternalAuthConfigs(): SessionExternalAuthConfigs {
  if (!globalStore) {
    globalStore = new SessionExternalAuthConfigs();
  }
  return globalStore;
}
