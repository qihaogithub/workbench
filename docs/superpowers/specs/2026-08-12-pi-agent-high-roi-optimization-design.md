# Pi Agent High-ROI Optimization Design

## Status

Approved design. Implementation is intentionally split into two phases. Data-driven model routing is excluded and tracked separately in `docs/plans/远期规划/AI对话与Agent-数据驱动模型路由方案.md`.

## Decisions

### Phase 1: protect side effects and reduce steady-state cost

1. A turn has an explicit effect phase. Full-turn LLM retries are permitted only before any tool starts. Once a tool starts, a failure returns structured progress and never replays the entire turn.
2. Tools and skills use progressive disclosure. Every profile exposes a short capability directory and an expansion path; detailed schemas are loaded only for the selected capability profile. Low-confidence editing requests use a broad authoring profile.
3. Current-turn attachments are injected directly. Historical attachments provide a compact index and are read only on explicit request or tool use. Enumeration is session-cached and invalidated by attachment changes.
4. Run logging uses an ordered asynchronous bounded queue. Lifecycle, mutation, permission, error, completion, and compaction events are durable; high-frequency stream/thought events are coalesced and may be dropped only under queue pressure.

### Phase 2: authoritative session continuity and user-visible outcomes

1. Server-side canonical checkpoints hold compacted context, recent turns, attachment index, model/capability versions, and minimal tool-result summaries. Resync is versioned and incremental; client full-history replay is only a bounded fallback.
2. Turn lifecycle becomes `idle → processing → aborting → cleaning_up → idle`. The harness is unavailable until abort and cleanup settle.
3. External content is wrapped as untrusted, provenance-labeled data with source budgets. Server-controlled system rules cannot be replaced by caller content.
4. Stream UI batches token deltas, avoids re-rendering history on each delta, and renders exactly one terminal error per run.
5. Typed run summaries travel through the WS protocol. UI distinguishes committed, verified, unverified, and failed modification outcomes.

## Invariants

- No automatic recovery may repeat an uncertain write side effect.
- A restricted capability profile never hides the existence of a needed capability; it exposes a safe request path.
- Client history cannot overwrite canonical server checkpoint state.
- Key execution evidence is retained even under logging backpressure.
- “Verified complete” requires a mutation receipt plus an applicable verification artifact.

## Validation

- Unit tests for retry gates, profiles, attachment loading, queue overflow, checkpoint choice, and state transitions.
- WS protocol tests for resync versions, run summaries, and terminal errors.
- Integration tests for tool-then-failure, cancel-then-next-message, disconnect teardown, and checkpoint resume.
- UI tests for delta batching, one-error rendering, and verified/unverified status.

## Rollout

Each behavior is separately feature-flagged. Start with diagnostics, enable incrementally, and revert capability restriction to the broad authoring profile if capability-request or task completion metrics regress.
