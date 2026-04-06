import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class AuggieBackend extends BaseAcpBackend {
  readonly name = 'auggie' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
