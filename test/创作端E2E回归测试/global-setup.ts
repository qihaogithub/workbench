import type { FullConfig } from '@playwright/test';

import { getE2EBaseURL } from './support/e2e-config';
import { createE2ERunState } from './support/e2e-projects';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use.baseURL ??
    config.use.baseURL ??
    getE2EBaseURL();

  const state = createE2ERunState(String(baseURL));
  console.log(`[e2e] runId=${state.runId}`);
}
