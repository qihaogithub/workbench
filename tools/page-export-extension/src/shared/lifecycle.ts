import type { CaptureTaskState } from "./protocol.js";

export function isTerminalCapturePhase(phase: CaptureTaskState["phase"]): boolean {
  return phase === "ready" || phase === "failed" || phase === "cancelled";
}

export function shouldCloseOffscreen(input: {
  hasDocument: boolean;
  capturePortActive: boolean;
  phase: CaptureTaskState["phase"];
}): boolean {
  return input.hasDocument && !input.capturePortActive && isTerminalCapturePhase(input.phase);
}

export function isApprovedDownloadRequest(input: {
  state: CaptureTaskState;
  captureId: unknown;
  filename: unknown;
  objectUrl: unknown;
  extensionRoot: string;
}): boolean {
  return input.state.phase === "review_required"
    && typeof input.captureId === "string"
    && input.state.captureId === input.captureId
    && typeof input.filename === "string"
    && input.state.filename === input.filename
    && typeof input.objectUrl === "string"
    && input.objectUrl.startsWith(`blob:${input.extensionRoot}`);
}
