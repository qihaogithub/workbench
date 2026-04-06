import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class CustomBackend extends BaseAcpBackend {
  readonly name = 'custom' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
