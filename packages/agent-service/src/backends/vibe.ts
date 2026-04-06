import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class VibeBackend extends BaseAcpBackend {
  readonly name = 'vibe' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
