"use client";

import { useEffect, useRef } from "react";
import type { MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";
import {
  fetchAuthorReferenceCandidates,
  resolveAuthorReference,
} from "./markdown-reference-navigation";

export function useAuthorReferenceDeepLink(options: {
  ready: boolean;
  projectId: string;
  sessionId: string;
  workspaceId: string;
  navigate: (
    target: Exclude<MarkdownReferenceTarget, { kind: "project" }>,
    signal: AbortSignal,
  ) => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const context = useRef(options);
  context.current = options;
  const consumed = useRef<string | null>(null);
  const { ready, projectId, sessionId, workspaceId } = options;
  useEffect(() => {
    if (!ready) return;
    const uri = new URLSearchParams(window.location.search).get("reference");
    if (!uri || consumed.current === uri) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const candidates = await fetchAuthorReferenceCandidates(
          projectId,
          sessionId,
          "",
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const target = resolveAuthorReference(projectId, uri, candidates);
        await context.current.navigate(target, controller.signal);
        if (controller.signal.aborted) return;
        consumed.current = uri;
        const url = new URL(window.location.href);
        if (url.searchParams.get("reference") === uri) {
          url.searchParams.delete("reference");
          window.history.replaceState(window.history.state, "", url);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        consumed.current = uri;
        context.current.onError(error);
      }
    })();
    return () => controller.abort();
    // Page-tree projections and callback identities are deliberately excluded:
    // navigation itself updates them while the request is still in flight.
  }, [ready, projectId, sessionId, workspaceId]);
}
