import { chromium } from "@playwright/test";

import {
  deleteE2EProject,
  type E2EProjectMeta,
  getE2ERunState,
  isStaleE2EProject,
  listProjects,
  readE2EProjectRegistry,
} from "./support/e2e-projects";
import { loginE2EUser } from "./support/e2e-auth";

export default async function globalTeardown(): Promise<void> {
  const state = getE2ERunState();
  // Project APIs require the same authenticated actor as the test page.  A
  // plain request context has no auth cookie, which used to leave every
  // registered fixture behind and made the cleanup warnings misleading.
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: state.baseURL });
  await loginE2EUser(page, {
    baseURL: state.baseURL,
    username: process.env.E2E_USER ?? "qihao",
    password: process.env.E2E_PASSWORD ?? "130015",
  });
  const api = page.request;

  try {
    const registry = readE2EProjectRegistry(state.registryPath);
    const registeredIds = new Set<string>();

    for (const project of registry.projects) {
      registeredIds.add(project.id);
      const result = await deleteE2EProject(api, project.id);
      if (!result.ok) {
        console.warn(
          `[e2e] failed to delete registered project ${project.id} ${project.name}: ${result.status} ${result.body}`,
        );
      }
    }

    let projects: E2EProjectMeta[] = [];
    try {
      projects = await listProjects(api);
    } catch (error) {
      console.warn(
        `[e2e] failed to list projects for stale cleanup: ${String(error)}`,
      );
      return;
    }

    for (const project of projects.filter(
      (item) => !registeredIds.has(item.id),
    )) {
      if (!isStaleE2EProject(project)) continue;
      const result = await deleteE2EProject(api, project.id);
      if (!result.ok) {
        console.warn(
          `[e2e] failed to delete stale project ${project.id} ${project.name}: ${result.status} ${result.body}`,
        );
      }
    }
  } finally {
    await browser.close();
  }
}
