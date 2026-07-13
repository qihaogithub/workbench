import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  WorkspaceMutationCommittedEvent,
  WorkspaceMutationReceipt,
  WorkspaceMutationRequest,
  WorkspaceProjectionAck,
  WorkspaceProjectionAcknowledgedEvent,
} from "@workbench/shared/contracts";
import {
  assertManagedWorkspaceTextWrite,
  isManagedWorkspaceResource,
  normalizeWorkspaceResourcePath,
} from "@workbench/shared/contracts";

import {
  appendWorkspaceAuthorityDiagnostic,
  appendWorkspaceProjectionDiagnostic,
} from "./workspace-authority-diagnostics";

function hashWorkspaceContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

export interface WorkspaceAuthorityState {
  workspaceId: string;
  projectId: string;
  revision: number;
  rootHash: string;
  resourceHashes: Record<string, string>;
  mutationPayloads: Record<string, string>;
  updatedAt: number;
}

export interface WorkspaceAuthoritySnapshot {
  state: WorkspaceAuthorityState;
  resources: Record<string, string>;
}

export interface WorkspaceAuthorityHealth {
  workspaceId: string;
  projectId?: string;
  ready: boolean;
  stateExists: boolean;
  workspaceExists: boolean;
  revision?: number;
  rootHash?: string;
  actualRootHash?: string;
  externalDrift: boolean;
  queueDepth: number;
  activeLease: boolean;
  preparedCount: number;
  recoveryState: "ready" | "pending";
  recoveryPendingCount: number;
  conflictCount: number;
  eventSubscriberCount: number;
  stagingCount: number;
  backupCount: number;
  missingBackupCount: number;
  receiptCount: number;
  journalEntries: number;
  projectionAckEntries: number;
  checkedAt: number;
}

export interface WorkspaceAuthorityRecoveryResult {
  workspaceId: string;
  projectId: string;
  recoveredCount: number;
  rolledBackCount: number;
  committedCleanupCount: number;
}

interface PreparedMutation {
  request: WorkspaceMutationRequest;
  payloadHash: string;
  previousState: WorkspaceAuthorityState;
  before: Record<string, { exists: boolean; content?: string | Buffer | { type: "Buffer"; data: number[] }; hash: string | null }>;
  preparedAt?: number;
}

interface PreparedReconcileRestore {
  reconcileId: string;
  projectId: string;
  workspaceId: string;
  state: WorkspaceAuthorityState;
  before: PreparedMutation["before"];
  preparedAt: number;
}

export interface CollabDraftProvider {
  flushDraftsForMutation(request: WorkspaceMutationRequest): Promise<void>;
}

export class WorkspaceMutationAuthorityError extends Error {
  constructor(
    readonly code: string,
    message = code,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/**
 * The only durable writer for an activated live Workspace. The queue is kept
 * per Workspace and state/journal live outside the editable directory so a
 * failed multi-file mutation can be recovered without trusting partial files.
 */
export class WorkspaceMutationAuthority {
  // Several adapters (collab, HTTP, and Pi tools) instantiate this class. The
  // serialization and committed-event bus must nevertheless be process-wide,
  // otherwise two instances can race on the same live Workspace.
  private static readonly queues = new Map<string, Promise<unknown>>();
  private static readonly queueDepths = new Map<string, number>();
  private static readonly listeners = new Map<string, Set<(event: WorkspaceMutationCommittedEvent) => void>>();
  private static readonly projectionListeners = new Map<string, Set<(event: WorkspaceProjectionAcknowledgedEvent) => void>>();
  private static readonly draftProviders = new Map<string, Set<CollabDraftProvider>>();

  constructor(
    private readonly options: {
      dataDir: string;
      resolveWorkspacePath: (workspaceId: string) => string | null;
    },
  ) {}

  onCommitted(listener: (event: WorkspaceMutationCommittedEvent) => void): () => void {
    const listeners = WorkspaceMutationAuthority.listenersFor(this.options.dataDir);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  onProjectionAck(listener: (event: WorkspaceProjectionAcknowledgedEvent) => void): () => void {
    const listeners = WorkspaceMutationAuthority.projectionListenersFor(this.options.dataDir);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async getCommittedEventsSince(
    projectId: string,
    workspaceId: string,
    afterRevision: number,
  ): Promise<WorkspaceMutationCommittedEvent[]> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const state = this.ensureBootstrap(projectId, workspaceId);
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const directory = path.join(this.authorityDir(workspaceId), "receipts");
      if (!fs.existsSync(directory)) return [];
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map((entry) => this.readJson<WorkspaceMutationReceipt>(path.join(directory, entry.name)))
        .filter((receipt) => receipt.projectId === projectId && receipt.workspaceId === workspaceId && receipt.revision > afterRevision)
        .sort((left, right) => left.revision - right.revision)
        .map((receipt) => ({ type: "workspace_mutation_committed" as const, receipt }));
    }));
  }

  async getProjectionAcks(
    projectId: string,
    workspaceId: string,
    afterRevision = 0,
  ): Promise<WorkspaceProjectionAck[]> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const state = this.ensureBootstrap(projectId, workspaceId);
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const file = path.join(this.authorityDir(workspaceId), "projection-acks.jsonl");
      if (!fs.existsSync(file)) return [];
      return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).flatMap((line) => {
        try {
          const ack = JSON.parse(line) as WorkspaceProjectionAck;
          return ack.projectId === projectId && ack.workspaceId === workspaceId && ack.revision > afterRevision ? [ack] : [];
        } catch {
          return [];
        }
      }).sort((left, right) => left.acknowledgedAt - right.acknowledgedAt);
    }));
  }

  static registerDraftProvider(dataDir: string, provider: CollabDraftProvider): () => void {
    const providers = WorkspaceMutationAuthority.draftProvidersFor(dataDir);
    providers.add(provider);
    return () => providers.delete(provider);
  }

  async bootstrap(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityState> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => this.ensureBootstrap(projectId, workspaceId)));
  }

  async recover(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityRecoveryResult> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const workspacePath = this.workspacePath(workspaceId);
      const mutationRecovery = this.recoverPreparedMutations(workspaceId, workspacePath);
      const reconcileRecovery = this.recoverPreparedReconciles(workspaceId, workspacePath);
      const state = this.readState(workspaceId);
      if (!state) throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_NOT_READY");
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const actualHashes = this.readResourceHashes(workspacePath);
      const actualRootHash = this.rootHash(actualHashes);
      if (actualRootHash === state.rootHash) {
        this.persistCommittedBackups(workspaceId, workspacePath, state.resourceHashes);
      } else if (mutationRecovery.recoveredCount + reconcileRecovery.recoveredCount > 0) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_EXTERNAL_DRIFT", "Recovered Workspace does not match Authority state");
      }
      return {
        workspaceId,
        projectId,
        recoveredCount: mutationRecovery.recoveredCount + reconcileRecovery.recoveredCount,
        rolledBackCount: mutationRecovery.rolledBackCount + reconcileRecovery.rolledBackCount,
        committedCleanupCount: mutationRecovery.committedCleanupCount + reconcileRecovery.committedCleanupCount,
      };
    }));
  }

  async getState(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityState> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => this.ensureBootstrap(projectId, workspaceId)));
  }

  async getSnapshot(projectId: string, workspaceId: string): Promise<WorkspaceAuthoritySnapshot> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const state = this.ensureBootstrap(projectId, workspaceId);
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const workspacePath = this.workspacePath(workspaceId);
      const actual = this.readResourceHashes(workspacePath);
      if (this.rootHash(actual) !== state.rootHash) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_EXTERNAL_DRIFT");
      }
      const resources: Record<string, string> = {};
      for (const resourcePath of Object.keys(state.resourceHashes)) {
        // Binary resources are addressed by their hash/staging contract and
        // intentionally excluded from the JSON text snapshot.
        if (resourcePath.startsWith("assets/")) continue;
        resources[resourcePath] = this.contentBuffer(this.readResource(workspacePath, resourcePath).content).toString("utf-8");
      }
      return { state, resources };
    }));
  }

  getHealth(projectId: string, workspaceId: string): WorkspaceAuthorityHealth {
    const workspacePath = this.options.resolveWorkspacePath(workspaceId);
    const state = this.readState(workspaceId);
    const workspaceExists = Boolean(workspacePath && fs.existsSync(workspacePath));
    const actualHashes = workspaceExists && workspacePath ? this.readResourceHashes(workspacePath) : null;
    const actualRootHash = actualHashes ? this.rootHash(actualHashes) : undefined;
    const externalDrift = Boolean(state && actualRootHash && actualRootHash !== state.rootHash);
    const activeLease = fs.existsSync(this.leasePath(workspaceId));
    const preparedCount =
      this.countFiles(path.join(this.authorityDir(workspaceId), "prepared"), ".json") +
      this.countFiles(path.join(this.authorityDir(workspaceId), "reconcile-prepared"), ".json");
    const missingBackupCount = state ? this.missingCommittedBackupCount(workspaceId, state.resourceHashes) : 0;
    return {
      workspaceId,
      projectId: state?.projectId ?? projectId,
      ready: Boolean(
        state &&
        workspaceExists &&
        !externalDrift &&
        !activeLease &&
        preparedCount === 0 &&
        missingBackupCount === 0,
      ),
      stateExists: Boolean(state),
      workspaceExists,
      revision: state?.revision,
      rootHash: state?.rootHash,
      actualRootHash,
      externalDrift,
      queueDepth: this.queueDepth(workspaceId),
      activeLease,
      preparedCount,
      recoveryState: preparedCount > 0 ? "pending" : "ready",
      recoveryPendingCount: preparedCount,
      conflictCount: this.countJournalRecords(workspaceId, "conflicted"),
      eventSubscriberCount: WorkspaceMutationAuthority.listenersFor(this.options.dataDir).size,
      stagingCount: this.countFiles(path.join(this.authorityDir(workspaceId), "staging"), ".bin"),
      backupCount: this.countFiles(path.join(this.authorityDir(workspaceId), "backups"), ".bin"),
      missingBackupCount,
      receiptCount: this.countFiles(path.join(this.authorityDir(workspaceId), "receipts"), ".json"),
      journalEntries: this.countJsonl(path.join(this.authorityDir(workspaceId), "journal.jsonl")),
      projectionAckEntries: this.countJsonl(path.join(this.authorityDir(workspaceId), "projection-acks.jsonl")),
      checkedAt: Date.now(),
    };
  }

  /** Explicitly accepts detected on-disk drift as a new audited revision. */
  async reconcileAdopt(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityState> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const workspacePath = this.workspacePath(workspaceId);
      const state = this.readState(workspaceId) ?? this.ensureBootstrap(projectId, workspaceId);
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const resourceHashes = this.readResourceHashes(workspacePath);
      const rootHash = this.rootHash(resourceHashes);
      if (rootHash === state.rootHash) return state;
      this.persistCommittedBackups(workspaceId, workspacePath, resourceHashes);
      const reconciled: WorkspaceAuthorityState = {
        ...state,
        revision: state.revision + 1,
        rootHash,
        resourceHashes,
        updatedAt: Date.now(),
      };
      this.writeJsonAtomic(this.statePath(workspaceId), reconciled);
      this.appendJournal(workspaceId, { type: "reconciled", mode: "adopt", at: reconciled.updatedAt, revision: reconciled.revision });
      return reconciled;
    }));
  }

  /** Explicitly discards detected on-disk drift and restores the last committed state. */
  async reconcileRestore(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityState> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const workspacePath = this.workspacePath(workspaceId);
      this.recoverPreparedReconciles(workspaceId, workspacePath);
      const state = this.readState(workspaceId);
      if (!state) throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_NOT_READY");
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");

      const actualHashes = this.readResourceHashes(workspacePath);
      const actualRootHash = this.rootHash(actualHashes);
      if (actualRootHash === state.rootHash) return state;

      const committed = this.readCommittedBackups(workspaceId, state.resourceHashes);
      const reconcileId = crypto.randomUUID();
      const before: PreparedMutation["before"] = {};
      for (const resourcePath of new Set([...Object.keys(actualHashes), ...Object.keys(state.resourceHashes)])) {
        before[resourcePath] = this.readResource(workspacePath, resourcePath);
      }
      const prepared: PreparedReconcileRestore = {
        reconcileId,
        projectId,
        workspaceId,
        state,
        before,
        preparedAt: Date.now(),
      };
      this.writeJsonAtomic(this.reconcilePreparedPath(workspaceId, reconcileId), prepared);

      try {
        for (const resourcePath of Object.keys(actualHashes)) {
          if (!(resourcePath in state.resourceHashes)) {
            fs.rmSync(this.resolve(workspacePath, resourcePath), { force: true });
          }
        }
        for (const [resourcePath, content] of Object.entries(committed)) {
          this.writeBufferAtomic(this.resolve(workspacePath, resourcePath), content);
        }
        const restoredHashes = this.readResourceHashes(workspacePath);
        const restoredRootHash = this.rootHash(restoredHashes);
        if (restoredRootHash !== state.rootHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_EXTERNAL_DRIFT");
        }
        this.writeJsonAtomic(this.reconcileReceiptPath(workspaceId, reconcileId), {
          reconcileId,
          mode: "restore",
          projectId,
          workspaceId,
          revision: state.revision,
          rootHash: state.rootHash,
          restoredAt: Date.now(),
        });
        this.appendJournal(workspaceId, {
          type: "reconciled",
          mode: "restore",
          at: Date.now(),
          revision: state.revision,
          reconcileId,
          previousActualRootHash: actualRootHash,
        });
        fs.rmSync(this.reconcilePreparedPath(workspaceId, reconcileId), { force: true });
        return state;
      } catch (error) {
        this.restoreResourceSnapshot(before, workspacePath);
        fs.rmSync(this.reconcilePreparedPath(workspaceId, reconcileId), { force: true });
        this.appendJournal(workspaceId, { type: "rolled_back", mode: "restore", at: Date.now(), reconcileId });
        throw error;
      }
    }));
  }

  async recordProjectionAck(ack: WorkspaceProjectionAck & { sessionId?: string }): Promise<void> {
    await this.serial(ack.workspaceId, async () => this.withLease(ack.workspaceId, async () => {
      const state = this.ensureBootstrap(ack.projectId, ack.workspaceId);
      if (state.projectId !== ack.projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const operationId = ack.mutationId ?? `projection:${ack.surface}:${ack.clientId}:${ack.revision}`;
      const projectionLatencyMs = this.projectionLatencyMs(ack);
      if (ack.revision > state.revision) {
        appendWorkspaceProjectionDiagnostic({
          dataDir: this.options.dataDir,
          projectId: ack.projectId,
          workspaceId: ack.workspaceId,
          sessionId: ack.sessionId,
          eventType: "workspace.projection_failed",
          operationId,
          level: "warn",
          revision: ack.revision,
          currentRevision: state.revision,
          mutationId: ack.mutationId,
          clientId: ack.clientId,
          surface: ack.surface,
          errorCode: "WORKSPACE_RESOURCE_CONFLICT",
          acknowledgedAt: ack.acknowledgedAt,
          projectionLatencyMs,
        });
        throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_CONFLICT");
      }
      this.appendProjectionAck(ack.workspaceId, ack);
      const projectionEvent: WorkspaceProjectionAcknowledgedEvent = {
        type: "workspace_projection_acknowledged",
        ack,
      };
      WorkspaceMutationAuthority.projectionListenersFor(this.options.dataDir)
        .forEach((listener) => {
          try { listener(projectionEvent); } catch { /* observers cannot change durable ack outcome */ }
        });
      appendWorkspaceProjectionDiagnostic({
        dataDir: this.options.dataDir,
        projectId: ack.projectId,
        workspaceId: ack.workspaceId,
        sessionId: ack.sessionId,
        eventType: ack.status === "applied" ? "workspace.projection_applied" : "workspace.projection_failed",
        operationId,
        level: ack.status === "applied" ? "info" : "error",
        revision: ack.revision,
        currentRevision: state.revision,
        mutationId: ack.mutationId,
        clientId: ack.clientId,
        surface: ack.surface,
        errorCode: ack.runtimeError?.code,
        acknowledgedAt: ack.acknowledgedAt,
        projectionLatencyMs,
      });
      if (ack.revision < state.revision) {
        appendWorkspaceProjectionDiagnostic({
          dataDir: this.options.dataDir,
          projectId: ack.projectId,
          workspaceId: ack.workspaceId,
          sessionId: ack.sessionId,
          eventType: "workspace.projection_gap_detected",
          operationId,
          level: "warn",
          revision: ack.revision,
          currentRevision: state.revision,
          mutationId: ack.mutationId,
          clientId: ack.clientId,
          surface: ack.surface,
          acknowledgedAt: ack.acknowledgedAt,
          projectionLatencyMs,
        });
      }
    }));
  }

  /** Store untrusted binary bytes outside the editable Workspace until a
   * subsequent put_binary mutation validates and commits their exact hash. */
  async stageBinary(projectId: string, workspaceId: string, content: Buffer): Promise<{ stagingId: string; hash: string; size: number }> {
    if (content.length === 0 || content.length > 20 * 1024 * 1024) {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    }
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const state = this.ensureBootstrap(projectId, workspaceId);
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const stagingId = crypto.randomUUID();
      this.writeBufferAtomic(this.stagingPath(workspaceId, stagingId), content);
      return { stagingId, hash: hashWorkspaceContent(content), size: content.length };
    }));
  }

  async mutate(request: WorkspaceMutationRequest): Promise<WorkspaceMutationReceipt> {
    const startedAt = Date.now();
    const resourcePaths = this.mutationResourcePaths(request);
    let terminalRecorded = false;
    this.recordMutationDiagnostic(request, "workspace.mutation_received", "info", {
      mutationId: request.mutationId,
      baseRevision: request.baseRevision,
      actor: request.actor,
      resourcePaths,
      operationCount: request.operations.length,
    });
    try {
      if (request.actor !== "collab") {
        await this.flushDraftsForMutation(request);
      }
      const queuedAt = Date.now();
      return await this.serial(request.workspaceId, async () => this.withLease(request.workspaceId, async () => {
        const queueWaitMs = Date.now() - queuedAt;
        const state = this.ensureBootstrap(request.projectId, request.workspaceId);
        if (state.projectId !== request.projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
        const payloadHash = hashWorkspaceContent(JSON.stringify(request));
        const receiptPath = this.receiptPath(request.workspaceId, request.mutationId);
        if (fs.existsSync(receiptPath)) {
          if (state.mutationPayloads[request.mutationId] !== payloadHash) {
            throw new WorkspaceMutationAuthorityError("WORKSPACE_MUTATION_ID_REUSED");
          }
          const receipt = this.readJson<WorkspaceMutationReceipt>(receiptPath);
          terminalRecorded = true;
          this.recordMutationDiagnostic(request, "workspace.mutation_committed", "info", {
            mutationId: request.mutationId,
            baseRevision: request.baseRevision,
            revision: receipt.revision,
            actor: request.actor,
            resourcePaths,
            queueWaitMs,
            commitLatencyMs: Date.now() - startedAt,
            outcome: "idempotent_replay",
          });
          return receipt;
        }
        if (state.mutationPayloads[request.mutationId] && state.mutationPayloads[request.mutationId] !== payloadHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_MUTATION_ID_REUSED");
        }

        const workspacePath = this.workspacePath(request.workspaceId);
        const actual = this.readResourceHashes(workspacePath);
        if (this.rootHash(actual) !== state.rootHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_EXTERNAL_DRIFT");
        }
        const prepared = this.prepare(request, payloadHash, state, workspacePath);
        this.appendJournal(request.workspaceId, { type: "prepared", at: Date.now(), mutationId: request.mutationId, prepared });
        // Keep a recoverable copy outside the editable tree before touching any
        // resource. A process death between two renames must converge to the
        // previous committed state on the next Authority startup.
        this.writeJsonAtomic(this.preparedPath(request.workspaceId, request.mutationId), prepared);
        this.recordMutationDiagnostic(request, "workspace.mutation_prepared", "info", {
          mutationId: request.mutationId,
          baseRevision: request.baseRevision,
          actor: request.actor,
          resourcePaths,
          queueWaitMs,
          durationMs: Date.now() - startedAt,
        });
        try {
          const resources = this.apply(prepared, workspacePath);
          const nextHashes = this.readResourceHashes(workspacePath);
          const receipt: WorkspaceMutationReceipt = {
            committed: true,
            mutationId: request.mutationId,
            projectId: request.projectId,
            workspaceId: request.workspaceId,
            baseRevision: request.baseRevision,
            revision: state.revision + 1,
            rootHash: this.rootHash(nextHashes),
            actor: request.actor,
            resources,
            committedAt: Date.now(),
          };
          const nextState: WorkspaceAuthorityState = {
            ...state,
            revision: receipt.revision,
            rootHash: receipt.rootHash,
            resourceHashes: nextHashes,
            mutationPayloads: { ...state.mutationPayloads, [request.mutationId]: payloadHash },
            updatedAt: receipt.committedAt,
          };
          this.persistCommittedBackups(request.workspaceId, workspacePath, nextHashes);
          this.writeJsonAtomic(this.statePath(request.workspaceId), nextState);
          // State is durable before the receipt. A receipt is the externally
          // visible commit proof, so publishing it before state would permit a
          // crash to expose a committed file with an old revision.
          this.writeJsonAtomic(receiptPath, receipt);
          this.appendJournal(request.workspaceId, { type: "committed", at: Date.now(), mutationId: request.mutationId, revision: receipt.revision });
          fs.rmSync(this.preparedPath(request.workspaceId, request.mutationId), { force: true });
          this.removeStagedBinaries(request);
          terminalRecorded = true;
          this.recordMutationDiagnostic(request, "workspace.mutation_committed", "info", {
            mutationId: request.mutationId,
            baseRevision: request.baseRevision,
            revision: receipt.revision,
            actor: request.actor,
            resourcePaths: resources.map((resource) => resource.path),
            queueWaitMs,
            commitLatencyMs: receipt.committedAt - startedAt,
            outcome: "committed",
          });
          const event: WorkspaceMutationCommittedEvent = { type: "workspace_mutation_committed", receipt };
          WorkspaceMutationAuthority.listenersFor(this.options.dataDir).forEach((listener) => {
            try { listener(event); } catch { /* observers cannot change committed receipt outcome */ }
          });
          return receipt;
        } catch (error) {
          this.restore(prepared, workspacePath);
          this.writeJsonAtomic(this.statePath(request.workspaceId), prepared.previousState);
          fs.rmSync(this.preparedPath(request.workspaceId, request.mutationId), { force: true });
          this.removeStagedBinaries(request);
          this.appendJournal(request.workspaceId, { type: "rolled_back", at: Date.now(), mutationId: request.mutationId });
          terminalRecorded = true;
          this.recordMutationDiagnostic(request, "workspace.mutation_rolled_back", "error", {
            mutationId: request.mutationId,
            baseRevision: request.baseRevision,
            revision: prepared.previousState.revision,
            actor: request.actor,
            resourcePaths,
            errorCode: error instanceof WorkspaceMutationAuthorityError ? error.code : "WORKSPACE_MUTATION_FAILED",
            outcome: "applied_rollback",
            durationMs: Date.now() - startedAt,
          });
          throw error;
        }
      }));
    } catch (error) {
      if (!terminalRecorded) {
        const errorCode = error instanceof WorkspaceMutationAuthorityError ? error.code : "WORKSPACE_MUTATION_FAILED";
        const conflicted = [
          "WORKSPACE_RESOURCE_CONFLICT",
          "WORKSPACE_MUTATION_ID_REUSED",
          "WORKSPACE_EXTERNAL_DRIFT",
        ].includes(errorCode);
        if (conflicted) this.recordMutationConflict(request, errorCode);
        this.recordMutationDiagnostic(
          request,
          conflicted ? "workspace.mutation_conflicted" : "workspace.mutation_rolled_back",
          conflicted ? "warn" : "error",
          {
            mutationId: request.mutationId,
            baseRevision: request.baseRevision,
            revision: this.safeRevision(request.workspaceId),
            actor: request.actor,
            resourcePaths,
            errorCode,
            outcome: conflicted ? undefined : "rejected_before_prepare",
            durationMs: Date.now() - startedAt,
          },
        );
        if (errorCode === "WORKSPACE_EXTERNAL_DRIFT") {
          this.recordMutationDiagnostic(request, "workspace.external_drift_detected", "error", {
            mutationId: request.mutationId,
            baseRevision: request.baseRevision,
            revision: this.safeRevision(request.workspaceId),
            actor: request.actor,
            resourcePaths,
            errorCode,
            durationMs: Date.now() - startedAt,
          });
        }
      }
      throw error;
    }
  }

  private mutationResourcePaths(request: WorkspaceMutationRequest): string[] {
    return [...new Set(request.operations.flatMap((operation) => (
      operation.type === "move_path" ? [operation.from, operation.to] : [operation.path]
    )))].sort();
  }

  private recordMutationDiagnostic(
    request: WorkspaceMutationRequest,
    eventType: Parameters<typeof appendWorkspaceAuthorityDiagnostic>[0]["eventType"],
    level: "info" | "warn" | "error",
    payload: Record<string, unknown>,
  ): void {
    const revision = typeof payload.revision === "number" ? payload.revision : null;
    const durationMs = typeof payload.durationMs === "number"
      ? payload.durationMs
      : typeof payload.commitLatencyMs === "number"
        ? payload.commitLatencyMs
        : 0;
    appendWorkspaceAuthorityDiagnostic({
      dataDir: this.options.dataDir,
      projectId: request.projectId,
      workspaceId: request.workspaceId,
      eventType,
      mutationId: request.mutationId,
      sessionId: request.sessionId,
      baseRevision: request.baseRevision,
      revision,
      actor: request.actor,
      resourcePaths: this.mutationResourcePaths(request),
      durationMs,
      level,
      message: eventType,
      payload,
    });
  }

  private recordMutationConflict(request: WorkspaceMutationRequest, errorCode: string): void {
    try {
      this.appendJournal(request.workspaceId, {
        type: "conflicted",
        at: Date.now(),
        mutationId: request.mutationId,
        baseRevision: request.baseRevision,
        actor: request.actor,
        errorCode,
      });
    } catch {
      // The original conflict remains authoritative even if its health counter cannot be persisted.
    }
  }

  private safeRevision(workspaceId: string): number | undefined {
    try {
      return this.readState(workspaceId)?.revision;
    } catch {
      return undefined;
    }
  }

  private projectionLatencyMs(ack: WorkspaceProjectionAck): number | undefined {
    if (!ack.mutationId) return undefined;
    const receiptPath = this.receiptPath(ack.workspaceId, ack.mutationId);
    if (!fs.existsSync(receiptPath)) return undefined;
    try {
      const receipt = this.readJson<WorkspaceMutationReceipt>(receiptPath);
      return Math.max(0, ack.acknowledgedAt - receipt.committedAt);
    } catch {
      return undefined;
    }
  }

  private prepare(request: WorkspaceMutationRequest, payloadHash: string, state: WorkspaceAuthorityState, workspacePath: string): PreparedMutation {
    if (!request.mutationId || request.operations.length === 0) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const before: PreparedMutation["before"] = {};
    for (const operation of request.operations) {
      const paths = operation.type === "move_path" ? [operation.from, operation.to] : [operation.path];
      for (const resourcePath of paths) {
        const normalized = normalizeWorkspaceResourcePath(resourcePath);
        if (!normalized || !isManagedWorkspaceResource(normalized)) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        if (!(normalized in before)) before[normalized] = this.readResource(workspacePath, normalized);
      }
      if (operation.type === "put_text") {
        assertManagedWorkspaceTextWrite(operation.path, operation.content);
        this.assertExpected(before[operation.path], operation.expectedHash, operation.expectedAbsent, operation.path);
      } else if (operation.type === "put_binary") {
        if (!operation.path.startsWith("assets/") || !/^[0-9a-f-]{36}$/i.test(operation.stagingId) || operation.size <= 0 || operation.size > 20 * 1024 * 1024) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        const staged = this.stagingPath(request.workspaceId, operation.stagingId);
        if (!fs.existsSync(staged)) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        const content = fs.readFileSync(staged);
        if (content.length !== operation.size || hashWorkspaceContent(content) !== operation.hash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        this.assertExpected(before[operation.path], operation.expectedHash, operation.expectedAbsent, operation.path);
      } else if (operation.type === "delete_path") {
        this.assertExpected(before[operation.path], operation.expectedHash, false, operation.path);
      } else {
        this.assertExpected(before[operation.from], operation.expectedHash, false, operation.from);
        this.assertExpected(before[operation.to], undefined, operation.expectedTargetAbsent, operation.to);
      }
    }
    // A stale base is harmless only when every targeted resource still matched.
    if (request.baseRevision > state.revision) throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_CONFLICT");
    return { request, payloadHash, previousState: state, before, preparedAt: Date.now() };
  }

  private ensureBootstrap(projectId: string, workspaceId: string): WorkspaceAuthorityState {
    const workspacePath = this.workspacePath(workspaceId);
    this.recoverPreparedMutations(workspaceId, workspacePath);
    this.recoverPreparedReconciles(workspaceId, workspacePath);
    const existing = this.readState(workspaceId);
    if (existing) {
      const actualHashes = this.readResourceHashes(workspacePath);
      if (this.rootHash(actualHashes) === existing.rootHash) {
        this.persistCommittedBackups(workspaceId, workspacePath, existing.resourceHashes);
      }
      return existing;
    }
    const resourceHashes = this.readResourceHashes(workspacePath);
    const state: WorkspaceAuthorityState = {
      workspaceId,
      projectId,
      revision: 1,
      rootHash: this.rootHash(resourceHashes),
      resourceHashes,
      mutationPayloads: {},
      updatedAt: Date.now(),
    };
    this.persistCommittedBackups(workspaceId, workspacePath, resourceHashes);
    this.writeJsonAtomic(this.statePath(workspaceId), state);
    return state;
  }

  private apply(prepared: PreparedMutation, workspacePath: string): WorkspaceMutationReceipt["resources"] {
    const changes: WorkspaceMutationReceipt["resources"] = [];
    for (const operation of prepared.request.operations) {
      if (operation.type === "put_text") {
        const before = prepared.before[operation.path];
        this.writeTextAtomic(this.resolve(workspacePath, operation.path), operation.content);
        changes.push({ path: operation.path, action: before.exists ? "modified" : "created", beforeHash: before.hash, afterHash: hashWorkspaceContent(operation.content) });
      } else if (operation.type === "put_binary") {
        const before = prepared.before[operation.path];
        this.writeBufferAtomic(this.resolve(workspacePath, operation.path), fs.readFileSync(this.stagingPath(prepared.request.workspaceId, operation.stagingId)));
        changes.push({ path: operation.path, action: before.exists ? "modified" : "created", beforeHash: before.hash, afterHash: operation.hash });
      } else if (operation.type === "delete_path") {
        const before = prepared.before[operation.path];
        fs.rmSync(this.resolve(workspacePath, operation.path), { force: true });
        changes.push({ path: operation.path, action: "deleted", beforeHash: before.hash, afterHash: null });
      } else {
        const before = prepared.before[operation.from];
        const target = this.resolve(workspacePath, operation.to);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(this.resolve(workspacePath, operation.from), target);
        changes.push({ path: operation.to, action: "moved", beforeHash: before.hash, afterHash: before.hash });
      }
    }
    return changes;
  }

  private restore(prepared: PreparedMutation, workspacePath: string): void {
    this.restoreResourceSnapshot(prepared.before, workspacePath);
  }

  private restoreResourceSnapshot(before: PreparedMutation["before"], workspacePath: string): void {
    for (const [resourcePath, value] of Object.entries(before)) {
      const target = this.resolve(workspacePath, resourcePath);
      if (value.exists) this.writeBufferAtomic(target, this.contentBuffer(value.content));
      else fs.rmSync(target, { force: true });
    }
  }

  private assertExpected(value: PreparedMutation["before"][string], expectedHash: string | undefined, expectedAbsent: boolean | undefined, resourcePath: string): void {
    if ((expectedAbsent && value.exists) || (!expectedAbsent && expectedHash !== undefined && value.hash !== expectedHash)) {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_CONFLICT", "Workspace resource conflict", { path: resourcePath, currentHash: value.hash });
    }
  }

  private contentBuffer(content: PreparedMutation["before"][string]["content"]): Buffer {
    if (!content) return Buffer.alloc(0);
    if (typeof content === "string") return Buffer.from(content, "utf-8");
    if (Buffer.isBuffer(content)) return content;
    if (content.type === "Buffer" && Array.isArray(content.data)) return Buffer.from(content.data);
    throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
  }

  private readResourceHashes(workspacePath: string): Record<string, string> {
    const result: Record<string, string> = {};
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === ".workspace.json") continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else if (entry.isFile()) {
          const relative = path.relative(workspacePath, fullPath).split(path.sep).join("/");
          if (isManagedWorkspaceResource(relative)) result[relative] = hashWorkspaceContent(fs.readFileSync(fullPath));
        }
      }
    };
    walk(workspacePath);
    return result;
  }

  private rootHash(hashes: Record<string, string>): string {
    return hashWorkspaceContent(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}:${value}`).join("\n"));
  }

  private readResource(workspacePath: string, resourcePath: string): PreparedMutation["before"][string] {
    const target = this.resolve(workspacePath, resourcePath);
    if (!fs.existsSync(target)) return { exists: false, hash: null };
    const content = fs.readFileSync(target);
    return { exists: true, content, hash: hashWorkspaceContent(content) };
  }

  private workspacePath(workspaceId: string): string {
    const workspacePath = this.options.resolveWorkspacePath(workspaceId);
    if (!workspacePath || !fs.existsSync(workspacePath)) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
    return workspacePath;
  }

  private resolve(workspacePath: string, resourcePath: string): string {
    const normalized = normalizeWorkspaceResourcePath(resourcePath);
    if (!normalized) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    return path.resolve(workspacePath, normalized);
  }

  private serial<T>(workspaceId: string, work: () => Promise<T>): Promise<T> {
    const key = `${path.resolve(this.options.dataDir)}:${workspaceId}`;
    const previous = WorkspaceMutationAuthority.queues.get(key) ?? Promise.resolve();
    WorkspaceMutationAuthority.queueDepths.set(key, (WorkspaceMutationAuthority.queueDepths.get(key) ?? 0) + 1);
    const next = previous.catch(() => undefined).then(work);
    WorkspaceMutationAuthority.queues.set(key, next);
    return next.finally(() => {
      const depth = (WorkspaceMutationAuthority.queueDepths.get(key) ?? 1) - 1;
      if (depth > 0) WorkspaceMutationAuthority.queueDepths.set(key, depth);
      else WorkspaceMutationAuthority.queueDepths.delete(key);
      if (WorkspaceMutationAuthority.queues.get(key) === next) WorkspaceMutationAuthority.queues.delete(key);
    });
  }

  private queueDepth(workspaceId: string): number {
    return WorkspaceMutationAuthority.queueDepths.get(`${path.resolve(this.options.dataDir)}:${workspaceId}`) ?? 0;
  }

  private static listenersFor(dataDir: string): Set<(event: WorkspaceMutationCommittedEvent) => void> {
    const key = path.resolve(dataDir);
    let listeners = WorkspaceMutationAuthority.listeners.get(key);
    if (!listeners) {
      listeners = new Set();
      WorkspaceMutationAuthority.listeners.set(key, listeners);
    }
    return listeners;
  }

  private static projectionListenersFor(dataDir: string): Set<(event: WorkspaceProjectionAcknowledgedEvent) => void> {
    const key = path.resolve(dataDir);
    let listeners = WorkspaceMutationAuthority.projectionListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      WorkspaceMutationAuthority.projectionListeners.set(key, listeners);
    }
    return listeners;
  }

  private async flushDraftsForMutation(request: WorkspaceMutationRequest): Promise<void> {
    const providers = WorkspaceMutationAuthority.draftProvidersFor(this.options.dataDir);
    for (const provider of providers) {
      await provider.flushDraftsForMutation(request);
    }
  }

  private static draftProvidersFor(dataDir: string): Set<CollabDraftProvider> {
    const key = path.resolve(dataDir);
    let providers = WorkspaceMutationAuthority.draftProviders.get(key);
    if (!providers) {
      providers = new Set();
      WorkspaceMutationAuthority.draftProviders.set(key, providers);
    }
    return providers;
  }

  private async withLease<T>(workspaceId: string, work: () => Promise<T>): Promise<T> {
    const leasePath = this.leasePath(workspaceId);
    const token = `${process.pid}:${crypto.randomUUID()}`;
    fs.mkdirSync(path.dirname(leasePath), { recursive: true });
    try {
      fs.writeFileSync(leasePath, token, { encoding: "utf-8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_WRITE_LEASE_UNAVAILABLE");
      }
      throw error;
    }
    try {
      return await work();
    } finally {
      try {
        if (fs.existsSync(leasePath) && fs.readFileSync(leasePath, "utf-8") === token) {
          fs.rmSync(leasePath, { force: true });
        }
      } catch {
        // A failed release stays fail-closed: another process cannot write
        // until an explicit operator reconciliation removes the stale lease.
      }
    }
  }

  private authorityDir(workspaceId: string): string { return path.join(this.options.dataDir, "workspace-authority", workspaceId); }
  private leasePath(workspaceId: string): string { return path.join(this.options.dataDir, "workspace-authority", "leases", `${workspaceId}.lock`); }
  private statePath(workspaceId: string): string { return path.join(this.authorityDir(workspaceId), "state.json"); }
  private receiptPath(workspaceId: string, mutationId: string): string { return path.join(this.authorityDir(workspaceId), "receipts", `${mutationId}.json`); }
  private preparedPath(workspaceId: string, mutationId: string): string { return path.join(this.authorityDir(workspaceId), "prepared", `${mutationId}.json`); }
  private stagingPath(workspaceId: string, stagingId: string): string { return path.join(this.authorityDir(workspaceId), "staging", `${stagingId}.bin`); }
  private backupPath(workspaceId: string, hash: string): string { return path.join(this.authorityDir(workspaceId), "backups", `${hash}.bin`); }
  private reconcilePreparedPath(workspaceId: string, reconcileId: string): string { return path.join(this.authorityDir(workspaceId), "reconcile-prepared", `${reconcileId}.json`); }
  private reconcileReceiptPath(workspaceId: string, reconcileId: string): string { return path.join(this.authorityDir(workspaceId), "reconcile-receipts", `${reconcileId}.json`); }
  private readState(workspaceId: string): WorkspaceAuthorityState | null { const file = this.statePath(workspaceId); return fs.existsSync(file) ? this.readJson<WorkspaceAuthorityState>(file) : null; }
  private readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; }
  private writeTextAtomic(file: string, content: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`; fs.writeFileSync(tmp, content, "utf-8"); fs.renameSync(tmp, file); }
  private writeBufferAtomic(file: string, content: Buffer): void { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`; fs.writeFileSync(tmp, content); fs.renameSync(tmp, file); }
  private writeJsonAtomic(file: string, value: unknown): void { this.writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`); }
  private appendJournal(workspaceId: string, record: unknown): void { const file = path.join(this.authorityDir(workspaceId), "journal.jsonl"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8"); }
  private appendProjectionAck(workspaceId: string, ack: WorkspaceProjectionAck): void { const file = path.join(this.authorityDir(workspaceId), "projection-acks.jsonl"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(ack)}\n`, "utf-8"); }
  private countFiles(directory: string, suffix: string): number {
    if (!fs.existsSync(directory)) return 0;
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(suffix)).length;
  }
  private countJsonl(file: string): number {
    if (!fs.existsSync(file)) return 0;
    return fs.readFileSync(file, "utf-8").split("\n").filter((line) => line.trim().length > 0).length;
  }
  private countJournalRecords(workspaceId: string, type: string): number {
    const file = path.join(this.authorityDir(workspaceId), "journal.jsonl");
    if (!fs.existsSync(file)) return 0;
    return fs.readFileSync(file, "utf-8").split("\n").reduce((count, line) => {
      if (!line.trim()) return count;
      try {
        return (JSON.parse(line) as { type?: string }).type === type ? count + 1 : count;
      } catch {
        return count;
      }
    }, 0);
  }
  private removeStagedBinaries(request: WorkspaceMutationRequest): void {
    for (const operation of request.operations) {
      if (operation.type === "put_binary") fs.rmSync(this.stagingPath(request.workspaceId, operation.stagingId), { force: true });
    }
  }

  private persistCommittedBackups(workspaceId: string, workspacePath: string, resourceHashes: Record<string, string>): void {
    for (const [resourcePath, expectedHash] of Object.entries(resourceHashes)) {
      const resource = this.readResource(workspacePath, resourcePath);
      if (!resource.exists || resource.hash !== expectedHash) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_EXTERNAL_DRIFT");
      }
      const backupPath = this.backupPath(workspaceId, expectedHash);
      if (fs.existsSync(backupPath)) {
        if (hashWorkspaceContent(fs.readFileSync(backupPath)) !== expectedHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_BACKUP_MISSING");
        }
        continue;
      }
      this.writeBufferAtomic(backupPath, this.contentBuffer(resource.content));
    }
  }

  private readCommittedBackups(workspaceId: string, resourceHashes: Record<string, string>): Record<string, Buffer> {
    const committed: Record<string, Buffer> = {};
    for (const [resourcePath, expectedHash] of Object.entries(resourceHashes)) {
      const backupPath = this.backupPath(workspaceId, expectedHash);
      if (!fs.existsSync(backupPath)) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_BACKUP_MISSING", undefined, { path: resourcePath, hash: expectedHash });
      }
      const content = fs.readFileSync(backupPath);
      if (hashWorkspaceContent(content) !== expectedHash) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_BACKUP_MISSING", undefined, { path: resourcePath, hash: expectedHash });
      }
      committed[resourcePath] = content;
    }
    return committed;
  }

  private missingCommittedBackupCount(workspaceId: string, resourceHashes: Record<string, string>): number {
    return new Set(Object.values(resourceHashes)).size - new Set(
      Object.values(resourceHashes).filter((hash) => {
        const backupPath = this.backupPath(workspaceId, hash);
        return fs.existsSync(backupPath) && hashWorkspaceContent(fs.readFileSync(backupPath)) === hash;
      }),
    ).size;
  }

  private recoverPreparedMutations(workspaceId: string, workspacePath: string): Omit<WorkspaceAuthorityRecoveryResult, "workspaceId" | "projectId"> {
    const directory = path.join(this.authorityDir(workspaceId), "prepared");
    const result = { recoveredCount: 0, rolledBackCount: 0, committedCleanupCount: 0 };
    if (!fs.existsSync(directory)) return result;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const file = path.join(directory, entry.name);
      const prepared = this.readJson<PreparedMutation>(file);
      // Receipt + state are durable proof that the mutation already committed;
      // only cleanup was interrupted. Without a receipt, restore the backup.
      const receiptPath = this.receiptPath(workspaceId, prepared.request.mutationId);
      let outcome: "rolled_back" | "committed_cleanup";
      if (!fs.existsSync(receiptPath)) {
        this.restore(prepared, workspacePath);
        this.writeJsonAtomic(this.statePath(workspaceId), prepared.previousState);
        outcome = "rolled_back";
        result.rolledBackCount += 1;
      } else {
        const receipt = this.readJson<WorkspaceMutationReceipt>(receiptPath);
        const state = this.readState(workspaceId);
        if (!state || state.revision !== receipt.revision || state.rootHash !== receipt.rootHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_NOT_READY", "Committed receipt does not match Authority state");
        }
        outcome = "committed_cleanup";
        result.committedCleanupCount += 1;
      }
      this.removeStagedBinaries(prepared.request);
      this.appendJournal(workspaceId, { type: "recovered", at: Date.now(), mutationId: prepared.request.mutationId, outcome });
      appendWorkspaceAuthorityDiagnostic({
        dataDir: this.options.dataDir,
        projectId: prepared.request.projectId,
        workspaceId,
        eventType: "workspace.mutation_recovered",
        mutationId: prepared.request.mutationId,
        sessionId: prepared.request.sessionId,
        baseRevision: prepared.request.baseRevision,
        revision: this.readState(workspaceId)?.revision ?? null,
        actor: prepared.request.actor,
        resourcePaths: this.mutationResourcePaths(prepared.request),
        durationMs: Math.max(0, Date.now() - (prepared.preparedAt ?? prepared.previousState.updatedAt)),
        message: `Workspace mutation recovery ${outcome}`,
        payload: { mode: "mutation", outcome },
      });
      fs.rmSync(file, { force: true });
      result.recoveredCount += 1;
    }
    return result;
  }

  private recoverPreparedReconciles(workspaceId: string, workspacePath: string): Omit<WorkspaceAuthorityRecoveryResult, "workspaceId" | "projectId"> {
    const directory = path.join(this.authorityDir(workspaceId), "reconcile-prepared");
    const result = { recoveredCount: 0, rolledBackCount: 0, committedCleanupCount: 0 };
    if (!fs.existsSync(directory)) return result;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const file = path.join(directory, entry.name);
      const prepared = this.readJson<PreparedReconcileRestore>(file);
      const receiptPath = this.reconcileReceiptPath(workspaceId, prepared.reconcileId);
      let outcome: "rolled_back" | "committed_cleanup";
      if (!fs.existsSync(receiptPath)) {
        this.restoreResourceSnapshot(prepared.before, workspacePath);
        outcome = "rolled_back";
        result.rolledBackCount += 1;
      } else {
        const receipt = this.readJson<{ revision: number; rootHash: string }>(receiptPath);
        const state = this.readState(workspaceId);
        if (!state || state.revision !== receipt.revision || state.rootHash !== receipt.rootHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_AUTHORITY_NOT_READY", "Reconcile receipt does not match Authority state");
        }
        outcome = "committed_cleanup";
        result.committedCleanupCount += 1;
      }
      this.appendJournal(workspaceId, {
        type: "recovered",
        mode: "restore",
        at: Date.now(),
        reconcileId: prepared.reconcileId,
        outcome,
      });
      appendWorkspaceAuthorityDiagnostic({
        dataDir: this.options.dataDir,
        projectId: prepared.projectId,
        workspaceId,
        eventType: "workspace.mutation_recovered",
        mutationId: prepared.reconcileId,
        baseRevision: prepared.state.revision,
        revision: prepared.state.revision,
        actor: "system",
        resourcePaths: Object.keys(prepared.before),
        durationMs: Math.max(0, Date.now() - prepared.preparedAt),
        message: `Workspace reconcile recovery ${outcome}`,
        payload: { mode: "reconcile_restore", outcome, revision: prepared.state.revision },
      });
      fs.rmSync(file, { force: true });
      result.recoveredCount += 1;
    }
    return result;
  }
}

export function registerCollabDraftProvider(dataDir: string, provider: CollabDraftProvider): () => void {
  return WorkspaceMutationAuthority.registerDraftProvider(dataDir, provider);
}

/** Returns a live-workspace Authority request context, or null for branch/non-workspace paths. */
export function resolveLiveWorkspaceMutationContext(workspacePath: string): {
  authority: WorkspaceMutationAuthority;
  projectId: string;
  workspaceId: string;
} | null {
  // Tool construction is also used by isolated unit tests where `fs` is
  // deliberately mocked without sync APIs. Treat an unreadable marker as a
  // non-live workspace; production live workspaces must have a valid marker.
  try {
    const metaPath = path.join(workspacePath, ".workspace.json");
    if (!fs.existsSync(metaPath)) return null;
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as { projectId?: string; demoId?: string; workspaceId?: string; scope?: string };
    const projectId = meta.projectId ?? meta.demoId;
    if (meta.scope !== "live" || !projectId || !meta.workspaceId) return null;
    let current = path.resolve(workspacePath);
    while (current !== path.dirname(current) && path.basename(current) !== "workspaces") current = path.dirname(current);
    if (path.basename(current) !== "workspaces") return null;
    const dataDir = path.dirname(current);
    return {
      projectId,
      workspaceId: meta.workspaceId,
      authority: new WorkspaceMutationAuthority({ dataDir, resolveWorkspacePath: (id) => id === meta.workspaceId ? workspacePath : null }),
    };
  } catch {
    return null;
  }
}
