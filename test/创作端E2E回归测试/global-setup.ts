import type { FullConfig } from '@playwright/test';

import { createE2ERunState } from './support/e2e-projects';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use.baseURL ??
    config.use.baseURL ??
    process.env.E2E_BASE_URL ??
    'http://localhost:3200';

  const state = createE2ERunState(String(baseURL));
  console.log(`[e2e] runId=${state.runId}`);
}
