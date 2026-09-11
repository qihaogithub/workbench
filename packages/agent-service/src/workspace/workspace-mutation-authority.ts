import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { normalizeHtmlImport } from "@workbench/project-core/html-import";
import { classifyManagedDocumentPath } from "@workbench/project-core/document-proposal";
import {
  compareWorkspaceResourcePaths,
  createWorkspaceResourceRegistry,
  normalizeWorkspaceResourcePath,
} from "@workbench/project-core/workspace-resource-registry";

import type {
  WorkspaceMutationCommittedEvent,
  WorkspaceAuthorityHealth,
  WorkspaceMutationReceipt,
  WorkspaceMutationRequest,
  WorkspaceProjectionAck,
  WorkspaceProjectionAcknowledgedEvent,
} from "@workbench/shared/contracts";
import { extractDeclaredRegionIds, validateVisibilityRules } from "@workbench/shared";
import { logger } from "../utils/logger";
import { pruneJsonlFile } from "../utils/jsonl-retention";

import {
  appendWorkspaceAuthorityDiagnostic,
  appendWorkspaceProjectionDiagnostic,
} from "./workspace-authority-diagnostics";
import { validateConfigResourceMutation } from "../backends/pi-tools/config-mutation-validation";
import { AgentFileQueue } from "./agent-file-queue";

function hashWorkspaceContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

const workspaceResourceRegistry = createWorkspaceResourceRegistry();

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

export interface WorkspaceAuthorityRecoveryResult {
  workspaceId: string;
  projectId: string;
  recoveredCount: number;
  rolledBackCount: number;
  committedCleanupCount: number;
}

export interface WorkspaceAuthorityOperationalLogRetentionResult {
  workspaceId: string;
  journalEntriesRemoved: number;
  projectionAckEntriesRemoved: number;
  skippedPrepared: boolean;
  skippedLease?: boolean;
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
  before: Record<string, {
    exists: boolean;
    hash: string | null;
    contentBackupHash?: string;
  }>;
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
  private readonly agentFileQueue = new AgentFileQueue();

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
    const state = await this.ensureStateForRead(projectId, workspaceId);
    if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
    const directory = path.join(this.authorityDir(workspaceId), "receipts");
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => this.readJson<WorkspaceMutationReceipt>(path.join(directory, entry.name)))
      .filter((receipt) => receipt.projectId === projectId && receipt.workspaceId === workspaceId && receipt.revision > afterRevision)
      .sort((left, right) => left.revision - right.revision)
      .map((receipt) => ({ type: "workspace_mutation_committed" as const, receipt }));
  }

  async getMutationReceipt(
    projectId: string,
    workspaceId: string,
    mutationId: string,
  ): Promise<WorkspaceMutationReceipt> {
    const state = await this.ensureStateForRead(projectId, workspaceId);
    if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
    if (!mutationId || mutationId.includes("/") || mutationId.includes("\\") || mutationId.includes("..")) {
      throw new WorkspaceMutationAuthorityError("INVALID_REQUEST");
    }
    const receiptPath = this.receiptPath(workspaceId, mutationId);
    if (!fs.existsSync(receiptPath)) throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_NOT_FOUND", "Workspace mutation receipt not found");
    const receipt = this.readJson<WorkspaceMutationReceipt>(receiptPath);
    if (receipt.projectId !== projectId || receipt.workspaceId !== workspaceId || receipt.mutationId !== mutationId) {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_NOT_FOUND");
    }
    return receipt;
  }

  async getProjectionAcks(
    projectId: string,
    workspaceId: string,
    afterRevision = 0,
  ): Promise<WorkspaceProjectionAck[]> {
    const state = await this.ensureStateForRead(projectId, workspaceId);
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
  }

  static registerDraftProvider(dataDir: string, provider: CollabDraftProvider): () => void {
    const providers = WorkspaceMutationAuthority.draftProvidersFor(dataDir);
    providers.add(provider);
    return () => providers.delete(provider);
  }

  async bootstrap(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityState> {
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => this.ensureBootstrap(projectId, workspaceId)));
  }

  removeAuthority(workspaceId: string): void {
    const dir = this.authorityDir(workspaceId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      logger.info({ workspaceId }, "Workspace Authority 目录已清理");
    }
  }

  /**
   * Prune only operational JSONL logs. Recovery artifacts are deliberately
   * checked while holding the same per-workspace lease used by mutations so a
   * cleanup pass can never remove evidence needed to roll back an interrupted
   * transaction.
   */
  async pruneOperationalLogs(
    workspaceId: string,
    cutoffAt: number,
  ): Promise<WorkspaceAuthorityOperationalLogRetentionResult> {
    return this.serial(workspaceId, () => this.withLease(workspaceId, async () => {
      const authorityDir = this.authorityDir(workspaceId);
      const skippedPrepared = this.hasRecoveryArtifacts(workspaceId);
      const empty: WorkspaceAuthorityOperationalLogRetentionResult = {
        workspaceId,
        journalEntriesRemoved: 0,
        projectionAckEntriesRemoved: 0,
        skippedPrepared,
      };
      if (skippedPrepared) return empty;

      const journal = await pruneJsonlFile(
        path.join(authorityDir, "journal.jsonl"),
        cutoffAt,
        ["at"],
        (record) => this.compactPreparedJournalRecord(record),
      );
      const projectionAcks = await pruneJsonlFile(
        path.join(authorityDir, "projection-acks.jsonl"),
        cutoffAt,
        ["acknowledgedAt"],
      );
      return {
        ...empty,
        journalEntriesRemoved: journal.removedLines,
        projectionAckEntriesRemoved: projectionAcks.removedLines,
      };
    })).catch((error) => {
      if (error instanceof WorkspaceMutationAuthorityError && error.code === "WORKSPACE_WRITE_LEASE_UNAVAILABLE") {
        return {
          workspaceId,
          journalEntriesRemoved: 0,
          projectionAckEntriesRemoved: 0,
          skippedPrepared: false,
          skippedLease: true,
        };
      }
      throw error;
    });
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
    const state = await this.ensureStateForRead(projectId, workspaceId);
    if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
    return state;
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
    const missingBackups = state ? this.missingCommittedBackups(workspaceId, state.resourceHashes) : [];
    const missingBackupCount = missingBackups.length;
    const missingBackupHashCount = new Set(missingBackups.map((item) => item.hash)).size;
    let condition: WorkspaceAuthorityHealth["condition"];
    let recommendedAction: WorkspaceAuthorityHealth["recommendedAction"];
    if (!workspaceExists) {
      condition = "unrecoverable";
      recommendedAction = "none";
    } else if (!state) {
      condition = "unrecoverable";
      recommendedAction = "bootstrap";
    } else if (preparedCount > 0 || activeLease) {
      condition = "unrecoverable";
      recommendedAction = preparedCount > 0 ? "recover" : "none";
    } else if (externalDrift && missingBackupCount > 0) {
      condition = "unrecoverable";
      recommendedAction = "rebuild";
    } else if (missingBackupCount > 0) {
      condition = "backup_repairable";
      recommendedAction = "repair_backups";
    } else if (externalDrift) {
      condition = "drift_requires_decision";
      recommendedAction = "decide_restore_or_adopt";
    } else {
      condition = "healthy";
      recommendedAction = "none";
    }
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
      condition,
      recommendedAction,
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
      missingBackupHashCount,
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
      return this.reconcileAdoptInline(state, workspacePath, workspaceId);
    }));
  }

  /**
   * Inline reconcile-adopt that does NOT acquire serial/lease.
   * Used inside mutate() which already holds the serial queue and lease.
   */
  private reconcileAdoptInline(state: WorkspaceAuthorityState, workspacePath: string, workspaceId: string): WorkspaceAuthorityState {
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
      const reconcileBeforeDir = this.reconcileBeforeDir(workspaceId, reconcileId);
      const changedResourcePaths = [...new Set([...Object.keys(actualHashes), ...Object.keys(state.resourceHashes)])]
        .filter((resourcePath) => actualHashes[resourcePath] !== state.resourceHashes[resourcePath]);
      const before: PreparedReconcileRestore["before"] = {};
      try {
        for (const resourcePath of changedResourcePaths) {
          const snapshot = this.readResource(workspacePath, resourcePath);
          before[resourcePath] = {
            exists: snapshot.exists,
            hash: snapshot.hash,
            ...(snapshot.exists && snapshot.hash
              ? { contentBackupHash: snapshot.hash }
              : {}),
          };
          if (snapshot.exists && snapshot.hash) {
            this.writeBufferAtomic(
              path.join(reconcileBeforeDir, `${snapshot.hash}.bin`),
              this.contentBuffer(snapshot.content),
            );
          }
        }
      } catch (error) {
        fs.rmSync(reconcileBeforeDir, { recursive: true, force: true });
        throw error;
      }
      const prepared: PreparedReconcileRestore = {
        reconcileId,
        projectId,
        workspaceId,
        state,
        before,
        preparedAt: Date.now(),
      };
      try {
        this.writeJsonAtomic(this.reconcilePreparedPath(workspaceId, reconcileId), prepared);
      } catch (error) {
        fs.rmSync(reconcileBeforeDir, { recursive: true, force: true });
        throw error;
      }

      try {
        for (const resourcePath of Object.keys(actualHashes)) {
          if (!(resourcePath in state.resourceHashes)) {
            fs.rmSync(this.resolve(workspacePath, resourcePath), { force: true });
          }
        }
        for (const [resourcePath, content] of Object.entries(committed)) {
          if (actualHashes[resourcePath] !== state.resourceHashes[resourcePath]) {
            this.writeBufferAtomic(this.resolve(workspacePath, resourcePath), content);
          }
        }
        const restoredHashes = this.readResourceHashes(workspacePath);
        const restoredRootHash = this.rootHash(restoredHashes);
        if (!this.resourceHashesEqual(restoredHashes, state.resourceHashes)) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_EXTERNAL_DRIFT");
        }
        const reconciledState = restoredRootHash === state.rootHash
          ? state
          : { ...state, rootHash: restoredRootHash, updatedAt: Date.now() };
        if (reconciledState !== state) {
          this.writeJsonAtomic(this.statePath(workspaceId), reconciledState);
        }
        this.writeJsonAtomic(this.reconcileReceiptPath(workspaceId, reconcileId), {
          reconcileId,
          mode: "restore",
          projectId,
          workspaceId,
          revision: reconciledState.revision,
          rootHash: reconciledState.rootHash,
          restoredAt: Date.now(),
        });
        this.appendJournal(workspaceId, {
          type: "reconciled",
          mode: "restore",
          at: Date.now(),
          revision: reconciledState.revision,
          reconcileId,
          previousActualRootHash: actualRootHash,
        });
        fs.rmSync(this.reconcilePreparedPath(workspaceId, reconcileId), { force: true });
        fs.rmSync(reconcileBeforeDir, { recursive: true, force: true });
        return reconciledState;
      } catch (error) {
        this.restoreReconcileResourceSnapshot(before, workspacePath, reconcileBeforeDir);
        this.writeJsonAtomic(this.statePath(workspaceId), state);
        fs.rmSync(this.reconcileReceiptPath(workspaceId, reconcileId), { force: true });
        fs.rmSync(this.reconcilePreparedPath(workspaceId, reconcileId), { force: true });
        fs.rmSync(reconcileBeforeDir, { recursive: true, force: true });
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

  /** Store untrusted bytes outside the editable Workspace until a subsequent
   * staged mutation validates and commits their exact hash. */
  async stageBinary(projectId: string, workspaceId: string, content: Buffer): Promise<{ stagingId: string; hash: string; size: number }> {
    if (content.length === 0 || content.length > 64 * 1024 * 1024) {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    }
    this.assertProjectNotRecovering(projectId);
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      this.assertProjectNotRecovering(projectId);
      const state = this.ensureBootstrap(projectId, workspaceId);
      if (state.projectId !== projectId) throw new WorkspaceMutationAuthorityError("WORKSPACE_NOT_FOUND");
      const stagingId = crypto.randomUUID();
      this.writeBufferAtomic(this.stagingPath(workspaceId, stagingId), content);
      return { stagingId, hash: hashWorkspaceContent(content), size: content.length };
    }));
  }

  async mutate(request: WorkspaceMutationRequest): Promise<WorkspaceMutationReceipt> {
    const normalizedRequest = this.normalizeMutationRequest(request);
    if (normalizedRequest.actor === "ai" || normalizedRequest.actor === "subagent") {
      return this.agentFileQueue.run(
        {
          dataDir: this.options.dataDir,
          workspaceId: normalizedRequest.workspaceId,
          resourcePaths: this.mutationResourcePaths(normalizedRequest),
        },
        ({ waitMs }) => this.mutateInternal(normalizedRequest, waitMs),
      );
    }
    return this.mutateInternal(normalizedRequest, 0);
  }

  private async mutateInternal(
    request: WorkspaceMutationRequest,
    agentQueueWaitMs: number,
  ): Promise<WorkspaceMutationReceipt> {
    const startedAt = Date.now();
    const resourcePaths = this.mutationResourcePaths(request);
    let terminalRecorded = false;
    this.recordMutationDiagnostic(request, "workspace.mutation_received", "info", {
      mutationId: request.mutationId,
      baseRevision: request.baseRevision,
      actor: request.actor,
      ...(request.runId ? { runId: request.runId } : {}),
      resourcePaths,
      operationCount: request.operations.length,
      agentQueueWaitMs,
    });
    try {
      this.assertProjectNotRecovering(request.projectId);
      // Approved document proposals must flush their affected collaborative
      // drafts only after acquiring the Authority critical section; otherwise
      // a draft can change between an outside-the-lock flush and CAS.
      if (request.actor !== "collab" && request.reason !== "document_proposal_apply") {
        await this.flushDraftsForMutation(request);
      }
      const queuedAt = Date.now();
      return await this.serial(request.workspaceId, async () => this.withLease(request.workspaceId, async () => {
        this.assertProjectNotRecovering(request.projectId);
        if (request.reason === "document_proposal_apply") {
          await this.flushDraftsForMutation(request);
        }
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
        request = this.expandHtmlImportCommand(request, workspacePath);
        request = this.expandConfigValuesPatchCommands(request, workspacePath);
        const actual = this.readResourceHashes(workspacePath);
        if (this.rootHash(actual) !== state.rootHash) {
          throw new WorkspaceMutationAuthorityError(
            "WORKSPACE_EXTERNAL_DRIFT",
            "Workspace files do not match the committed Authority root",
          );
        }
        const prepared = this.prepare(request, payloadHash, state, workspacePath);
        this.appendJournal(request.workspaceId, this.preparedJournalRecord(prepared));
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
            ...(request.sessionId ? { sessionId: request.sessionId } : {}),
            ...(request.runId ? { runId: request.runId } : {}),
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
            agentQueueWaitMs,
          });
          const event: WorkspaceMutationCommittedEvent = { type: "workspace_mutation_committed", receipt };
          WorkspaceMutationAuthority.listenersFor(this.options.dataDir).forEach((listener) => {
            try { listener(event); } catch (listenerError) {
              logger.warn(
                { workspaceId: request.workspaceId, revision: receipt.revision, error: listenerError },
                "onMutationCommitted listener failed — collab room baseline may be stale",
              );
            }
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
            ...(error instanceof WorkspaceMutationAuthorityError ? error.details : {}),
            outcome: conflicted ? undefined : "rejected_before_prepare",
            durationMs: Date.now() - startedAt,
          },
        );
        this.removeStagedBinaries(request);
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

  /**
   * The sole Workspace write entry point for an already-approved document
   * proposal. Unlike ordinary collaborative autosaves, this preserves per-file
   * preconditions and validates them while the Authority owns its workspace
   * lease. Callers must compile operations from a frozen server-side proposal;
   * this API intentionally accepts no client supplied proposal payload.
   */
  async commitDocumentProposal(request: WorkspaceMutationRequest): Promise<WorkspaceMutationReceipt> {
    const paths = this.mutationResourcePaths(request);
    const documentPaths = paths.filter((resourcePath) => classifyManagedDocumentPath(resourcePath));
    if (documentPaths.length === 0 || paths.some((resourcePath) => (
      resourcePath !== "knowledge/manifest.json" && !classifyManagedDocumentPath(resourcePath)
    ))) {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    }
    for (const operation of request.operations) {
      if (operation.type === "move_path" || operation.type === "commit_html_import" || operation.type === "patch_config_values") {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
      }
      if (operation.type === "delete_path") continue;
      if (!operation.expectedAbsent && !operation.expectedHash) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
      }
    }
    return this.mutate({ ...request, reason: "document_proposal_apply" });
  }

  private mutationResourcePaths(request: WorkspaceMutationRequest): string[] {
    return [...new Set(request.operations.flatMap((operation) => (
      operation.type === "move_path"
        ? [operation.from, operation.to]
        : operation.type === "commit_html_import"
          // The import expands into a new page directory plus a tree update
          // inside the Authority critical section. Queue the stable tree
          // resource before expansion so concurrent imports cannot race on a
          // stale page list; the receipt records the concrete generated paths.
          ? ["workspace-tree.json"]
          : [operation.path]
    )))].sort();
  }

  private normalizeMutationRequest(request: WorkspaceMutationRequest): WorkspaceMutationRequest {
    let changed = false;
    const normalize = (value: string): string => {
      const normalized = normalizeWorkspaceResourcePath(value.replace(/^(?:\.\/)+/, ""));
      if (normalized && normalized !== value) changed = true;
      return normalized ?? value;
    };
    const operations = request.operations.map((operation) => {
      if (operation.type === "move_path") {
        const from = normalize(operation.from);
        const to = normalize(operation.to);
        return from === operation.from && to === operation.to ? operation : { ...operation, from, to };
      }
      if (operation.type === "commit_html_import") return operation;
      const path = normalize(operation.path);
      return path === operation.path ? operation : { ...operation, path };
    });
    return changed ? { ...request, operations } : request;
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
    const diagnosticPayload = {
      ...payload,
      ...(request.runId ? { runId: request.runId } : {}),
    };
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
      payload: diagnosticPayload,
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
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        ...(request.runId ? { runId: request.runId } : {}),
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

  private expandHtmlImportCommand(
    request: WorkspaceMutationRequest,
    workspacePath: string,
  ): WorkspaceMutationRequest {
    const commands = request.operations.filter(
      (operation): operation is Extract<typeof operation, { type: "commit_html_import" }> =>
        operation.type === "commit_html_import",
    );
    if (!commands.length) return request;
    if (commands.length !== 1 || request.operations.length !== 1)
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const command = commands[0];
    if (
      !/^[0-9a-f-]{36}$/i.test(command.stagingId) ||
      command.size <= 0 ||
      command.size > 2 * 1024 * 1024 ||
      !command.name.trim() ||
      !/^[a-f0-9]{64}$/.test(command.sourceHash)
    )
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const stagedPath = this.stagingPath(request.workspaceId, command.stagingId);
    if (!fs.existsSync(stagedPath))
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const source = fs.readFileSync(stagedPath);
    if (source.length !== command.size || hashWorkspaceContent(source) !== command.hash)
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const text = source.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(source))
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const analysis = normalizeHtmlImport(text);
    if (
      analysis.analysis.outcome.status !== "accepted" ||
      analysis.analysis.analysisVersion !== command.analysisVersion ||
      analysis.analysis.sourceHash !== command.sourceHash ||
      analysis.normalizedHash !== command.normalizedHash ||
      analysis.analysis.runtimeType !== command.runtimeType ||
      !analysis.normalizedHtml
    )
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const presentation = command.presentation;
    if (
      !presentation ||
      (presentation.mode === "fixed-canvas" && presentation.heightBehavior !== "fixed") ||
      (presentation.mode === "responsive-page" && presentation.heightBehavior !== "content")
    )
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const treeFile = path.join(workspacePath, "workspace-tree.json");
    if (!fs.existsSync(treeFile))
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const treeContent = fs.readFileSync(treeFile, "utf8");
    const treeHash = hashWorkspaceContent(treeContent);
    const tree = JSON.parse(treeContent) as { folders?: Array<{ id: string }>; pages?: Array<{ id: string; name: string; routeKey?: string; order: number; parentId?: string | null }> };
    const folders = tree.folders ?? [];
    const pages = tree.pages ?? [];
    if (command.parentId && !folders.some((folder) => folder.id === command.parentId))
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const slug = command.name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "") || "html-page";
    const pageId = `${slug.slice(0, 48)}_${crypto.randomBytes(3).toString("hex")}`;
    const usedRoutes = new Set(pages.map((page) => page.routeKey).filter((value): value is string => Boolean(value)));
    let routeKey = slug;
    let suffix = 2;
    while (usedRoutes.has(routeKey)) routeKey = `${slug}-${suffix++}`;
    const siblings = pages.filter((page) => (page.parentId ?? null) === command.parentId);
    const order = siblings.length ? Math.max(...siblings.map((page) => page.order)) + 1 : 0;
    const page = { id: pageId, name: command.name.trim(), routeKey, order, parentId: command.parentId, runtimeType: command.runtimeType };
    const prefix = `demos/${pageId}`;
    const meta = JSON.stringify({ source: "html-import", analysisVersion: command.analysisVersion, sourceHash: command.sourceHash, normalizedHash: command.normalizedHash, sandboxPolicyVersion: 1 }, null, 2) + "\n";
    const schema = JSON.stringify({ type: "object", properties: {}, $demo: { presentation } }, null, 2) + "\n";
    const treeText = JSON.stringify({ folders, pages: [...pages, page] }, null, 2) + "\n";
    const operations: WorkspaceMutationRequest["operations"] = command.runtimeType === "sandboxed-html"
      ? [
          { type: "put_text", path: `${prefix}/sandbox.html`, content: analysis.normalizedHtml, expectedAbsent: true },
          { type: "put_text", path: `${prefix}/html-import.meta.json`, content: meta, expectedAbsent: true },
          { type: "put_text", path: `${prefix}/config.schema.json`, content: schema, expectedAbsent: true },
          { type: "put_text", path: "workspace-tree.json", content: treeText, expectedHash: treeHash },
        ]
      : [
          { type: "put_text", path: `${prefix}/prototype.html`, content: analysis.normalizedHtml, expectedAbsent: true },
          { type: "put_text", path: `${prefix}/prototype.css`, content: "", expectedAbsent: true },
          { type: "put_text", path: `${prefix}/prototype.meta.json`, content: JSON.stringify({ source: "html-import", generatedBy: "html-import" }, null, 2) + "\n", expectedAbsent: true },
          { type: "put_text", path: `${prefix}/config.schema.json`, content: schema, expectedAbsent: true },
          { type: "put_text", path: "workspace-tree.json", content: treeText, expectedHash: treeHash },
        ];
    return { ...request, operations };
  }

  private expandConfigValuesPatchCommands(
    request: WorkspaceMutationRequest,
    workspacePath: string,
  ): WorkspaceMutationRequest {
    const commands = request.operations.filter(
      (operation): operation is Extract<typeof operation, { type: "patch_config_values" }> =>
        operation.type === "patch_config_values",
    );
    if (commands.length === 0) return request;

    const seenPaths = new Set<string>();
    return {
      ...request,
      operations: request.operations.map((operation) => {
        if (operation.type !== "patch_config_values") return operation;
        const normalized = normalizeWorkspaceResourcePath(operation.path);
        const isConfigValuesPath = normalized === "project.config.values.json"
          || Boolean(normalized && /^demos\/[^/]+\/config\.values\.json$/.test(normalized));
        const patch = operation.patch;
        const arrayAppends = operation.arrayAppends ?? [];
        const patchKeys = patch && typeof patch === "object" && !Array.isArray(patch)
          ? Object.keys(patch)
          : [];
        if (
          !normalized
          || !isConfigValuesPath
          || seenPaths.has(normalized)
          || (patchKeys.length === 0 && arrayAppends.length === 0)
          || patchKeys.some((key) => !key || ["__proto__", "prototype", "constructor"].includes(key))
          || !Array.isArray(arrayAppends)
          || arrayAppends.some((append) => (
            !append
            || typeof append.key !== "string"
            || !append.key
            || ["__proto__", "prototype", "constructor"].includes(append.key)
            || !append.item
            || typeof append.item !== "object"
            || Array.isArray(append.item)
            || typeof append.discriminator?.key !== "string"
            || !append.discriminator.key
            || ["__proto__", "prototype", "constructor"].includes(append.discriminator.key)
            || !Object.hasOwn(append.item, append.discriminator.key)
            || append.item[append.discriminator.key] !== append.discriminator.value
          ))
        ) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Invalid config values patch", {
            operationType: operation.type,
            resourcePath: operation.path,
          });
        }
        seenPaths.add(normalized);

        let current: Record<string, unknown> = {};
        const targetPath = this.resolve(workspacePath, normalized);
        if (fs.existsSync(targetPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(targetPath, "utf8")) as unknown;
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid config values");
            current = parsed as Record<string, unknown>;
          } catch {
            throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Config values file is invalid", {
              operationType: operation.type,
              resourcePath: normalized,
            });
          }
        }
        const next: Record<string, unknown> = { ...current, ...patch };
        for (const append of arrayAppends) {
          const currentArray = next[append.key];
          if (currentArray === undefined) {
            next[append.key] = [];
          } else if (!Array.isArray(currentArray)) {
            throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Config values array target is not an array", {
              operationType: operation.type,
              resourcePath: normalized,
              key: append.key,
            });
          } else {
            next[append.key] = [...currentArray];
          }
          const targetArray = next[append.key] as unknown[];
          const alreadyPresent = targetArray.some((item) => (
            item && typeof item === "object" && !Array.isArray(item)
            && (item as Record<string, unknown>)[append.discriminator.key] === append.discriminator.value
          ));
          if (!alreadyPresent) targetArray.push(append.item);
        }
        const content = JSON.stringify(next, null, 2) + "\n";
        this.assertManagedTextWrite(normalized, content, operation.type);
        return { type: "put_text" as const, path: normalized, content };
      }),
    };
  }

  private prepare(request: WorkspaceMutationRequest, payloadHash: string, state: WorkspaceAuthorityState, workspacePath: string): PreparedMutation {
    if (!request.mutationId || request.operations.length === 0) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
    const requiresAgentBaseline = request.actor === "ai" || request.actor === "subagent";
    const requiresCollabBaseline = request.reason === "collab_autosave";
    const before: PreparedMutation["before"] = {};
    for (const operation of request.operations) {
      const paths = operation.type === "move_path" ? [operation.from, operation.to] : [operation.path];
      for (const resourcePath of paths) {
        const normalized = normalizeWorkspaceResourcePath(resourcePath);
        if (!normalized || !workspaceResourceRegistry.describe(normalized)) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Workspace resource is not registered", {
            operationType: operation.type,
            resourcePath,
          });
        }
        if (!(normalized in before)) before[normalized] = this.readResource(workspacePath, normalized);
      }
      if (operation.type === "put_text") {
        this.assertManagedTextWrite(operation.path, operation.content, operation.type);
      } else if (operation.type === "put_binary") {
        if (!operation.path.startsWith("assets/") || !/^[0-9a-f-]{36}$/i.test(operation.stagingId) || operation.size <= 0 || operation.size > 64 * 1024 * 1024) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        const staged = this.stagingPath(request.workspaceId, operation.stagingId);
        if (!fs.existsSync(staged)) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        const content = fs.readFileSync(staged);
        if (content.length !== operation.size || hashWorkspaceContent(content) !== operation.hash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        try {
          workspaceResourceRegistry.assertBinaryWrite(operation.path, content);
        } catch {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Invalid managed binary resource", {
            operationType: operation.type,
            resourcePath: operation.path,
          });
        }
      } else if (operation.type === "put_staged_text") {
        if (operation.path.startsWith("assets/") || !/^[0-9a-f-]{36}$/i.test(operation.stagingId) || operation.size <= 0 || operation.size > 2 * 1024 * 1024) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        const staged = this.stagingPath(request.workspaceId, operation.stagingId);
        if (!fs.existsSync(staged)) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        const content = fs.readFileSync(staged);
        if (content.length !== operation.size || hashWorkspaceContent(content) !== operation.hash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        const text = content.toString("utf8");
        if (!Buffer.from(text, "utf8").equals(content)) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        this.assertManagedTextWrite(operation.path, text, operation.type);
      }
      // Agent writes and collab autosaves with an explicit room baseline are
      // optimistic concurrency operations. The model/editor may spend
      // arbitrary time generating a replacement, so Authority must reject a
      // stale resource hash instead of letting an old snapshot win. Config
      // patches are intentionally excluded: they are expanded against the
      // current object inside this same serial section.
      const expandedConfigPatch = operation.type === "put_text"
        && request.reason === "update_page_config_values"
        && Boolean(normalizeWorkspaceResourcePath(operation.path)?.endsWith("config.values.json"));
      if ((requiresAgentBaseline || requiresCollabBaseline) && !expandedConfigPatch && operation.type !== "patch_config_values" && operation.type !== "commit_html_import") {
        if (operation.type === "move_path") {
          if (!operation.expectedHash) throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Agent move requires expectedHash", { resourcePath: operation.from });
          this.assertExpected(before[operation.from], operation.expectedHash, false, operation.from);
          if (operation.expectedTargetAbsent) this.assertExpected(before[operation.to], undefined, true, operation.to);
        } else if (operation.type === "delete_path") {
          this.assertExpected(before[operation.path], operation.expectedHash, false, operation.path);
        } else {
          if (!operation.expectedHash && operation.expectedAbsent !== true) {
            throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Agent write requires expectedHash or expectedAbsent", { resourcePath: operation.path });
          }
          this.assertExpected(before[operation.path], operation.expectedHash, operation.expectedAbsent, operation.path);
        }
      }
      // Normal collaboration writes merge in the Yjs room. Approved document
      // proposals and visibility drafts are deliberately different: users
      // approved a frozen snapshot, so their preconditions are checked inside
      // this serial + lease section.
      if (request.reason === "document_proposal_apply" || request.reason === "config_visibility_draft_commit") {
        if (operation.type === "move_path" || operation.type === "commit_html_import" || operation.type === "patch_config_values") {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        const current = before[operation.path];
        if (operation.type === "delete_path") {
          this.assertExpected(current, operation.expectedHash, false, operation.path);
        } else {
          this.assertExpected(current, operation.expectedHash, operation.expectedAbsent, operation.path);
        }
      }
    }
    const isConfigResourcePath = (resourcePath: string): boolean => resourcePath === "project.config.schema.json"
      || resourcePath === "project.config.values.json"
      || /^demos\/[^/]+\/config\.(?:schema|values)\.json$/u.test(resourcePath);
    const needsConfigValidation = request.operations.some((operation) => {
      const resourcePath = operation.type === "move_path" ? operation.to : operation.path;
      const normalized = normalizeWorkspaceResourcePath(resourcePath);
      return Boolean(normalized && isConfigResourcePath(normalized));
    });
    const configCandidates: Array<{ path: string; content: string }> = [];
    const candidateResources: Record<string, string> = {};
    if (needsConfigValidation) for (const resourcePath of Object.keys(state.resourceHashes)) {
      const descriptor = workspaceResourceRegistry.describe(resourcePath);
      if (!descriptor) continue;
      const current = this.readResource(workspacePath, resourcePath);
      if (!current.exists) continue;
      if (descriptor.text) {
        const raw = current.content;
        candidateResources[resourcePath] = typeof raw === "string"
          ? raw
          : Buffer.isBuffer(raw)
              ? raw.toString("utf8")
            : raw && raw.type === "Buffer" && Array.isArray(raw.data)
              ? Buffer.from(raw.data).toString("utf8")
              : "";
      } else {
        // Presence is enough for config value asset-reference validation; the
        // binary bytes are intentionally not loaded into the candidate model.
        candidateResources[resourcePath] = "";
      }
    }
    for (const operation of request.operations) {
      if (operation.type === "put_binary") {
        const normalized = normalizeWorkspaceResourcePath(operation.path);
        if (normalized && needsConfigValidation) candidateResources[normalized] = "";
        continue;
      }
      if (operation.type === "delete_path") {
        const normalized = normalizeWorkspaceResourcePath(operation.path);
        if (normalized && needsConfigValidation) delete candidateResources[normalized];
        continue;
      }
      if (operation.type === "move_path") {
        const from = normalizeWorkspaceResourcePath(operation.from);
        const to = normalizeWorkspaceResourcePath(operation.to);
        if (from && to) {
          if (needsConfigValidation && candidateResources[from] !== undefined) candidateResources[to] = candidateResources[from];
          if (needsConfigValidation) delete candidateResources[from];
        }
        continue;
      }
      if (operation.type !== "put_text" && operation.type !== "put_staged_text") continue;
      const normalized = normalizeWorkspaceResourcePath(operation.path);
      if (!normalized || !needsConfigValidation) continue;
      const content = operation.type === "put_text"
        ? operation.content
        : fs.readFileSync(this.stagingPath(request.workspaceId, operation.stagingId), "utf8");
      if (isConfigResourcePath(normalized)) configCandidates.push({ path: normalized, content });
      candidateResources[normalized] = content;
    }
    for (const candidate of configCandidates) {
      const issue = validateConfigResourceMutation({ path: candidate.path, content: candidate.content, resources: candidateResources });
      if (issue) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", issue.message, {
          category: issue.category,
          validationCode: issue.code,
          resourcePath: candidate.path,
          issues: issue.details,
        });
      }
    }
    this.validateVisibilityRulesMutation(request, workspacePath);
    if (request.reason === "config_visibility_draft_commit") {
      if (request.baseRevision !== state.revision || request.baseRootHash !== state.rootHash) {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_CONFLICT", "Visibility draft base changed", {
          expectedRevision: request.baseRevision,
          actualRevision: state.revision,
          expectedRootHash: request.baseRootHash,
          actualRootHash: state.rootHash,
        });
      }
    } else if (request.baseRevision > state.revision) {
      // A stale base is harmless only when every targeted resource still matched.
      throw new WorkspaceMutationAuthorityError("WORKSPACE_RESOURCE_CONFLICT");
    }
    return { request, payloadHash, previousState: state, before, preparedAt: Date.now() };
  }

  /**
   * Visibility rules are a semantic resource, not merely valid JSON.  Keep
   * this check inside Authority's prepare phase so a rule document can never
   * be committed without its page/region/schema references being provable.
   * The check is only run when the rules resource is part of the mutation;
   * ordinary code or config-value writes remain independent.
   */
  private validateVisibilityRulesMutation(
    request: WorkspaceMutationRequest,
    workspacePath: string,
  ): void {
    const rulesOperation = request.operations.find(
      (operation): operation is Extract<typeof operation, { type: "put_text" | "put_staged_text" }> =>
        (operation.type === "put_text" || operation.type === "put_staged_text")
        && normalizeWorkspaceResourcePath(operation.path) === "project.visibility-rules.json",
    );
    if (!rulesOperation) return;

    let rulesContent: string;
    if (rulesOperation.type === "put_text") {
      rulesContent = rulesOperation.content;
    } else {
      try {
        const staged = fs.readFileSync(this.stagingPath(request.workspaceId, rulesOperation.stagingId));
        if (staged.length !== rulesOperation.size || hashWorkspaceContent(staged) !== rulesOperation.hash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
        }
        rulesContent = staged.toString("utf8");
      } catch (error) {
        if (error instanceof WorkspaceMutationAuthorityError) throw error;
        throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION");
      }
    }

    const pending = new Map<string, string>();
    const deleted = new Set<string>();
    for (const operation of request.operations) {
      const normalized = "path" in operation
        ? normalizeWorkspaceResourcePath(operation.path)
        : null;
      if (!normalized) continue;
      if (operation.type === "put_text") pending.set(normalized, operation.content);
      if (operation.type === "put_staged_text") {
        try {
          const staged = fs.readFileSync(this.stagingPath(request.workspaceId, operation.stagingId));
          if (staged.length === operation.size && hashWorkspaceContent(staged) === operation.hash) {
            pending.set(normalized, staged.toString("utf8"));
          }
        } catch {
          // The normal prepare path reports the precise staging error; this
          // semantic pass simply ignores an unreadable candidate here.
        }
      }
      if (operation.type === "delete_path") deleted.add(normalized);
    }
    const read = (resourcePath: string): string | undefined => {
      if (deleted.has(resourcePath)) return undefined;
      const staged = pending.get(resourcePath);
      if (staged !== undefined) return staged;
      const absolute = this.resolve(workspacePath, resourcePath);
      try { return fs.readFileSync(absolute, "utf8"); } catch { return undefined; }
    };
    const resources: Record<string, string> = {};
    const treeRaw = read("workspace-tree.json");
    if (treeRaw !== undefined) resources["workspace-tree.json"] = treeRaw;
    let tree: { pages?: Array<{ id?: unknown; name?: unknown }> } = {};
    try {
      const parsed = treeRaw ? JSON.parse(treeRaw) as unknown : null;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) tree = parsed as typeof tree;
    } catch {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "workspace-tree.json 无法解析，无法校验联动规则");
    }
    const pageIds = Array.isArray(tree.pages)
      ? tree.pages.flatMap((page) => typeof page?.id === "string" ? [page.id] : [])
      : [];
    const projectSchema = read("project.config.schema.json");
    const pageSchemas: Record<string, string> = {};
    const regionIds: Record<string, string[]> = {};
    for (const pageId of pageIds) {
      const schemaPath = `demos/${pageId}/config.schema.json`;
      const schema = read(schemaPath);
      if (schema !== undefined) pageSchemas[pageId] = schema;
      regionIds[pageId] = extractDeclaredRegionIds(
        ["index.tsx", "prototype.html"].map(
          (fileName) => read(`demos/${pageId}/${fileName}`),
        ),
      );
    }
    const validation = validateVisibilityRules(rulesContent, {
      pageIds,
      regionIds,
      projectSchema,
      pageSchemas,
    });
    if (!validation.valid) {
      throw new WorkspaceMutationAuthorityError(
        "WORKSPACE_INVALID_OPERATION",
        "联动规则引用或作用域校验失败",
        { resourcePath: rulesOperation.path, issues: validation.issues },
      );
    }
  }

  private ensureBootstrap(projectId: string, workspaceId: string): WorkspaceAuthorityState {
    const workspacePath = this.workspacePath(workspaceId);
    this.recoverPreparedMutations(workspaceId, workspacePath);
    this.recoverPreparedReconciles(workspaceId, workspacePath);
    const existing = this.readState(workspaceId);
    if (existing) {
      const actualHashes = this.readResourceHashes(workspacePath);
      const missingBackups = this.missingCommittedBackups(workspaceId, existing.resourceHashes);
      const actualMatches = this.rootHash(actualHashes) === existing.rootHash;
      if (missingBackups.length > 0 && !actualMatches) {
        this.recordBackupDiagnostic(
          projectId,
          workspaceId,
          "workspace.backup_missing",
          existing,
          missingBackups,
        );
        throw new WorkspaceMutationAuthorityError(
          "WORKSPACE_AUTHORITY_BACKUP_MISSING",
          "Committed Workspace backup is missing or untrusted",
          {
            paths: missingBackups.map((item) => item.path),
            hashes: missingBackups.map((item) => item.hash),
            actualRootHash: this.rootHash(actualHashes),
            expectedRootHash: existing.rootHash,
          },
        );
      }
      if (actualMatches) {
        this.persistCommittedBackups(workspaceId, workspacePath, existing.resourceHashes);
        if (missingBackups.length > 0) {
          this.recordBackupDiagnostic(
            projectId,
            workspaceId,
            "workspace.backup_rehydrated",
            existing,
            missingBackups,
          );
        }
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

  /**
   * Read-only Authority endpoints only need the durable state cursor. Rehashing
   * every managed resource here would make the editor's 2s polling loop scan
   * the whole workspace and contend on the write lease. Full drift checks stay
   * in mutation/snapshot/health paths; a missing state is bootstrapped once.
   */
  private async ensureStateForRead(projectId: string, workspaceId: string): Promise<WorkspaceAuthorityState> {
    const existing = this.readState(workspaceId);
    if (existing && !this.hasRecoveryArtifacts(workspaceId)) return existing;

    // Recovery is the one exception for a read path: an interrupted mutation
    // must be resolved before exposing the durable cursor. Only enter the
    // serialized lease section when prepared artifacts actually exist, so the
    // normal polling path remains lock-free and does not scan the workspace.
    return this.serial(workspaceId, async () => this.withLease(workspaceId, async () => {
      const workspacePath = this.workspacePath(workspaceId);
      const state = this.readState(workspaceId);
      if (!state) return this.ensureBootstrap(projectId, workspaceId);
      this.recoverPreparedMutations(workspaceId, workspacePath);
      this.recoverPreparedReconciles(workspaceId, workspacePath);
      return this.readState(workspaceId) ?? state;
    }));
  }

  private hasRecoveryArtifacts(workspaceId: string): boolean {
    const authorityDir = this.authorityDir(workspaceId);
    return this.countFiles(path.join(authorityDir, "prepared"), ".json") > 0
      || this.countFiles(path.join(authorityDir, "reconcile-prepared"), ".json") > 0;
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
      } else if (operation.type === "put_staged_text") {
        const before = prepared.before[operation.path];
        const content = fs.readFileSync(this.stagingPath(prepared.request.workspaceId, operation.stagingId));
        this.writeTextAtomic(this.resolve(workspacePath, operation.path), content.toString("utf8"));
        changes.push({ path: operation.path, action: before.exists ? "modified" : "created", beforeHash: before.hash, afterHash: operation.hash });
      } else if (operation.type === "patch_config_values") {
        throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Unexpanded config values patch", {
          operationType: operation.type,
          resourcePath: operation.path,
        });
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

  private restoreReconcileResourceSnapshot(
    before: PreparedReconcileRestore["before"],
    workspacePath: string,
    beforeDir: string,
  ): void {
    for (const [resourcePath, value] of Object.entries(before)) {
      const target = this.resolve(workspacePath, resourcePath);
      if (value.exists) {
        if (!value.contentBackupHash) {
          throw new WorkspaceMutationAuthorityError("WORKSPACE_MUTATION_FAILED");
        }
        this.writeBufferAtomic(
          target,
          fs.readFileSync(path.join(beforeDir, `${value.contentBackupHash}.bin`)),
        );
      } else {
        fs.rmSync(target, { force: true });
      }
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
          if (workspaceResourceRegistry.describe(relative)) result[relative] = hashWorkspaceContent(fs.readFileSync(fullPath));
        }
      }
    };
    walk(workspacePath);
    return result;
  }

  private rootHash(hashes: Record<string, string>): string {
    return hashWorkspaceContent(Object.entries(hashes).sort(([left], [right]) => compareWorkspaceResourcePaths(left, right)).map(([key, value]) => `${key}:${value}`).join("\n"));
  }

  private resourceHashesEqual(left: Record<string, string>, right: Record<string, string>): boolean {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((resourcePath) => left[resourcePath] === right[resourcePath]);
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

  private assertManagedTextWrite(resourcePath: string, content: string, operationType: string): void {
    try {
      workspaceResourceRegistry.assertTextWrite(resourcePath, content);
    } catch {
      throw new WorkspaceMutationAuthorityError("WORKSPACE_INVALID_OPERATION", "Invalid managed text resource", {
        operationType,
        resourcePath,
      });
    }
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
  private reconcileBeforeDir(workspaceId: string, reconcileId: string): string { return path.join(this.authorityDir(workspaceId), "reconcile-prepared", `${reconcileId}.before`); }
  private reconcileReceiptPath(workspaceId: string, reconcileId: string): string { return path.join(this.authorityDir(workspaceId), "reconcile-receipts", `${reconcileId}.json`); }
  private readState(workspaceId: string): WorkspaceAuthorityState | null { const file = this.statePath(workspaceId); return fs.existsSync(file) ? this.readJson<WorkspaceAuthorityState>(file) : null; }
  private readJson<T>(file: string): T { return JSON.parse(fs.readFileSync(file, "utf-8")) as T; }
  private writeTextAtomic(file: string, content: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`; fs.writeFileSync(tmp, content, "utf-8"); fs.renameSync(tmp, file); }
  private writeBufferAtomic(file: string, content: Buffer): void { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`; fs.writeFileSync(tmp, content); fs.renameSync(tmp, file); }
  private writeJsonAtomic(file: string, value: unknown): void { this.writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`); }
  private appendJournal(workspaceId: string, record: unknown): void { const file = path.join(this.authorityDir(workspaceId), "journal.jsonl"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf-8"); }
  private appendProjectionAck(workspaceId: string, ack: WorkspaceProjectionAck): void { const file = path.join(this.authorityDir(workspaceId), "projection-acks.jsonl"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(ack)}\n`, "utf-8"); }
  private preparedJournalRecord(prepared: PreparedMutation): Record<string, unknown> {
    const { request, previousState, before } = prepared;
    return {
      type: "prepared",
      at: prepared.preparedAt ?? Date.now(),
      mutationId: request.mutationId,
      preparedSummary: {
        projectId: request.projectId,
        workspaceId: request.workspaceId,
        actor: request.actor,
        ...(request.sessionId ? { sessionId: request.sessionId } : {}),
        ...(request.runId ? { runId: request.runId } : {}),
        reason: request.reason,
        baseRevision: request.baseRevision,
        payloadHash: prepared.payloadHash,
        previousRevision: previousState.revision,
        previousRootHash: previousState.rootHash,
        operations: request.operations.map((operation) => {
          if (operation.type === "put_text") {
            return {
              type: operation.type,
              path: operation.path,
              contentBytes: Buffer.byteLength(operation.content, "utf8"),
              contentHash: hashWorkspaceContent(operation.content),
            };
          }
          if (operation.type === "put_binary" || operation.type === "put_staged_text") {
            return {
              type: operation.type,
              path: operation.path,
              stagingId: operation.stagingId,
              contentBytes: operation.size,
              contentHash: operation.hash,
            };
          }
          if (operation.type === "move_path") {
            return { type: operation.type, from: operation.from, to: operation.to };
          }
          if (operation.type === "patch_config_values") {
            return {
              type: operation.type,
              path: operation.path,
              patchKeys: Object.keys(operation.patch),
              arrayAppendKeys: (operation.arrayAppends ?? []).map((append) => append.key),
            };
          }
          if (operation.type === "commit_html_import") {
            return {
              type: operation.type,
              stagingId: operation.stagingId,
              contentBytes: operation.size,
              contentHash: operation.hash,
              name: operation.name,
            };
          }
          if (operation.type === "delete_path") {
            return {
              type: operation.type,
              path: operation.path,
              expectedHash: operation.expectedHash,
            };
          }
          return { type: "unknown" };
        }),
        before: Object.fromEntries(
          Object.entries(before).map(([resourcePath, value]) => [resourcePath, {
            exists: value.exists,
            hash: value.hash,
            contentBytes: value.exists && value.content !== undefined
              ? this.contentBuffer(value.content).length
              : 0,
          }]),
        ),
      },
    };
  }

  /** Compact pre-retention journal rows written by older versions. */
  private compactPreparedJournalRecord(record: unknown): string | undefined {
    if (!record || typeof record !== "object" || Array.isArray(record)) return undefined;
    const value = record as Record<string, unknown>;
    if (value.type !== "prepared") return undefined;
    if (value.preparedSummary && typeof value.preparedSummary === "object") {
      return JSON.stringify(record);
    }
    if (!value.prepared || typeof value.prepared !== "object") return undefined;
    try {
      const prepared = value.prepared as PreparedMutation;
      if (!prepared.request || !prepared.previousState || !prepared.before) return undefined;
      const compacted = this.preparedJournalRecord(prepared);
      if (typeof value.at === "number") compacted.at = value.at;
      if (typeof value.mutationId === "string") compacted.mutationId = value.mutationId;
      return JSON.stringify(compacted);
    } catch {
      return undefined;
    }
  }
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
      if (operation.type === "put_binary" || operation.type === "put_staged_text") {
        fs.rmSync(this.stagingPath(request.workspaceId, operation.stagingId), { force: true });
      }
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
    return this.missingCommittedBackups(workspaceId, resourceHashes).length;
  }

  private missingCommittedBackups(
    workspaceId: string,
    resourceHashes: Record<string, string>,
  ): Array<{ path: string; hash: string }> {
    const validHashes = new Set<string>();
    const missing: Array<{ path: string; hash: string }> = [];
    for (const [resourcePath, hash] of Object.entries(resourceHashes)) {
      const backupPath = this.backupPath(workspaceId, hash);
      const valid = validHashes.has(hash) || (
        fs.existsSync(backupPath) && hashWorkspaceContent(fs.readFileSync(backupPath)) === hash
      );
      if (valid) {
        validHashes.add(hash);
      } else {
        missing.push({ path: resourcePath, hash });
      }
    }
    return missing;
  }

  private recordBackupDiagnostic(
    projectId: string,
    workspaceId: string,
    eventType: "workspace.backup_rehydrated" | "workspace.backup_missing",
    state: WorkspaceAuthorityState,
    items: Array<{ path: string; hash: string }>,
  ): void {
    const mutationId = `backup-preflight-${workspaceId}-${state.revision}`;
    appendWorkspaceAuthorityDiagnostic({
      dataDir: this.options.dataDir,
      projectId,
      workspaceId,
      eventType,
      mutationId,
      baseRevision: state.revision,
      revision: state.revision,
      actor: "system",
      resourcePaths: items.map((item) => item.path),
      durationMs: 0,
      level: eventType === "workspace.backup_missing" ? "error" : "info",
      message: eventType === "workspace.backup_missing"
        ? "Committed Workspace backups are missing or untrusted"
        : "Committed Workspace backups were rehydrated from matching content",
      payload: {
        hashes: items.map((item) => item.hash),
        count: items.length,
        revision: state.revision,
      },
    });
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

  private assertProjectNotRecovering(projectId: string): void {
    const lockFile = path.join(
      this.options.dataDir,
      "workspace-recovery",
      "locks",
      `${projectId}.lock`,
    );
    if (fs.existsSync(lockFile)) {
      throw new WorkspaceMutationAuthorityError(
        "WORKSPACE_RECOVERY_IN_PROGRESS",
        "Workspace recovery is in progress",
      );
    }
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
      const beforeDir = this.reconcileBeforeDir(workspaceId, prepared.reconcileId);
      let outcome: "rolled_back" | "committed_cleanup";
      if (!fs.existsSync(receiptPath)) {
        this.restoreReconcileResourceSnapshot(prepared.before, workspacePath, beforeDir);
        this.writeJsonAtomic(this.statePath(workspaceId), prepared.state);
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
      fs.rmSync(beforeDir, { recursive: true, force: true });
      result.recoveredCount += 1;
    }
    return result;
  }
}

/** Scan all live Authority instances and prune only their operational logs. */
export async function pruneWorkspaceAuthorityOperationalLogs(
  dataDir: string,
  cutoffAt: number,
): Promise<WorkspaceAuthorityOperationalLogRetentionResult[]> {
  const root = path.join(path.resolve(dataDir), "workspace-authority");
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
  const workspaces = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "leases")
    .map((entry) => entry.name);
  const authority = new WorkspaceMutationAuthority({
    dataDir: path.resolve(dataDir),
    resolveWorkspacePath: () => null,
  });
  const results: WorkspaceAuthorityOperationalLogRetentionResult[] = [];
  for (const workspaceId of workspaces) {
    results.push(await authority.pruneOperationalLogs(workspaceId, cutoffAt));
  }
  return results;
}

export function registerCollabDraftProvider(dataDir: string, provider: CollabDraftProvider): () => void {
  return WorkspaceMutationAuthority.registerDraftProvider(dataDir, provider);
}

/** Returns a live-workspace Authority request context, or null for branch/non-workspace paths. */
export function resolveLiveWorkspaceMutationContext(workspacePath: string): {
  authority: WorkspaceMutationAuthority;
  /** Shared durable data root for proposal snapshots and outbox records. */
  dataDir: string;
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
      dataDir,
      projectId,
      workspaceId: meta.workspaceId,
      authority: new WorkspaceMutationAuthority({ dataDir, resolveWorkspacePath: (id) => id === meta.workspaceId ? workspacePath : null }),
    };
  } catch {
    return null;
  }
}
