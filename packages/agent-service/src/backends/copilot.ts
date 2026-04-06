import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class CopilotBackend extends BaseAcpBackend {
  readonly name = 'copilot' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
