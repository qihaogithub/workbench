import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class KimiBackend extends BaseAcpBackend {
  readonly name = 'kimi' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
