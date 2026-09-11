import { expect, test, type Page } from "@playwright/test";
import { WebSocket, WebSocketServer } from "ws";

import type {
  ObservePreviewInput,
  PreviewObservationResult,
  PreviewRenderIdentity,
} from "../../packages/shared/src/demo/preview-observation";

import { loginE2EUser } from "./support/e2e-auth";
import {
  E2E_BASE_URL,
  getE2ELoginCredentials,
} from "./support/e2e-config";
import {
  addPreviewObservationPage,
  createPreviewObservationCompileFailureFixture,
  createPreviewObservationFixture,
  createPreviewObservationRuntimeErrorFixture,
  type PreviewObservationFixture,
} from "./support/preview-observation-fixture";

const RUN_PREVIEW_OBSERVATION_E2E = process.env.E2E_PREVIEW_OBSERVATION === "1";
const RUN_REAL_PREVIEW_BROKER_E2E =
  process.env.E2E_PREVIEW_OBSERVATION_REAL === "1";
const RUN_SCREENSHOT_UNAVAILABLE_E2E =
  process.env.E2E_PREVIEW_OBSERVATION_SCREENSHOT_UNAVAILABLE === "1";
const readPositiveTimeout = (name: string, fallback: number): number => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const EDITOR_READY_TIMEOUT_MS = readPositiveTimeout(
  "E2E_PREVIEW_OBSERVATION_EDITOR_READY_TIMEOUT_MS",
  90000,
);
const REAL_RUN_TERMINAL_TIMEOUT_MS = readPositiveTimeout(
  "E2E_PREVIEW_OBSERVATION_REAL_RUN_TIMEOUT_MS",
  60000,
);

type PreviewRegistration = {
  identity: PreviewRenderIdentity;
  capabilities?: string[];
};

type ClientMessage = {
  type?: string;
  registration?: PreviewRegistration;
  requestId?: string;
  result?: PreviewObservationResult;
};

type ScenarioRequest = {
  id: string;
  input: ObservePreviewInput;
};

/**
 * A local transport test double. The page still uses the production
 * AgentStream and PreviewObservationRegistry; only the Agent Service socket
 * is replaced so this test can deterministically request observations without
 * depending on a model/tool run. Broker identity checks remain covered by the
 * agent-service tests and are intentionally not claimed by this fixture.
 */
class PreviewObservationAgentDouble {
  private readonly server: WebSocketServer;
  private readonly sockets = new Set<WebSocket>();
  private readonly registrations = new Map<WebSocket, PreviewRegistration>();
  private readonly registrationHistory: PreviewRegistration[] = [];
  private readonly results = new Map<string, PreviewObservationResult>();
  private readonly waiters = new Map<
    string,
    Array<(result: PreviewObservationResult) => void>
  >();
  private readonly scenarioDonePromise: Promise<void>;
  private resolveScenarioDone!: () => void;
  private port = 0;
  private scenarioStarted = false;
  private scenarioError: Error | null = null;

  constructor() {
    this.server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    this.scenarioDonePromise = new Promise((resolve) => {
      this.resolveScenarioDone = resolve;
    });
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("message", (raw) => this.handleMessage(socket, String(raw)));
      socket.on("close", () => {
        this.sockets.delete(socket);
        this.registrations.delete(socket);
      });
    });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        const address = this.server.address();
        if (!address || typeof address === "string") {
          reject(new Error("preview observation double did not expose a port"));
          return;
        }
        this.port = address.port;
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
    });
  }

  get url(): string {
    if (!this.port)
      throw new Error("preview observation double is not started");
    return `ws://127.0.0.1:${this.port}`;
  }

  get observedRegistrations(): PreviewRegistration[] {
    return this.registrationHistory.slice();
  }

  get observedResults(): Array<{
    requestId: string;
    result: PreviewObservationResult;
  }> {
    return [...this.results.entries()].map(([requestId, result]) => ({
      requestId,
      result,
    }));
  }

  async waitForScenario(timeoutMs = 15000): Promise<void> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.scenarioDonePromise,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error("preview observation scenario timed out")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
    if (this.scenarioError) throw this.scenarioError;
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.close();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private handleMessage(socket: WebSocket, raw: string): void {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }
    if (message.type === "preview_register" && message.registration) {
      this.registrations.set(socket, message.registration);
      this.registrationHistory.push(message.registration);
      return;
    }
    if (
      message.type === "preview_observe_result" &&
      message.requestId &&
      message.result
    ) {
      this.results.set(message.requestId, message.result);
      const pending = this.waiters.get(message.requestId);
      if (pending) {
        this.waiters.delete(message.requestId);
        pending.forEach((resolve) => resolve(message.result!));
      }
      return;
    }
    if (message.type === "message" && !this.scenarioStarted) {
      this.scenarioStarted = true;
      void this.runScenario(socket, message);
    }
  }

  private async runScenario(
    socket: WebSocket,
    initialMessage: ClientMessage,
  ): Promise<void> {
    try {
      const prompt = String(
        (initialMessage as { content?: unknown }).content ?? "",
      );
      if (prompt.includes("compile-failure")) {
        this.send(socket, {
          type: "preview_observe_request",
          previewRequestId: "compile-failure",
          previewObservation: { detail: "runtime" },
        });
        await this.waitForResult("compile-failure");
        this.send(socket, {
          type: "finish",
          content: "preview compile failure observation complete",
        });
        this.resolveScenarioDone();
        return;
      }
      const registration = await this.waitForRegistration(socket);
      const pageId = registration.identity.pageId;
      if (prompt.includes("quick-switch")) {
        const switchPageId = prompt.match(/switch-page=([^\s]+)/u)?.[1];
        if (!switchPageId)
          throw new Error("quick-switch prompt is missing switch-page");
        this.send(socket, {
          type: "preview_observe_request",
          previewRequestId: "quick-switch-before",
          previewObservation: {
            pageId,
            target: { nodeId: "obs-center" },
          },
        });
        await this.waitForResult("quick-switch-before");
        const switched = await this.waitForRegistrationCount(2);
        this.send(socket, {
          type: "preview_observe_request",
          previewRequestId: "quick-switch-old-page",
          previewObservation: {
            pageId,
            target: { nodeId: "obs-center" },
          },
        });
        await this.waitForResult("quick-switch-old-page");
        this.send(socket, {
          type: "preview_observe_request",
          previewRequestId: "quick-switch-active-page",
          previewObservation: {
            pageId: switched.identity.pageId,
            target: { nodeId: "obs-center" },
          },
        });
        await this.waitForResult("quick-switch-active-page");
        this.send(socket, {
          type: "finish",
          content: "preview quick-switch observation complete",
        });
        this.resolveScenarioDone();
        return;
      }
      const sourceFile = "fixtures/preview-observation.tsx";
      const requests: ScenarioRequest[] =
        registration.identity.runtimeType === "high-fidelity-react"
          ? [
              {
                id: "runtime-error",
                input: {
                  detail: "runtime",
                  assertions: [
                    { id: "no-runtime-errors", type: "no-runtime-errors" },
                  ],
                },
              },
            ]
          : [
              {
                id: "center-and-runtime",
                input: {
                  pageId,
                  target: { nodeId: "obs-center" },
                  includeAncestors: true,
                  assertions: [
                    { id: "exists", type: "exists" },
                    { id: "visible", type: "visible" },
                    {
                      id: "centered-in-grid",
                      type: "centered",
                      relativeTo: "parent",
                      tolerancePx: 4,
                    },
                    { id: "runtime-ready", type: "runtime-ready" },
                    { id: "no-runtime-errors", type: "no-runtime-errors" },
                  ],
                },
              },
              ...(
                [
                  "obs-northwest",
                  "obs-northeast",
                  "obs-southwest",
                  "obs-southeast",
                ] as const
              ).map((nodeId) => ({
                id: nodeId,
                input: { pageId, target: { nodeId } },
              })),
              {
                id: "scroll-and-ancestors",
                input: {
                  pageId,
                  target: { nodeId: "obs-scroll-item" },
                  includeAncestors: true,
                },
              },
              {
                id: "transform",
                input: { pageId, target: { nodeId: "obs-transform" } },
              },
              {
                id: "overflow",
                input: {
                  pageId,
                  target: { nodeId: "obs-overflow-child" },
                  includeAncestors: true,
                },
              },
              ...(
                [
                  "obs-display-none",
                  "obs-visibility-hidden",
                  "obs-opacity-zero",
                ] as const
              ).map((nodeId) => ({
                id: nodeId,
                input: {
                  pageId,
                  target: { nodeId },
                  assertions: [{ id: "visible", type: "visible" as const }],
                },
              })),
              {
                id: "failing-image",
                input: {
                  pageId,
                  target: { nodeId: "obs-failing-image" },
                  detail: "media",
                  assertions: [
                    { id: "image-loaded", type: "image-loaded" as const },
                  ],
                },
              },
              {
                id: "ambiguous-source",
                input: {
                  pageId,
                  target: { sourceFile, sourceLine: 99 },
                },
              },
              {
                id: "old-page",
                input: {
                  pageId: `${pageId}-old-revision`,
                  target: { nodeId: "obs-center" },
                },
              },
            ];

      for (const request of requests) {
        this.send(socket, {
          type: "preview_observe_request",
          previewRequestId: request.id,
          previewObservation: request.input,
        });
        await this.waitForResult(request.id);
      }
      this.send(socket, {
        type: "finish",
        content: "preview observation browser fixture complete",
      });
      this.resolveScenarioDone();
    } catch (error) {
      this.scenarioError =
        error instanceof Error ? error : new Error(String(error));
      this.resolveScenarioDone();
    }
  }

  private async waitForRegistration(
    socket: WebSocket,
  ): Promise<PreviewRegistration> {
    const startedAt = Date.now();
    while (!this.registrations.has(socket)) {
      if (Date.now() - startedAt > 5000) {
        throw new Error("browser did not register an active preview");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return this.registrations.get(socket)!;
  }

  private async waitForRegistrationCount(
    count: number,
    timeoutMs = 10000,
  ): Promise<PreviewRegistration> {
    const startedAt = Date.now();
    while (this.registrationHistory.length < count) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`browser did not register preview ${count} times`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return this.registrationHistory[count - 1]!;
  }

  private waitForResult(requestId: string): Promise<PreviewObservationResult> {
    const existing = this.results.get(requestId);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.results.has(requestId)) {
          this.waiters.delete(requestId);
          reject(new Error(`browser did not answer observation ${requestId}`));
        }
      }, 5000);
      this.waiters.set(requestId, [
        (result) => {
          clearTimeout(timeout);
          resolve(result);
        },
      ]);
    });
  }

  private send(socket: WebSocket, message: Record<string, unknown>): void {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message));
  }
}

async function installAgentSocketRedirect(
  page: Page,
  fakeAgentUrl: string,
): Promise<void> {
  await page.addInitScript(
    ({ fakeAgentUrl: url }) => {
      const NativeWebSocket = window.WebSocket;
      const redirect = (value: string | URL): string | URL => {
        const text = String(value);
        try {
          const parsed = new URL(text, window.location.href);
          if (parsed.pathname.startsWith("/api/agent/")) {
            return `${url}${parsed.pathname}${parsed.search}`;
          }
        } catch {
          // Preserve malformed/native handling for non-agent sockets.
        }
        return value;
      };
      class RedirectedWebSocket extends NativeWebSocket {
        constructor(address: string | URL, protocols?: string | string[]) {
          const next = redirect(address);
          super(next, protocols);
        }
      }
      for (const key of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"] as const) {
        Object.defineProperty(RedirectedWebSocket, key, {
          configurable: false,
          enumerable: true,
          value: NativeWebSocket[key],
        });
      }
      window.WebSocket = RedirectedWebSocket;
    },
    { fakeAgentUrl },
  );
}

async function openFixtureEditor(
  page: Page,
  fixture: PreviewObservationFixture,
  options: { workspaceId?: string } = {},
): Promise<void> {
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    console.warn(
      `[preview-observation] request failed ${request.method()} ${request.url()}${failure?.errorText ? ` (${failure.errorText})` : ""}`,
    );
  });
  page.on("pageerror", (error) => {
    console.warn(`[preview-observation] page error: ${error.message}`);
  });
  if (options.workspaceId) {
    await page.route("**/api/sessions", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(route.request().postData() ?? "{}") as Record<
          string,
          unknown
        >;
      } catch {
        // Preserve the original request if the body is not JSON.
      }
      await route.continue({
        postData: JSON.stringify({ ...body, workspaceId: options.workspaceId }),
      });
    });
  }
  await loginE2EUser(page, getE2ELoginCredentials());
  await page.goto(`${E2E_BASE_URL}/demo/${fixture.projectId}/edit`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("heading", { name: /E2E:/ })).toBeVisible({
    timeout: EDITOR_READY_TIMEOUT_MS,
  });
  await expect(page.locator('[data-ow-id="obs-center"]')).toBeVisible({
    timeout: EDITOR_READY_TIMEOUT_MS,
  });
  if (options.workspaceId) await page.unroute("**/api/sessions");
}

async function readManualRect(
  page: Page,
  nodeId: string,
): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  transform: string;
}> {
  return page.locator(`[data-ow-id="${nodeId}"]`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      transform: getComputedStyle(element).transform,
    };
  });
}

async function readManualVisibilityAndImage(
  page: Page,
  nodeId: string,
): Promise<{
  display: string;
  visibility: string;
  opacity: string;
  overflow: string;
  image?: { complete: boolean; naturalWidth: number };
}> {
  return page.locator(`[data-ow-id="${nodeId}"]`).evaluate((element) => {
    const style = getComputedStyle(element);
    const image =
      element instanceof HTMLImageElement
        ? { complete: element.complete, naturalWidth: element.naturalWidth }
        : undefined;
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      overflow: style.overflow,
      image,
    };
  });
}

test.describe("OBS-009/OBS-105 浏览器运行时观察验收", () => {
  test.skip(
    !RUN_PREVIEW_OBSERVATION_E2E,
    "set E2E_PREVIEW_OBSERVATION=1 with a running author-site to execute the real browser harness",
  );

  test("commit→projection→connection-scoped observe returns layout/style/media evidence", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
      const frames: Array<Record<string, unknown>> = [];
      Object.defineProperty(window, "__previewObservationFrames", {
        configurable: true,
        value: frames,
      });
      const NativeWebSocket = (window as any).WebSocket;
      const CapturingWebSocket = function (...args: any[]) {
        const socket = new NativeWebSocket(...args) as any;
        socket.addEventListener("open", () => {
          frames.push({ type: "__open", url: String(socket.url) });
        });
        socket.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data !== "string") return;
          try {
            frames.push(JSON.parse(event.data) as Record<string, unknown>);
          } catch {
            // Ignore non-JSON messages from HMR or unrelated sockets.
          }
        });
        return socket;
      } as any;
      CapturingWebSocket.prototype = NativeWebSocket.prototype;
      Object.assign(CapturingWebSocket, {
        CONNECTING: NativeWebSocket.CONNECTING,
        OPEN: NativeWebSocket.OPEN,
        CLOSING: NativeWebSocket.CLOSING,
        CLOSED: NativeWebSocket.CLOSED,
      });
      (window as any).WebSocket = CapturingWebSocket;
    });
    const agentDouble = RUN_REAL_PREVIEW_BROKER_E2E
      ? null
      : new PreviewObservationAgentDouble();
    if (agentDouble) await agentDouble.start();
    const realFrames: Record<string, unknown>[] = [];
    let resolveRealTerminal!: (message: Record<string, unknown>) => void;
    const realTerminal = new Promise<Record<string, unknown>>((resolve) => {
      resolveRealTerminal = resolve;
    });
    page.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          const message = JSON.parse(raw) as Record<string, unknown>;
          realFrames.push(message);
          if (
            message.type === "finish" ||
            message.type === "error" ||
            message.type === "run_summary"
          ) {
            resolveRealTerminal(message);
          }
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    try {
      await loginE2EUser(page, getE2ELoginCredentials());
      const fixture = await createPreviewObservationFixture(
        page,
        `OBS-009/OBS-105 浏览器观察 ${testInfo.testId}`,
      );
      if (agentDouble) await installAgentSocketRedirect(page, agentDouble.url);
      if (agentDouble) {
        await page.route("**/api/tools/capabilities", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: { toolVersion: 1, toolNames: ["observePreview"] },
            }),
          });
        });
      }
      await openFixtureEditor(page, fixture);

      const input = page
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      await expect(input).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
      if (RUN_REAL_PREVIEW_BROKER_E2E) {
        const screenshotHealth = await page.request.get(
          `${E2E_BASE_URL}/api/screenshots/health`,
        );
        // The real acceptance topology may have screenshot-service running
        // already; observation must remain independent in either case.
        expect([200, 503]).toContain(screenshotHealth.status());
        await page.waitForFunction(
          () =>
            (
              window as unknown as {
                __previewObservationFrames?: Array<Record<string, unknown>>;
              }
            ).__previewObservationFrames?.some(
              (frame) =>
                frame.type === "__open" ||
                (frame.type === "status" && frame.status === "connected"),
            ) ?? false,
          undefined,
          { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
        );
      }
      await input.fill(
        `请对当前预览执行一次观察验收夹具；提交无视觉变化的 mutation 到 demos/${fixture.pageId}/prototype.html`,
      );
      await input.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );
      let results: Array<{
        requestId: string;
        result: PreviewObservationResult;
      }>;
      if (agentDouble) {
        await agentDouble.waitForScenario();
        results = agentDouble.observedResults;
      } else {
        let terminal: Record<string, unknown>;
        try {
          if (RUN_REAL_PREVIEW_BROKER_E2E) {
            await page.waitForFunction(
              () =>
                (
                  window as unknown as {
                    __previewObservationFrames?: Array<Record<string, unknown>>;
                  }
                ).__previewObservationFrames?.some((frame) =>
                  ["finish", "error", "run_summary"].includes(
                    String(frame.type),
                  ),
                ) ?? false,
              undefined,
              { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
            );
            const capturedFrames = await page.evaluate(
              () =>
                (
                  window as unknown as {
                    __previewObservationFrames?: Array<Record<string, unknown>>;
                  }
                ).__previewObservationFrames ?? [],
            );
            realFrames.push(...capturedFrames);
            terminal = capturedFrames.find(
              (frame) => frame.type === "run_summary",
            ) ??
              capturedFrames.find((frame) => frame.type === "finish") ??
              capturedFrames.find((frame) => frame.type === "error") ?? {
                type: "unknown",
              };
          } else {
            terminal = await Promise.race([
              realTerminal,
              new Promise<Record<string, unknown>>((_, reject) =>
                setTimeout(
                  () => reject(new Error("Agent run timed out")),
                  REAL_RUN_TERMINAL_TIMEOUT_MS,
                ),
              ),
            ]);
          }
        } catch (error) {
          void testInfo.attach("preview-observation-real-frames-timeout.json", {
            body: JSON.stringify(realFrames, null, 2),
            contentType: "application/json",
          });
          const capturedTypes = await page.evaluate(
            () =>
              (
                window as unknown as {
                  __previewObservationFrames?: Array<Record<string, unknown>>;
                }
              ).__previewObservationFrames?.map((frame) =>
                String(frame.type),
              ) ?? [],
          );
          throw new Error(
            `${error instanceof Error ? error.message : String(error)} (frames=${realFrames.length}, browserTypes=${capturedTypes.join(",")})`,
          );
        }
        expect(["finish", "run_summary"]).toContain(terminal.type);
        const previewRequests = realFrames.filter(
          (message) => message.type === "preview_observe_request",
        );
        expect(previewRequests.length).toBeGreaterThan(0);
        const summaryMessage = realFrames.find(
          (message) => message.type === "run_summary",
        );
        const observations = ((
          summaryMessage?.runSummary as { observations?: unknown[] } | undefined
        )?.observations ?? []) as Array<Record<string, unknown>>;
        expect(observations.length).toBeGreaterThanOrEqual(17);
        const runSummary = summaryMessage?.runSummary as
          | {
              mutations?: Array<{ status?: string; revision?: number }>;
              projections?: Array<{ status?: string; revision?: number }>;
            }
          | undefined;
        expect(
          runSummary?.mutations?.some(
            (mutation) => mutation.status === "committed",
          ),
        ).toBe(true);
        expect(
          runSummary?.projections?.some(
            (projection) => projection.status === "applied",
          ),
        ).toBe(true);
        await testInfo.attach("preview-observation-real-frames.json", {
          body: JSON.stringify(realFrames, null, 2),
          contentType: "application/json",
        });
        const first = observations[0];
        expect(["observed", "stale"]).toContain(first.availability);
        const toolUpdates = new Map(
          realFrames
            .filter(
              (message) =>
                message.type === "tool_call_update" &&
                typeof message.toolCallId === "string",
            )
            .map((message) => [
              String(message.toolCallId),
              message.details as Record<string, unknown> | undefined,
            ]),
        );
        const toolDetails = (toolCallId: string) => {
          const direct = toolUpdates.get(toolCallId);
          if (direct?.availability !== "stale") return direct;
          for (let attempt = 1; attempt <= 4; attempt += 1) {
            const retryId = `${toolCallId}-retry${
              attempt === 1 ? "" : `-${attempt}`
            }`;
            const retry = toolUpdates.get(retryId);
            if (retry?.availability !== "stale") return retry;
          }
          return direct;
        };
        const editDetails = toolDetails("e2e-edit-1");
        expect(
          (editDetails?.receipt as { committed?: boolean } | undefined)
            ?.committed,
        ).toBe(true);
        const centerRetry = toolDetails("e2e-observe-2");
        expect(centerRetry?.availability).toBe("observed");
        expect(centerRetry?.assertionStatus).toBe("passed");
        const manualCenter = await readManualRect(page, "obs-center");
        const observedCenterRect = (
          centerRetry?.target as
            | {
                rect?: {
                  x?: number;
                  y?: number;
                  width?: number;
                  height?: number;
                };
              }
            | undefined
        )?.rect;
        expect(observedCenterRect?.x).toBeCloseTo(manualCenter.x, 3);
        expect(observedCenterRect?.y).toBeCloseTo(manualCenter.y, 3);
        expect(observedCenterRect?.width).toBeCloseTo(manualCenter.width, 3);
        expect(observedCenterRect?.height).toBeCloseTo(manualCenter.height, 3);
        const manualTransform = await readManualRect(page, "obs-transform");
        const observedTransform = toolDetails("e2e-observe-12")?.target as
          | {
              rect?: {
                x?: number;
                y?: number;
                width?: number;
                height?: number;
              };
              style?: { transform?: string };
            }
          | undefined;
        expect(observedTransform?.rect?.x).toBeCloseTo(manualTransform.x, 3);
        expect(observedTransform?.rect?.y).toBeCloseTo(manualTransform.y, 3);
        expect(observedTransform?.rect?.width).toBeCloseTo(
          manualTransform.width,
          3,
        );
        expect(observedTransform?.rect?.height).toBeCloseTo(
          manualTransform.height,
          3,
        );
        expect(observedTransform?.style?.transform).toBe(
          manualTransform.transform,
        );
        const committedRevision = runSummary?.mutations?.find(
          (mutation) => mutation.status === "committed",
        )?.revision;
        const projectedRevision = runSummary?.projections?.find(
          (projection) =>
            projection.status === "applied" &&
            projection.revision === committedRevision,
        )?.revision;
        expect(committedRevision).toBe(projectedRevision);
        expect(
          realFrames.some(
            (message) =>
              message.type === "tool_call_update" &&
              String(message.toolCallId ?? "").startsWith("e2e-observe-") &&
              (
                message.details as
                  | { identity?: { revision?: number } }
                  | undefined
              )?.identity?.revision === projectedRevision,
          ),
        ).toBe(true);
        expect(toolDetails("e2e-observe-3")?.assertionStatus).toBe("failed");
        expect(toolDetails("e2e-observe-4")?.assertionStatus).toBe("failed");
        expect(toolDetails("e2e-observe-5")?.targetResolution).toBe(
          "ambiguous",
        );
        expect(toolDetails("e2e-observe-6")?.availability).toBe("unavailable");
        for (const [index, nodeId] of [
          "obs-northwest",
          "obs-northeast",
          "obs-southwest",
          "obs-southeast",
        ].entries()) {
          const corner = toolDetails(`e2e-observe-${index + 7}`);
          expect(corner?.availability).toBe("observed");
          const observedCorner = corner?.target as
            | {
                nodeId?: string;
                rect?: { width?: number; height?: number };
              }
            | undefined;
          expect(observedCorner?.nodeId).toBe(nodeId);
          const manualCorner = await readManualRect(page, nodeId);
          expect(observedCorner?.rect?.width).toBeCloseTo(
            manualCorner.width,
            3,
          );
          expect(observedCorner?.rect?.height).toBeCloseTo(
            manualCorner.height,
            3,
          );
        }
        expect(toolDetails("e2e-observe-11")?.availability).toBe("observed");
        const observedScroll = toolDetails("e2e-observe-11")?.target as
          | {
              rect?: {
                x?: number;
                y?: number;
                width?: number;
                height?: number;
              };
            }
          | undefined;
        const manualScroll = await readManualRect(page, "obs-scroll-item");
        expect(observedScroll?.rect?.x).toBeCloseTo(manualScroll.x, 3);
        expect(observedScroll?.rect?.y).toBeCloseTo(manualScroll.y, 3);
        expect(observedScroll?.rect?.width).toBeCloseTo(manualScroll.width, 3);
        expect(observedScroll?.rect?.height).toBeCloseTo(
          manualScroll.height,
          3,
        );
        expect(toolDetails("e2e-observe-11")?.ancestors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              style: expect.objectContaining({ overflow: "auto" }),
            }),
          ]),
        );
        expect(toolDetails("e2e-observe-12")?.availability).toBe("observed");
        expect(
          (
            toolDetails("e2e-observe-12")?.target as
              | { style?: { transform?: string } }
              | undefined
          )?.style?.transform,
        ).toMatch(/matrix|translate/);
        expect(toolDetails("e2e-observe-13")?.availability).toBe("observed");
        expect(toolDetails("e2e-observe-13")?.ancestors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              style: expect.objectContaining({ overflow: "hidden" }),
            }),
          ]),
        );
        expect(
          await readManualVisibilityAndImage(page, "obs-overflow"),
        ).toMatchObject({ overflow: "hidden" });
        for (const index of [14, 15, 16]) {
          expect(toolDetails(`e2e-observe-${index}`)?.assertionStatus).toBe(
            "failed",
          );
        }
        expect(toolDetails("e2e-observe-17")?.assertionStatus).toBe("failed");
        expect(
          await readManualVisibilityAndImage(page, "obs-display-none"),
        ).toMatchObject({
          display: "none",
        });
        expect(
          await readManualVisibilityAndImage(page, "obs-visibility-hidden"),
        ).toMatchObject({ visibility: "hidden" });
        expect(
          await readManualVisibilityAndImage(page, "obs-opacity-zero"),
        ).toMatchObject({
          opacity: "0",
        });
        expect(
          await readManualVisibilityAndImage(page, "obs-failing-image"),
        ).toMatchObject({
          image: { complete: true, naturalWidth: 0 },
        });
        return;
      }

      await testInfo.attach("preview-observation-results.json", {
        body: JSON.stringify(results, null, 2),
        contentType: "application/json",
      });

      const resultById = new Map(
        results.map((item) => [item.requestId, item.result]),
      );
      const center = resultById.get("center-and-runtime");
      expect(center?.availability).toBe("observed");
      expect(center?.identity?.pageId).toBe(fixture.pageId);
      expect(center?.target?.nodeId).toBe("obs-center");
      expect(center?.assertionStatus).toBe("passed");
      expect(center?.runtime?.readyState).toBe("complete");
      const manualCenter = await readManualRect(page, "obs-center");
      expect(center?.target?.rect.x).toBeCloseTo(manualCenter.x, 3);
      expect(center?.target?.rect.y).toBeCloseTo(manualCenter.y, 3);
      expect(center?.target?.rect.width).toBeCloseTo(manualCenter.width, 3);
      expect(center?.target?.rect.height).toBeCloseTo(manualCenter.height, 3);

      for (const nodeId of [
        "obs-northwest",
        "obs-northeast",
        "obs-southwest",
        "obs-southeast",
      ]) {
        expect(resultById.get(nodeId)?.target?.nodeId).toBe(nodeId);
        expect(resultById.get(nodeId)?.target?.rect.width).toBeGreaterThan(0);
        expect(resultById.get(nodeId)?.target?.rect.height).toBeGreaterThan(0);
      }

      const scroll = resultById.get("scroll-and-ancestors");
      expect(scroll?.target?.nodeId).toBe("obs-scroll-item");
      expect(
        scroll?.ancestors?.some((node) => node.style?.overflow === "auto"),
      ).toBe(true);
      expect(resultById.get("transform")?.target?.style?.transform).toMatch(
        /matrix|translate/,
      );
      const manualTransform = await readManualRect(page, "obs-transform");
      expect(resultById.get("transform")?.target?.style?.transform).toBe(
        manualTransform.transform,
      );
      expect(resultById.get("transform")?.target?.rect.x).toBeCloseTo(
        manualTransform.x,
        3,
      );
      expect(
        resultById
          .get("overflow")
          ?.ancestors?.some((node) => node.style?.overflow === "hidden"),
      ).toBe(true);

      for (const nodeId of [
        "obs-display-none",
        "obs-visibility-hidden",
        "obs-opacity-zero",
      ]) {
        const result = resultById.get(nodeId);
        expect(result?.target?.nodeId).toBe(nodeId);
        expect(result?.assertionStatus).toBe("failed");
      }
      const image = resultById.get("failing-image");
      expect(image?.target?.image?.failed).toBe(true);
      expect(image?.assertionStatus).toBe("failed");

      const ambiguous = resultById.get("ambiguous-source");
      expect(ambiguous?.targetResolution).toBe("ambiguous");
      expect(ambiguous?.target).toBeUndefined();
      expect(ambiguous?.targetCandidates?.length).toBe(2);

      const oldPage = resultById.get("old-page");
      expect(oldPage?.availability).toBe("unavailable");
      expect(oldPage?.reasons).toContain("page-not-active");
      expect(agentDouble.observedRegistrations[0]?.identity.pageId).toBe(
        fixture.pageId,
      );
      expect(agentDouble.observedRegistrations[0]?.identity.revision).toEqual(
        expect.any(Number),
      );

      await page.screenshot({
        path: testInfo.outputPath("preview-observation-fixture.png"),
        fullPage: false,
      });
    } finally {
      await agentDouble?.close();
    }
  });

  test("compile failure leaves observation fail-closed without an active preview", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    await page.addInitScript(() => {
      const frames: Array<Record<string, unknown>> = [];
      Object.defineProperty(window, "__previewObservationFrames", {
        configurable: true,
        value: frames,
      });
      const NativeWebSocket = (window as any).WebSocket;
      const CapturingWebSocket = function (...args: any[]) {
        const socket = new NativeWebSocket(...args) as any;
        socket.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data !== "string") return;
          try {
            frames.push(JSON.parse(event.data) as Record<string, unknown>);
          } catch {
            // Ignore non-JSON messages from HMR or unrelated sockets.
          }
        });
        return socket;
      } as any;
      CapturingWebSocket.prototype = NativeWebSocket.prototype;
      Object.assign(CapturingWebSocket, {
        CONNECTING: NativeWebSocket.CONNECTING,
        OPEN: NativeWebSocket.OPEN,
        CLOSING: NativeWebSocket.CLOSING,
        CLOSED: NativeWebSocket.CLOSED,
      });
      (window as any).WebSocket = CapturingWebSocket;
    });
    const agentDouble = RUN_REAL_PREVIEW_BROKER_E2E
      ? null
      : new PreviewObservationAgentDouble();
    if (agentDouble) await agentDouble.start();
    const realFrames: Record<string, unknown>[] = [];
    page.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          realFrames.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    try {
      await loginE2EUser(page, getE2ELoginCredentials());
      const fixture = await createPreviewObservationCompileFailureFixture(
        page,
        `OBS-009 编译失败 ${testInfo.testId}`,
      );
      if (agentDouble) {
        await installAgentSocketRedirect(page, agentDouble.url);
        await page.route("**/api/tools/capabilities", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: { toolVersion: 1, toolNames: ["observePreview"] },
            }),
          });
        });
      }
      await page.goto(`${E2E_BASE_URL}/demo/${fixture.projectId}/edit`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: /E2E:/ })).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      await expect(page.getByText("代码加载失败")).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      const input = page
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      await expect(input).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
      await input.fill(
        `compile-failure: 请观察当前预览；页面是 demos/${fixture.pageId}/index.tsx`,
      );
      await input.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );
      let result: PreviewObservationResult | undefined;
      if (agentDouble) {
        await agentDouble.waitForScenario();
        result = agentDouble.observedResults.find(
          (item) => item.requestId === "compile-failure",
        )?.result;
      } else {
        await expect
          .poll(
            async () => {
              const capturedFrames = await page.evaluate(
                () =>
                  (
                    window as unknown as {
                      __previewObservationFrames?: Array<
                        Record<string, unknown>
                      >;
                    }
                  ).__previewObservationFrames ?? [],
              );
              realFrames.push(...capturedFrames);
              return realFrames.some((frame) =>
                ["finish", "error", "run_summary"].includes(String(frame.type)),
              );
            },
            { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
          )
          .toBe(true);
        const framePool = realFrames;
        const summaryMessage = framePool.find(
          (frame) => frame.type === "run_summary",
        );
        const observations = (
          summaryMessage?.runSummary as { observations?: unknown[] } | undefined
        )?.observations as Array<Record<string, unknown>> | undefined;
        expect(observations?.length).toBeGreaterThanOrEqual(1);
        const toolUpdate = framePool.find(
          (frame) =>
            frame.type === "tool_call_update" &&
            String(frame.toolCallId ?? "") === "compile-failure",
        );
        const toolResult = toolUpdate?.result as unknown;
        const nestedToolDetails =
          toolResult &&
          typeof toolResult === "object" &&
          "details" in toolResult
            ? (toolResult as { details?: unknown }).details
            : undefined;
        result = ((toolUpdate?.details as
          | PreviewObservationResult
          | undefined) ??
          (toolUpdate?.payload as { details?: unknown } | undefined)?.details ??
          nestedToolDetails ??
          toolResult) as PreviewObservationResult | undefined;
        await testInfo.attach(
          "preview-observation-compile-failure-real-frames.json",
          {
            body: JSON.stringify(realFrames, null, 2),
            contentType: "application/json",
          },
        );
      }
      expect(result?.availability).toBe("unavailable");
      expect(result?.reasons).toContain("no-active-preview");
      await testInfo.attach("preview-observation-compile-failure.json", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
    } finally {
      await agentDouble?.close();
    }
  });

  test("screenshot-service unavailable does not disable E1 observation", async ({
    page,
  }, testInfo) => {
    test.skip(
      !RUN_REAL_PREVIEW_BROKER_E2E || !RUN_SCREENSHOT_UNAVAILABLE_E2E,
      "requires real Broker plus an explicitly unreachable screenshot-service",
    );
    test.setTimeout(120000);
    await page.addInitScript(() => {
      const frames: Array<Record<string, unknown>> = [];
      Object.defineProperty(window, "__previewObservationFrames", {
        configurable: true,
        value: frames,
      });
      const NativeWebSocket = window.WebSocket;
      const CapturingWebSocket = function (...args: any[]) {
        const socket = new (NativeWebSocket as any)(...args) as any;
        socket.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data !== "string") return;
          try {
            frames.push(JSON.parse(event.data) as Record<string, unknown>);
          } catch {
            // Ignore non-JSON messages from unrelated sockets.
          }
        });
        return socket;
      } as any;
      CapturingWebSocket.prototype = NativeWebSocket.prototype;
      Object.assign(CapturingWebSocket, {
        CONNECTING: NativeWebSocket.CONNECTING,
        OPEN: NativeWebSocket.OPEN,
        CLOSING: NativeWebSocket.CLOSING,
        CLOSED: NativeWebSocket.CLOSED,
      });
      (window as any).WebSocket = CapturingWebSocket;
    });
    const realFrames: Record<string, unknown>[] = [];
    page.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          realFrames.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    try {
      await loginE2EUser(page, getE2ELoginCredentials());
      const fixture = await createPreviewObservationFixture(
        page,
        `OBS-009 截图服务不可用 ${testInfo.testId}`,
      );
      await openFixtureEditor(page, fixture);
      const input = page
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      await expect(input).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
      const screenshotHealth = await page.request.get(
        `${E2E_BASE_URL}/api/screenshots/health`,
      );
      expect(screenshotHealth.status()).toBe(503);
      await input.fill(
        `screenshot-unavailable: 截图服务不可用时仍观察当前预览；页面是 demos/${fixture.pageId}/prototype.html`,
      );
      await input.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );
      await expect
        .poll(
          async () => {
            const capturedFrames = await page.evaluate(
              () =>
                (
                  window as unknown as {
                    __previewObservationFrames?: Array<Record<string, unknown>>;
                  }
                ).__previewObservationFrames ?? [],
            );
            realFrames.push(...capturedFrames);
            return realFrames.some((frame) =>
              ["finish", "error", "run_summary"].includes(String(frame.type)),
            );
          },
          { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
        )
        .toBe(true);
      await testInfo.attach(
        "preview-observation-screenshot-unavailable-real-frames.json",
        {
          body: JSON.stringify(realFrames, null, 2),
          contentType: "application/json",
        },
      );
      const summary = realFrames.find((frame) => frame.type === "run_summary")
        ?.runSummary as { observations?: unknown[] } | undefined;
      expect(summary?.observations?.length).toBeGreaterThanOrEqual(1);
      const screenshotCall = realFrames.find(
        (frame) =>
          frame.type === "tool_call_update" &&
          frame.toolCallId === "e2e-screenshot-unavailable",
      );
      expect(screenshotCall).toBeUndefined();
      const observeUpdate = realFrames.find(
        (frame) =>
          frame.type === "tool_call_update" &&
          frame.toolCallId === "e2e-screenshot-unavailable-observe",
      );
      const observation = observeUpdate?.details as
        | PreviewObservationResult
        | undefined;
      expect(observation?.availability).toBe("observed");
      expect(observation?.assertionStatus).toBe("passed");
    } finally {
      // No per-test resources to close; global teardown removes the fixture.
    }
  });

  test("quick page switch rejects the old identity and observes the new active page", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
      const frames: Array<Record<string, unknown>> = [];
      Object.defineProperty(window, "__previewObservationFrames", {
        configurable: true,
        value: frames,
      });
      const NativeWebSocket = (window as any).WebSocket;
      const CapturingWebSocket = function (...args: any[]) {
        const socket = new NativeWebSocket(...args) as any;
        socket.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data !== "string") return;
          try {
            frames.push(JSON.parse(event.data) as Record<string, unknown>);
          } catch {
            // Ignore non-JSON messages from HMR or unrelated sockets.
          }
        });
        return socket;
      } as any;
      CapturingWebSocket.prototype = NativeWebSocket.prototype;
      Object.assign(CapturingWebSocket, {
        CONNECTING: NativeWebSocket.CONNECTING,
        OPEN: NativeWebSocket.OPEN,
        CLOSING: NativeWebSocket.CLOSING,
        CLOSED: NativeWebSocket.CLOSED,
      });
      (window as any).WebSocket = CapturingWebSocket;
    });
    const agentDouble = RUN_REAL_PREVIEW_BROKER_E2E
      ? null
      : new PreviewObservationAgentDouble();
    if (agentDouble) await agentDouble.start();
    const realFrames: Record<string, unknown>[] = [];
    page.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          realFrames.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    try {
      await loginE2EUser(page, getE2ELoginCredentials());
      const fixture = await createPreviewObservationFixture(
        page,
        `OBS-009 快速切页 ${testInfo.testId}`,
      );
      const switchPageId = await addPreviewObservationPage(page, fixture);
      if (agentDouble) {
        await installAgentSocketRedirect(page, agentDouble.url);
        await page.route("**/api/tools/capabilities", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: { toolVersion: 1, toolNames: ["observePreview"] },
            }),
          });
        });
      }
      await openFixtureEditor(page, fixture);
      const input = page
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      await expect(input).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
      await input.fill(
        `quick-switch: 观察当前页 demos/${fixture.pageId}/prototype.html；切换到 switch-page=${switchPageId}`,
      );
      await input.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );

      if (agentDouble) {
        await expect
          .poll(() => agentDouble.observedRegistrations.length, {
            timeout: EDITOR_READY_TIMEOUT_MS,
          })
          .toBeGreaterThan(0);
      } else {
        // The production stream does not expose preview_observe_request to
        // the page's WebSocket listener: that request is consumed by the
        // AgentStream transport itself. The fake model deliberately holds the
        // next call for 10s, so give the first observation a bounded head start
        // before switching the active page.
        await page.waitForTimeout(2000);
      }

      const pagePicker = page.getByRole("combobox", {
        name: "选择预览页面",
      });
      await expect(pagePicker).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      await pagePicker.click();
      await page
        .getByRole("option")
        .filter({ hasText: "观察验收切换页" })
        .click();
      await expect(pagePicker).toContainText("观察验收切换页", {
        timeout: EDITOR_READY_TIMEOUT_MS,
      });

      let results: Array<{
        requestId: string;
        result: PreviewObservationResult;
      }> = [];
      if (agentDouble) {
        await agentDouble.waitForScenario(30000);
        results = agentDouble.observedResults;
      } else {
        await expect
          .poll(
            async () => {
              const capturedFrames = await page.evaluate(
                () =>
                  (
                    window as unknown as {
                      __previewObservationFrames?: Array<
                        Record<string, unknown>
                      >;
                    }
                  ).__previewObservationFrames ?? [],
              );
              return [...realFrames, ...capturedFrames].some((frame) =>
                ["finish", "error", "run_summary"].includes(String(frame.type)),
              );
            },
            { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
          )
          .toBe(true);
        const capturedFrames = await page.evaluate(
          () =>
            (
              window as unknown as {
                __previewObservationFrames?: Array<Record<string, unknown>>;
              }
            ).__previewObservationFrames ?? [],
        );
        const frames = [...realFrames, ...capturedFrames];
        await testInfo.attach("preview-observation-quick-switch-frames.json", {
          body: JSON.stringify(frames, null, 2),
          contentType: "application/json",
        });
        const summary = frames.find((frame) => frame.type === "run_summary")
          ?.runSummary as { observations?: Array<Record<string, unknown>> };
        const observations = summary?.observations ?? [];
        const detailsFor = (
          id: string,
        ): Record<string, unknown> | undefined => {
          const update = frames.find(
            (frame) =>
              frame.type === "tool_call_update" &&
              String(frame.toolCallId ?? "") === id,
          );
          return update?.details as Record<string, unknown> | undefined;
        };
        results = [
          {
            requestId: "quick-switch-before",
            result: detailsFor(
              "e2e-switch-before",
            ) as unknown as PreviewObservationResult,
          },
          {
            requestId: "quick-switch-old-page",
            result: detailsFor(
              "e2e-switch-old-page",
            ) as unknown as PreviewObservationResult,
          },
          {
            requestId: "quick-switch-active-page",
            result: detailsFor(
              "e2e-switch-active-page",
            ) as unknown as PreviewObservationResult,
          },
        ];
        expect(observations.length).toBeGreaterThanOrEqual(3);
      }
      const resultById = new Map(
        results.map((item) => [item.requestId, item.result]),
      );
      expect(resultById.get("quick-switch-before")?.availability).toBe(
        "observed",
      );
      const oldPage = resultById.get("quick-switch-old-page");
      expect(oldPage?.availability).toBe("unavailable");
      expect(
        oldPage?.reasons?.some((reason) =>
          [
            "page-not-active",
            "no-active-preview",
            "preview-unmounted",
          ].includes(reason),
        ),
      ).toBe(true);
      const activePage = resultById.get("quick-switch-active-page");
      expect(activePage?.availability).toBe("observed");
      expect(activePage?.identity?.pageId).toBe(switchPageId);
    } finally {
      await agentDouble?.close();
    }
  });

  test("two browser tabs only observe their originating connection", async ({
    page,
  }, testInfo) => {
    test.skip(
      !RUN_REAL_PREVIEW_BROKER_E2E,
      "multi-tab evidence requires the real Agent Service/Broker connection path",
    );
    test.setTimeout(180000);
    const secondTab = await page.context().newPage();
    const firstFrames: Record<string, unknown>[] = [];
    const secondFrames: Record<string, unknown>[] = [];
    const installFrameCapture = async (tab: Page) => {
      await tab.addInitScript(() => {
        const frames: Array<Record<string, unknown>> = [];
        Object.defineProperty(window, "__previewObservationFrames", {
          configurable: true,
          value: frames,
        });
        const NativeWebSocket = window.WebSocket;
        const CapturingWebSocket = function (...args: any[]) {
          const socket = new (NativeWebSocket as any)(...args) as any;
          socket.addEventListener("message", (event: MessageEvent) => {
            if (typeof event.data !== "string") return;
            try {
              frames.push(JSON.parse(event.data) as Record<string, unknown>);
            } catch {
              // Ignore non-JSON messages from HMR or unrelated sockets.
            }
          });
          return socket;
        } as any;
        CapturingWebSocket.prototype = NativeWebSocket.prototype;
        Object.assign(CapturingWebSocket, {
          CONNECTING: NativeWebSocket.CONNECTING,
          OPEN: NativeWebSocket.OPEN,
          CLOSING: NativeWebSocket.CLOSING,
          CLOSED: NativeWebSocket.CLOSED,
        });
        (window as any).WebSocket = CapturingWebSocket;
      });
    };
    await Promise.all([
      installFrameCapture(page),
      installFrameCapture(secondTab),
    ]);
    page.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          firstFrames.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    secondTab.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          secondFrames.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    try {
      await loginE2EUser(page, getE2ELoginCredentials());
      const fixture = await createPreviewObservationFixture(
        page,
        `OBS-009 多标签连接隔离 ${testInfo.testId}`,
      );
      const secondPageId = await addPreviewObservationPage(page, fixture);
      await openFixtureEditor(page, fixture);
      expect(fixture.workspaceId).toBeTruthy();
      await openFixtureEditor(secondTab, fixture, {
        workspaceId: fixture.workspaceId,
      });

      const secondPagePicker = secondTab.getByRole("combobox", {
        name: "选择预览页面",
      });
      await secondPagePicker.click();
      await secondTab
        .getByRole("option")
        .filter({ hasText: "观察验收切换页" })
        .click();
      await expect(secondPagePicker).toContainText("观察验收切换页", {
        timeout: EDITOR_READY_TIMEOUT_MS,
      });

      const submitShortcut =
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
      const firstInput = page
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      const secondInput = secondTab
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      await expect(firstInput).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      await expect(secondInput).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      await firstInput.fill(
        `multi-tab-a: active-page=${fixture.pageId} cross-page=${secondPageId}; 观察 demos/${fixture.pageId}/prototype.html`,
      );
      await secondInput.fill(
        `multi-tab-b: active-page=${secondPageId} cross-page=${fixture.pageId}; 观察 demos/${secondPageId}/prototype.html`,
      );

      const syncFrames = async (
        tab: Page,
        frames: Record<string, unknown>[],
        cursor: { value: number },
      ) => {
        const captured = await tab.evaluate(
          () =>
            (
              window as unknown as {
                __previewObservationFrames?: Array<Record<string, unknown>>;
              }
            ).__previewObservationFrames ?? [],
        );
        frames.push(...captured.slice(cursor.value));
        cursor.value = captured.length;
      };
      const firstCursor = { value: 0 };
      const secondCursor = { value: 0 };
      const waitForFinish = async (
        tab: Page,
        frames: Record<string, unknown>[],
        cursor: { value: number },
      ) => {
        await expect
          .poll(
            async () => {
              await syncFrames(tab, frames, cursor);
              return frames.some((frame) =>
                ["finish", "error", "run_summary"].includes(String(frame.type)),
              );
            },
            { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
          )
          .toBe(true);
      };
      // Agent sessions serialize active runs. Keep both browser tabs open but
      // submit the turns sequentially so each completed run can rebind the
      // session's originating connection before the next tab starts.
      await firstInput.press(submitShortcut);
      await waitForFinish(page, firstFrames, firstCursor);
      // The second tab may receive the shared session's terminal status a
      // little after the first tab; refill after the first run so the submit
      // event is not lost while its input is transitioning from processing.
      await expect(secondInput).toBeVisible({
        timeout: REAL_RUN_TERMINAL_TIMEOUT_MS,
      });
      await secondInput.fill(
        `multi-tab-b: active-page=${secondPageId} cross-page=${fixture.pageId}; 观察 demos/${secondPageId}/prototype.html`,
      );
      await secondInput.click();
      await secondInput.press(submitShortcut);
      await waitForFinish(secondTab, secondFrames, secondCursor);
      await syncFrames(page, firstFrames, firstCursor);
      await syncFrames(secondTab, secondFrames, secondCursor);
      await testInfo.attach("preview-observation-multi-tab-first.json", {
        body: JSON.stringify(firstFrames, null, 2),
        contentType: "application/json",
      });
      await testInfo.attach("preview-observation-multi-tab-second.json", {
        body: JSON.stringify(secondFrames, null, 2),
        contentType: "application/json",
      });

      const detailsFor = (
        frames: Record<string, unknown>[],
        id: string,
      ): PreviewObservationResult | undefined => {
        const update = frames.find(
          (frame) =>
            frame.type === "tool_call_update" &&
            String(frame.toolCallId ?? "") === id,
        );
        return update?.details as PreviewObservationResult | undefined;
      };
      for (const [frames, ownPageId] of [
        [firstFrames, fixture.pageId],
        [secondFrames, secondPageId],
      ] as const) {
        const ownBefore = detailsFor(frames, "e2e-tab-own-before");
        const cross = detailsFor(frames, "e2e-tab-cross");
        const ownAfter = detailsFor(frames, "e2e-tab-own-after");
        expect(ownBefore?.availability).toBe("observed");
        expect(ownBefore?.identity?.pageId).toBe(ownPageId);
        expect(cross?.availability).toBe("unavailable");
        expect(cross?.reasons).toContain("page-not-active");
        expect(ownAfter?.availability).toBe("observed");
        expect(ownAfter?.identity?.pageId).toBe(ownPageId);
      }
    } finally {
      await secondTab.close();
    }
  });

  test("high-fidelity runtime errors remain observable before LOADED", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
      const frames: Array<Record<string, unknown>> = [];
      Object.defineProperty(window, "__previewObservationFrames", {
        configurable: true,
        value: frames,
      });
      const NativeWebSocket = (window as any).WebSocket;
      const CapturingWebSocket = function (...args: any[]) {
        const socket = new NativeWebSocket(...args) as any;
        socket.addEventListener("open", () => {
          frames.push({ type: "__open", url: String(socket.url) });
        });
        socket.addEventListener("message", (event: MessageEvent) => {
          if (typeof event.data !== "string") return;
          try {
            frames.push(JSON.parse(event.data) as Record<string, unknown>);
          } catch {
            // Ignore non-JSON messages from HMR or unrelated sockets.
          }
        });
        return socket;
      } as any;
      CapturingWebSocket.prototype = NativeWebSocket.prototype;
      Object.assign(CapturingWebSocket, {
        CONNECTING: NativeWebSocket.CONNECTING,
        OPEN: NativeWebSocket.OPEN,
        CLOSING: NativeWebSocket.CLOSING,
        CLOSED: NativeWebSocket.CLOSED,
      });
      (window as any).WebSocket = CapturingWebSocket;
    });
    const agentDouble = RUN_REAL_PREVIEW_BROKER_E2E
      ? null
      : new PreviewObservationAgentDouble();
    if (agentDouble) await agentDouble.start();
    const realFrames: Record<string, unknown>[] = [];
    page.on("websocket", (socket) => {
      socket.on("framereceived", (data) => {
        const raw = typeof data === "string" ? data : String(data);
        try {
          realFrames.push(JSON.parse(raw) as Record<string, unknown>);
        } catch {
          // Ignore binary/non-JSON frames from unrelated sockets.
        }
      });
    });
    try {
      await loginE2EUser(page, getE2ELoginCredentials());
      const fixture = await createPreviewObservationRuntimeErrorFixture(
        page,
        `OBS-105 高保真 runtime error ${testInfo.testId}`,
      );
      if (agentDouble) {
        await installAgentSocketRedirect(page, agentDouble.url);
        await page.route("**/api/tools/capabilities", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              success: true,
              data: { toolVersion: 1, toolNames: ["observePreview"] },
            }),
          });
        });
      }
      await page.goto(`${E2E_BASE_URL}/demo/${fixture.projectId}/edit`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: /E2E:/ })).toBeVisible({
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      await expect(page.locator('iframe[title="预览"]')).toHaveCount(1, {
        timeout: EDITOR_READY_TIMEOUT_MS,
      });
      await expect
        .poll(
          async () =>
            page
              .locator('iframe[title="预览"]')
              .evaluate(
                (iframe) =>
                  (
                    iframe as HTMLIFrameElement
                  ).contentDocument?.documentElement.getAttribute(
                    "data-preview-runtime-error",
                  ) ?? null,
              ),
          { timeout: EDITOR_READY_TIMEOUT_MS },
        )
        .not.toBeNull();

      const input = page
        .locator('[contenteditable="true"][aria-placeholder*="输入指令"]')
        .first();
      await expect(input).toBeVisible({ timeout: EDITOR_READY_TIMEOUT_MS });
      if (RUN_REAL_PREVIEW_BROKER_E2E) {
        await page.waitForFunction(
          () =>
            (
              window as unknown as {
                __previewObservationFrames?: Array<Record<string, unknown>>;
              }
            ).__previewObservationFrames?.some(
              (frame) =>
                frame.type === "__open" ||
                (frame.type === "status" && frame.status === "connected"),
            ) ?? false,
          undefined,
          { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
        );
      }
      await input.fill(
        `请观察当前 runtime-error 预览，确认 runtime error 能被 observePreview 记录；页面是 demos/${fixture.pageId}/index.tsx`,
      );
      await input.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );
      let observation: PreviewObservationResult | undefined;
      if (agentDouble) {
        await agentDouble.waitForScenario();
        observation = agentDouble.observedResults.find(
          (item) => item.requestId === "runtime-error",
        )?.result;
      } else {
        await page.waitForFunction(
          () =>
            (
              window as unknown as {
                __previewObservationFrames?: Array<Record<string, unknown>>;
              }
            ).__previewObservationFrames?.some((frame) =>
              ["finish", "error", "run_summary"].includes(String(frame.type)),
            ) ?? false,
          undefined,
          { timeout: REAL_RUN_TERMINAL_TIMEOUT_MS },
        );
        const capturedFrames = await page.evaluate(
          () =>
            (
              window as unknown as {
                __previewObservationFrames?: Array<Record<string, unknown>>;
              }
            ).__previewObservationFrames ?? [],
        );
        const framePool = [...realFrames, ...capturedFrames];
        realFrames.push(...capturedFrames);
        const summaryMessage = framePool.find(
          (frame) => frame.type === "run_summary",
        );
        const observations = ((
          summaryMessage?.runSummary as { observations?: unknown[] } | undefined
        )?.observations ?? []) as Array<Record<string, unknown>>;
        expect(observations.length).toBeGreaterThanOrEqual(1);
        const toolUpdates = framePool
          .filter(
            (frame) =>
              frame.type === "tool_call_update" &&
              /^e2e-runtime-observe-\d+$/u.test(String(frame.toolCallId ?? "")),
          )
          .map((frame) => frame.details as PreviewObservationResult | undefined)
          .filter(
            (details): details is PreviewObservationResult =>
              details?.availability === "observed",
          );
        if (!observation && toolUpdates.length > 0) {
          observation = toolUpdates.at(-1);
        }
        await testInfo.attach(
          "preview-observation-runtime-error-real-frames.json",
          {
            body: JSON.stringify(realFrames, null, 2),
            contentType: "application/json",
          },
        );
      }
      expect(observation?.availability).toBe("observed");
      expect(observation?.runtime?.runtimeErrorCount).toBeGreaterThan(0);
      expect(observation?.assertionStatus).toBe("failed");
      expect(observation?.assertions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "no-runtime-errors",
            status: "failed",
          }),
        ]),
      );
      await testInfo.attach("preview-observation-runtime-error.json", {
        body: JSON.stringify(observation, null, 2),
        contentType: "application/json",
      });
    } finally {
      await agentDouble?.close();
    }
  });
});
