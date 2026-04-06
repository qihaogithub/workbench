import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class GooseBackend extends BaseAcpBackend {
  readonly name = 'goose' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
