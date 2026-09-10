import {
  PREVIEW_OBSERVATION_LIMITS,
  isPreviewObservationInput,
  isPreviewObservationPayloadWithinLimit,
  isPreviewObservationResult,
  isPreviewRenderIdentity,
  type ObservePreviewInput,
  type PreviewObservationResult,
  type PreviewRenderIdentity,
  type PreviewObservationCapability,
} from "@workbench/shared/demo/preview-observation";

export interface PreviewRegistration {
  identity: PreviewRenderIdentity;
  capabilities?: PreviewObservationCapability[];
}

export interface PreviewBrokerMessage {
  type: "preview_observe_request";
  previewRequestId: string;
  previewObservation: ObservePreviewInput;
}

interface PendingObservation {
  connectionId: string;
  expectedIdentity?: PreviewRenderIdentity;
  timer: ReturnType<typeof setTimeout>;
  abortCleanup?: () => void;
  resolve: (result: PreviewObservationResult) => void;
}

interface BrokerConnection {
  sessionId: string;
  send: (message: PreviewBrokerMessage) => void;
  registration: PreviewRegistration | null;
  pending: Set<string>;
}

function unavailable(reason: string): PreviewObservationResult {
  return {
    availability: "unavailable",
    readiness: "partial",
    capabilities: [],
    assertions: [],
    assertionStatus: "not-requested",
    evidence: { kind: "runtime-structure", precision: "layout" },
    reasons: [reason],
  };
}

function nextRequestId(): string {
  return `preview_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sameRenderIdentity(
  left: PreviewRenderIdentity | undefined,
  right: PreviewRenderIdentity | undefined,
): boolean {
  if (!left || !right) return false;
  return (
    left.schemaVersion === right.schemaVersion &&
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.pageId === right.pageId &&
    left.runtimeType === right.runtimeType &&
    left.surface === right.surface &&
    left.previewInstanceId === right.previewInstanceId &&
    left.renderGeneration === right.renderGeneration &&
    left.revision === right.revision &&
    left.rootHash === right.rootHash
  );
}

function clearPendingTimer(pending: PendingObservation): void {
  clearTimeout(pending.timer);
  pending.abortCleanup?.();
}

/** Connection-scoped broker. It never selects a page from another connection. */
export class PreviewObservationBroker {
  private readonly connections = new Map<string, BrokerConnection>();
  private readonly pending = new Map<string, PendingObservation>();

  registerConnection(
    connectionId: string,
    sessionId: string,
    send: (message: PreviewBrokerMessage) => void,
  ): void {
    // A reconnect may reuse a transport-level connection id. Treat the old
    // registration as closed before replacing it so no pending observation is
    // stranded on the overwritten connection object.
    if (this.connections.has(connectionId)) {
      this.unregisterConnection(connectionId);
    }
    this.connections.set(connectionId, {
      sessionId,
      send,
      registration: null,
      pending: new Set(),
    });
  }

  unregisterConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    for (const requestId of connection.pending) {
      const pending = this.pending.get(requestId);
      if (!pending) continue;
      clearPendingTimer(pending);
      pending.resolve(unavailable("connection-closed"));
      this.pending.delete(requestId);
    }
    this.connections.delete(connectionId);
  }

  registerPreview(
    connectionId: string,
    registration: PreviewRegistration,
  ): boolean {
    const connection = this.connections.get(connectionId);
    if (
      !connection ||
      !registration ||
      !isPreviewRenderIdentity(registration.identity) ||
      (registration.capabilities !== undefined &&
        (!Array.isArray(registration.capabilities) ||
          registration.capabilities.length > 8 ||
          registration.capabilities.some(
            (capability) =>
              ![
                "page-summary",
                "target-node",
                "ancestors",
                "layout",
                "runtime",
                "media",
                "media-probe",
                "painted-bounds",
                "assertions",
                "limited-host-facts",
              ].includes(capability),
          )))
    )
      return false;
    if (
      !isPreviewObservationPayloadWithinLimit(
        registration,
        PREVIEW_OBSERVATION_LIMITS.maxResponseBytes,
      )
    ) {
      return false;
    }
    connection.registration = registration;
    return true;
  }

  unregisterPreview(connectionId: string, previewInstanceId?: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    if (
      !previewInstanceId ||
      connection.registration?.identity.previewInstanceId === previewInstanceId
    ) {
      connection.registration = null;
      for (const requestId of connection.pending) {
        const pending = this.pending.get(requestId);
        if (!pending) continue;
        clearPendingTimer(pending);
        this.pending.delete(requestId);
        pending.resolve(unavailable("preview-unregistered"));
      }
      connection.pending.clear();
    }
  }

  getRegistration(connectionId: string): PreviewRegistration | null {
    return this.connections.get(connectionId)?.registration ?? null;
  }

  observe(
    connectionId: string,
    input: ObservePreviewInput,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<PreviewObservationResult> {
    const connection = this.connections.get(connectionId);
    if (!connection)
      return Promise.resolve(unavailable("no-originating-connection"));
    if (
      !isPreviewObservationInput(input) ||
      !isPreviewObservationPayloadWithinLimit(
        input,
        PREVIEW_OBSERVATION_LIMITS.maxRequestBytes,
      )
    ) {
      return Promise.resolve(unavailable("invalid-request"));
    }
    if (this.pending.size >= PREVIEW_OBSERVATION_LIMITS.maxPending) {
      return Promise.resolve(unavailable("observation-capacity"));
    }
    if (
      connection.pending.size >=
      PREVIEW_OBSERVATION_LIMITS.maxConcurrentPerConnection
    ) {
      return Promise.resolve(unavailable("connection-observation-capacity"));
    }
    if (signal?.aborted) {
      return Promise.resolve(unavailable("observation-cancelled"));
    }

    const requestId = nextRequestId();
    const boundedTimeout = Math.min(
      PREVIEW_OBSERVATION_LIMITS.maxTimeoutMs,
      Math.max(
        1,
        Number.isFinite(timeoutMs)
          ? Math.floor(timeoutMs as number)
          : PREVIEW_OBSERVATION_LIMITS.defaultTimeoutMs,
      ),
    );
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        connection.pending.delete(requestId);
        this.pending.delete(requestId);
        pending.abortCleanup?.();
        resolve(unavailable("observation-timeout"));
      }, boundedTimeout);
      const pending: PendingObservation = {
        connectionId,
        expectedIdentity: connection.registration?.identity,
        timer,
        resolve,
      };
      if (signal) {
        const onAbort = () => {
          clearPendingTimer(pending);
          connection.pending.delete(requestId);
          this.pending.delete(requestId);
          resolve(unavailable("observation-cancelled"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        pending.abortCleanup = () =>
          signal.removeEventListener("abort", onAbort);
      }
      this.pending.set(requestId, pending);
      connection.pending.add(requestId);
      try {
        const message: PreviewBrokerMessage = {
          type: "preview_observe_request",
          previewRequestId: requestId,
          previewObservation: input,
        };
        if (
          !isPreviewObservationPayloadWithinLimit(
            message,
            PREVIEW_OBSERVATION_LIMITS.maxRequestBytes,
          )
        ) {
          clearPendingTimer(pending);
          connection.pending.delete(requestId);
          this.pending.delete(requestId);
          resolve(unavailable("request-too-large"));
          return;
        }
        connection.send(message);
      } catch {
        clearPendingTimer(pending);
        connection.pending.delete(requestId);
        this.pending.delete(requestId);
        resolve(unavailable("transport-error"));
      }
    });
  }

  resolve(connectionId: string, requestId: string, result: unknown): boolean {
    const pending = this.pending.get(requestId);
    if (!pending || pending.connectionId !== connectionId) return false;
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }
    if (
      !isPreviewObservationResult(result) ||
      !isPreviewObservationPayloadWithinLimit(result)
    ) {
      clearPendingTimer(pending);
      this.pending.delete(requestId);
      connection.pending.delete(requestId);
      pending.resolve(unavailable("invalid-response"));
      return true;
    }
    const expectedIdentity =
      pending.expectedIdentity ?? connection.registration?.identity;
    if (
      expectedIdentity &&
      result.identity &&
      !sameRenderIdentity(expectedIdentity, result.identity)
    ) {
      clearPendingTimer(pending);
      this.pending.delete(requestId);
      connection.pending.delete(requestId);
      pending.resolve({
        availability: "stale",
        readiness: "partial",
        capabilities: [],
        assertions: [],
        assertionStatus: "not-requested",
        evidence: { kind: "runtime-structure", precision: "layout" },
        reasons: ["stale-preview-identity"],
      });
      return true;
    }
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    connection.pending.delete(requestId);
    pending.resolve(result);
    return true;
  }

  cancelConnection(connectionId: string): void {
    this.unregisterConnection(connectionId);
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}

export const previewObservationBroker = new PreviewObservationBroker();
