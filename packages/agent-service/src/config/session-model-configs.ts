import type { BackendProvidersConfig } from "@opencode-workbench/shared/contracts";

class SessionModelConfigs {
  private configs = new Map<string, BackendProvidersConfig>();

  set(sessionId: string, config: BackendProvidersConfig): void {
    this.configs.set(sessionId, config);
  }

  get(sessionId: string): BackendProvidersConfig | undefined {
    return this.configs.get(sessionId);
  }

  delete(sessionId: string): void {
    this.configs.delete(sessionId);
  }
}

let globalStore: SessionModelConfigs | null = null;

export function getSessionModelConfigs(): SessionModelConfigs {
  if (!globalStore) {
    globalStore = new SessionModelConfigs();
  }
  return globalStore;
}
