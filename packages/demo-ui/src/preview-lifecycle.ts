export type PreviewRequestPhase =
  | "idle"
  | "compiling"
  | "waiting-shell"
  | "rendering"
  | "ready"
  | "failed"
  | "timed-out"
  | "cancelled";

export interface PreviewRequestState {
  requestId: number;
  phase: PreviewRequestPhase;
  error: string | null;
}

export type PreviewRequestAction =
  | { type: "RESET" }
  | { type: "START"; requestId: number; phase?: "compiling" | "waiting-shell" }
  | { type: "COMPILED"; requestId: number; shellReady: boolean }
  | { type: "RENDERING"; requestId: number }
  | { type: "READY"; requestId: number }
  | { type: "FAIL"; requestId: number; error: string }
  | { type: "TIMEOUT"; requestId: number; error: string }
  | { type: "CANCEL"; requestId: number };

export const INITIAL_PREVIEW_REQUEST_STATE: PreviewRequestState = {
  requestId: -1,
  phase: "idle",
  error: null,
};

export function previewRequestReducer(
  state: PreviewRequestState,
  action: PreviewRequestAction,
): PreviewRequestState {
  if (action.type === "RESET") return INITIAL_PREVIEW_REQUEST_STATE;
  if (action.type === "START") {
    return {
      requestId: action.requestId,
      phase: action.phase ?? "compiling",
      error: null,
    };
  }
  if (action.requestId !== state.requestId) return state;

  switch (action.type) {
    case "COMPILED":
      return {
        ...state,
        phase: action.shellReady ? "rendering" : "waiting-shell",
      };
    case "RENDERING":
      return state.phase === "ready" ? state : { ...state, phase: "rendering" };
    case "READY":
      return { ...state, phase: "ready", error: null };
    case "FAIL":
      return { ...state, phase: "failed", error: action.error };
    case "TIMEOUT":
      return { ...state, phase: "timed-out", error: action.error };
    case "CANCEL":
      return { ...state, phase: "cancelled" };
    default:
      return state;
  }
}

export function isPreviewRequestPending(phase: PreviewRequestPhase): boolean {
  return phase === "compiling" || phase === "waiting-shell" || phase === "rendering";
}
