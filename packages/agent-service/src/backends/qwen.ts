import { BaseAcpBackend } from './base-acp';
import { AgentConfig } from '../core/types';

export class QwenBackend extends BaseAcpBackend {
  readonly name = 'qwen' as const;

  constructor(config: AgentConfig) {
    super(config);
  }
}
