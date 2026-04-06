import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class QoderBackend extends BaseAcpBackend {
  readonly name = 'qoder' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
