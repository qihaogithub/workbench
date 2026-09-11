import type { APIResponse, Page } from "@playwright/test";

import { E2E_BASE_URL } from "./e2e-config";
import { createE2EProject } from "./e2e-projects";

function absoluteApiUrl(pathname: string): string {
  return new URL(pathname, E2E_BASE_URL).toString();
}

export const PREVIEW_OBSERVATION_FIXTURE_HTML = `
<main data-ow-id="obs-shell" data-source-file="fixtures/preview-observation.tsx" data-source-line="1">
  <section class="obs-grid" data-ow-id="obs-grid" data-source-file="fixtures/preview-observation.tsx" data-source-line="10">
    <div class="obs-marker obs-northwest" data-ow-id="obs-northwest" data-source-file="fixtures/preview-observation.tsx" data-source-line="20">northwest</div>
    <div class="obs-marker obs-northeast" data-ow-id="obs-northeast" data-source-file="fixtures/preview-observation.tsx" data-source-line="21">northeast</div>
    <div class="obs-marker obs-southwest" data-ow-id="obs-southwest" data-source-file="fixtures/preview-observation.tsx" data-source-line="22">southwest</div>
    <div class="obs-marker obs-southeast" data-ow-id="obs-southeast" data-source-file="fixtures/preview-observation.tsx" data-source-line="23">southeast</div>
    <div class="obs-marker obs-center" data-ow-id="obs-center" data-source-file="fixtures/preview-observation.tsx" data-source-line="24">center marker</div>
  </section>
  <section class="obs-scroll" data-ow-id="obs-scroll" data-source-file="fixtures/preview-observation.tsx" data-source-line="30">
    <div class="obs-scroll-item" data-ow-id="obs-scroll-item" data-source-file="fixtures/preview-observation.tsx" data-source-line="31">scroll target</div>
  </section>
  <section class="obs-transform" data-ow-id="obs-transform" data-source-file="fixtures/preview-observation.tsx" data-source-line="40">
    <div data-ow-id="obs-transform-child">transformed target</div>
  </section>
  <section class="obs-overflow" data-ow-id="obs-overflow" data-source-file="fixtures/preview-observation.tsx" data-source-line="50">
    <div class="obs-overflow-child" data-ow-id="obs-overflow-child">overflow target</div>
  </section>
  <div data-ow-id="obs-display-none" class="obs-display-none">display none</div>
  <div data-ow-id="obs-visibility-hidden" class="obs-visibility-hidden">visibility hidden</div>
  <div data-ow-id="obs-opacity-zero" class="obs-opacity-zero">opacity zero</div>
  <img data-ow-id="obs-failing-image" src="./missing-observation-image.png" alt="synthetic failing image" />
  <div data-source-file="fixtures/preview-observation.tsx" data-source-line="99">ambiguous source one</div>
  <div data-source-file="fixtures/preview-observation.tsx" data-source-line="99">ambiguous source two</div>
</main>
`;

export const PREVIEW_OBSERVATION_FIXTURE_CSS = `
  :host { display: block; }
  .prototype-root { padding: 16px; min-height: 640px; background: #f8fafc; color: #0f172a; }
  .obs-grid { position: relative; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; width: 100%; min-height: 160px; padding: 12px; border: 1px solid #cbd5e1; }
  .obs-marker { min-height: 44px; padding: 12px; border-radius: 6px; background: #dbeafe; }
  .obs-center { position: absolute; left: 50%; top: 50%; width: 140px; transform: translate(-50%, -50%); text-align: center; background: #bbf7d0; }
  .obs-scroll { height: 72px; margin-top: 12px; overflow: auto; border: 1px solid #f59e0b; }
  .obs-scroll-item { height: 260px; padding: 8px; background: #fef3c7; }
  .obs-transform { margin-top: 12px; height: 48px; transform: translate(8px, 4px); border: 1px solid #a78bfa; }
  .obs-transform-child { padding: 8px; }
  .obs-overflow { width: 100%; height: 48px; margin-top: 12px; overflow: hidden; border: 1px solid #ef4444; }
  .obs-overflow-child { width: 180%; padding: 8px; }
  .obs-display-none { display: none; }
  .obs-visibility-hidden { visibility: hidden; }
  .obs-opacity-zero { opacity: 0; }
  .obs-failing-image { display: block; width: 32px; height: 32px; margin-top: 12px; }
`;

/** A valid high-fidelity page whose ErrorBoundary reports a runtime failure during render. */
export const PREVIEW_OBSERVATION_RUNTIME_ERROR_CODE = `import React from "react";

export default function PreviewObservationRuntimeError() {
  throw new Error("synthetic preview runtime observation error");
}
`;

/** An intentionally invalid authoring source used to verify fail-closed observation. */
export const PREVIEW_OBSERVATION_COMPILE_FAILURE_CODE = "not a preview module";

export type PreviewObservationFixture = {
  projectId: string;
  sessionId: string;
  workspaceId?: string;
  pageId: string;
};

export type PreviewObservationPageOptions = {
  name?: string;
  runtimeType?: "prototype-html-css" | "high-fidelity-react";
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

async function parseApi<T>(response: APIResponse): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok() || !body.success || body.data === undefined) {
    throw new Error(
      `E2E API failed (${response.status()}): ${JSON.stringify(body)}`,
    );
  }
  return body.data;
}

/** Adds a second page to an existing observation fixture for page-switch tests. */
export async function addPreviewObservationPage(
  page: Page,
  fixture: PreviewObservationFixture,
  options: PreviewObservationPageOptions = {},
): Promise<string> {
  const runtimeType = options.runtimeType ?? "prototype-html-css";
  const demoPage = await parseApi<{ id: string }>(
    await page.request.post(
      absoluteApiUrl(`/api/projects/${fixture.projectId}/demos`),
      {
        data: {
          sessionId: fixture.sessionId,
          name: options.name ?? "观察验收切换页",
          runtimeType,
        },
      },
    ),
  );
  await parseApi<unknown>(
    await page.request.put(
      absoluteApiUrl(`/api/sessions/${fixture.sessionId}/files/${demoPage.id}`),
      {
        data:
          runtimeType === "high-fidelity-react"
            ? {
                code: "export default function PreviewObservationSwitch() { return null; }",
              }
            : {
                prototypeHtml: PREVIEW_OBSERVATION_FIXTURE_HTML,
                prototypeCss: PREVIEW_OBSERVATION_FIXTURE_CSS,
              },
      },
    ),
  );
  return demoPage.id;
}

/** Creates a live prototype page and commits fixture HTML/CSS through the public author APIs. */
export async function createPreviewObservationFixture(
  page: Page,
  caseName = "OBS-105 浏览器观察夹具",
): Promise<PreviewObservationFixture> {
  const project = await createE2EProject(page, caseName);
  const session = await parseApi<{ sessionId: string; workspaceId?: string }>(
    await page.request.post(absoluteApiUrl("/api/sessions"), {
      data: { demoId: project.id, forceNew: true },
    }),
  );
  const fixture = {
    projectId: project.id,
    sessionId: session.sessionId,
    pageId: "",
  } satisfies PreviewObservationFixture;
  fixture.pageId = await addPreviewObservationPage(page, fixture, {
    name: "观察验收页",
  });
  return {
    projectId: fixture.projectId,
    sessionId: fixture.sessionId,
    workspaceId: session.workspaceId,
    pageId: fixture.pageId,
  };
}

/** Creates a high-fidelity page that fails inside the preview ErrorBoundary. */
export async function createPreviewObservationRuntimeErrorFixture(
  page: Page,
  caseName = "OBS-105 高保真 runtime error 观察夹具",
): Promise<PreviewObservationFixture> {
  const project = await createE2EProject(page, caseName);
  const session = await parseApi<{ sessionId: string; workspaceId?: string }>(
    await page.request.post(absoluteApiUrl("/api/sessions"), {
      data: { demoId: project.id, forceNew: true },
    }),
  );
  const demoPage = await parseApi<{ id: string }>(
    await page.request.post(
      absoluteApiUrl(`/api/projects/${project.id}/demos`),
      {
        data: {
          sessionId: session.sessionId,
          name: "高保真 runtime error 观察页",
          runtimeType: "high-fidelity-react",
        },
      },
    ),
  );
  await parseApi<unknown>(
    await page.request.put(
      absoluteApiUrl(`/api/sessions/${session.sessionId}/files/${demoPage.id}`),
      {
        data: { code: PREVIEW_OBSERVATION_RUNTIME_ERROR_CODE },
      },
    ),
  );
  return {
    projectId: project.id,
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    pageId: demoPage.id,
  };
}

/** Creates a page whose source is rejected before a preview runtime can register. */
export async function createPreviewObservationCompileFailureFixture(
  page: Page,
  caseName = "OBS-009 编译失败观察夹具",
): Promise<PreviewObservationFixture> {
  const project = await createE2EProject(page, caseName);
  const session = await parseApi<{ sessionId: string; workspaceId?: string }>(
    await page.request.post(absoluteApiUrl("/api/sessions"), {
      data: { demoId: project.id, forceNew: true },
    }),
  );
  const demoPage = await parseApi<{ id: string }>(
    await page.request.post(
      absoluteApiUrl(`/api/projects/${project.id}/demos`),
      {
        data: {
          sessionId: session.sessionId,
          name: "编译失败观察页",
          runtimeType: "high-fidelity-react",
        },
      },
    ),
  );
  await parseApi<unknown>(
    await page.request.put(
      absoluteApiUrl(`/api/sessions/${session.sessionId}/files/${demoPage.id}`),
      {
        data: { code: PREVIEW_OBSERVATION_COMPILE_FAILURE_CODE },
      },
    ),
  );
  return {
    projectId: project.id,
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    pageId: demoPage.id,
  };
}
