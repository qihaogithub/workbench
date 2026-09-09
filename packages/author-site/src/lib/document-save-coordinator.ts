import {
  type OfflineDraft,
  type OfflineDraftStore,
  contentFingerprint,
} from "./workspace-offline-drafts";

export type DocumentSaveStatus =
  | "clean"
  | "dirty"
  | "saving"
  | "saved"
  | "offline"
  | "authority-degraded"
  | "conflict"
  | "permission-denied"
  | "validation-failed";

export type DocumentSaveErrorCode =
  | "NETWORK_UNAVAILABLE"
  | "AUTHORITY_BACKUP_MISSING"
  | "AUTHORITY_EXTERNAL_DRIFT"
  | "RESOURCE_CONFLICT"
  | "PERMISSION_DENIED"
  | "VALIDATION_FAILED"
  | "UNKNOWN";

export interface DocumentSaveReceipt {
  receiptId?: string;
  revision?: number;
  rootHash?: string;
}

export class DocumentSaveError extends Error {
  readonly code: DocumentSaveErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly details?: unknown;

  constructor(
    message: string,
    options: {
      code?: DocumentSaveErrorCode;
      retryable?: boolean;
      status?: number;
      details?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "DocumentSaveError";
    this.code = options.code ?? "UNKNOWN";
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.details = options.details;
  }
}

export interface DocumentSaveSnapshot {
  status: DocumentSaveStatus;
  error: DocumentSaveError | null;
  localRevision: number;
  committedRevision: number;
  hasLocalDraft: boolean;
}

export interface DocumentSaveDraftConfig<T> {
  store: OfflineDraftStore;
  workspaceId: string;
  projectId: string;
  path: string;
  baseRevision?: number;
  baseHash?: string;
  serialize: (value: T) => string;
  deserialize: (content: string) => T;
}

export interface DocumentSaveCoordinatorOptions<T> {
  save: (value: T) => Promise<DocumentSaveReceipt | void>;
  debounceMs?: number;
  maxWaitMs?: number;
  draft?: DocumentSaveDraftConfig<T>;
  onStateChange?: (snapshot: DocumentSaveSnapshot) => void;
  onCommitted?: (event: {
    value: T;
    receipt: DocumentSaveReceipt | void;
    localRevision: number;
    latest: boolean;
  }) => void;
  onError?: (error: DocumentSaveError) => void;
}

interface PendingValue<T> {
  value: T;
  localRevision: number;
}

export type DraftReadResult<T> =
  | { status: "none" }
  | { status: "match"; value: T; draft: OfflineDraft }
  | { status: "conflict"; draft: OfflineDraft };

const AUTHORITY_BACKUP_CODES = new Set([
  "DOCUMENT_AUTHORITY_BACKUP_MISSING",
  "WORKSPACE_AUTHORITY_BACKUP_MISSING",
  "AUTHORITY_BACKUP_MISSING",
]);

const AUTHORITY_DRIFT_CODES = new Set([
  "WORKSPACE_EXTERNAL_DRIFT",
  "AUTHORITY_EXTERNAL_DRIFT",
]);

const CONFLICT_CODES = new Set([
  "DOCUMENT_CONFLICT",
  "DOCUMENT_AUTHORITY_CONFLICT",
  "WORKSPACE_RESOURCE_CONFLICT",
  "RESOURCE_CONFLICT",
]);

const PERMISSION_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "DOCUMENT_FORBIDDEN",
  "DOCUMENT_READONLY",
  "PERMISSION_DENIED",
]);

const VALIDATION_CODES = new Set([
  "INVALID_REQUEST",
  "DOCUMENT_INVALID",
  "VALIDATION_FAILED",
]);

interface ApiErrorLike {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  status?: unknown;
  retryable?: unknown;
}

function readErrorLike(value: unknown): ApiErrorLike {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const nested = candidate.error;
  if (nested && typeof nested === "object") {
    // API errors normally put code/message in `error`, while fetch callers add
    // the HTTP status to the outer object. Preserve both layers when normalizing.
    return { ...candidate, ...nested } as ApiErrorLike;
  }
  return candidate as ApiErrorLike;
}

function readStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * 将 API / fetch 错误归一成文档保存状态机可以消费的错误。
 * 备份不完整、外部漂移和冲突都不是普通网络错误，不能无限自动重试。
 */
export function toDocumentSaveError(
  value: unknown,
  fallback = "文档保存失败",
): DocumentSaveError {
  if (value instanceof DocumentSaveError) return value;

  const payload = readErrorLike(value);
  const code = typeof payload.code === "string" ? payload.code : undefined;
  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : value instanceof Error && value.message.trim()
        ? value.message
        : fallback;
  const status = readStatus(payload.status);

  if (code && AUTHORITY_BACKUP_CODES.has(code)) {
    return new DocumentSaveError(
      "工作区备份不完整，自动保存已暂停；当前修改已保留，等待管理员恢复后重试。",
      { code: "AUTHORITY_BACKUP_MISSING", status, details: payload.details },
    );
  }
  if (code && AUTHORITY_DRIFT_CODES.has(code)) {
    return new DocumentSaveError(
      "工作区内容已发生外部变化，当前修改已保留，需要确认版本后再保存。",
      { code: "AUTHORITY_EXTERNAL_DRIFT", status, details: payload.details },
    );
  }
  if (code && CONFLICT_CODES.has(code)) {
    return new DocumentSaveError(
      "文档版本发生冲突，当前修改已保留，需要处理后再保存。",
      { code: "RESOURCE_CONFLICT", status, details: payload.details },
    );
  }
  if (code && PERMISSION_CODES.has(code)) {
    return new DocumentSaveError("当前没有保存此文档的权限。", {
      code: "PERMISSION_DENIED",
      status,
      details: payload.details,
    });
  }
  if (code && VALIDATION_CODES.has(code)) {
    return new DocumentSaveError(message, {
      code: "VALIDATION_FAILED",
      status,
      details: payload.details,
    });
  }

  const retryable =
    payload.retryable === true ||
    value instanceof TypeError ||
    code === "NETWORK_UNAVAILABLE" ||
    (status !== undefined && status >= 500 && status !== 503);
  if (retryable) {
    return new DocumentSaveError("网络暂时不可用，修改已保留在本地。", {
      code: "NETWORK_UNAVAILABLE",
      retryable: true,
      status,
      details: payload.details,
    });
  }

  return new DocumentSaveError(message, {
    code: "UNKNOWN",
    status,
    details: payload.details,
  });
}

export function getDocumentSaveStatusLabel(status: DocumentSaveStatus): string {
  switch (status) {
    case "clean":
      return "未修改";
    case "dirty":
      return "有未保存修改";
    case "saving":
      return "正在保存…";
    case "saved":
      return "已保存";
    case "offline":
      return "网络不可用，已保留本地草稿";
    case "authority-degraded":
      return "工作区暂时不可保存，已保留本地草稿";
    case "conflict":
      return "文档版本冲突，已保留本地草稿";
    case "permission-denied":
      return "没有保存权限，已保留本地草稿";
    case "validation-failed":
      return "文档内容需要修正后才能保存";
  }
}

function statusForError(error: DocumentSaveError): DocumentSaveStatus {
  switch (error.code) {
    case "NETWORK_UNAVAILABLE":
      return "offline";
    case "AUTHORITY_BACKUP_MISSING":
    case "AUTHORITY_EXTERNAL_DRIFT":
      return "authority-degraded";
    case "RESOURCE_CONFLICT":
      return "conflict";
    case "PERMISSION_DENIED":
      return "permission-denied";
    case "VALIDATION_FAILED":
      return "validation-failed";
    default:
      return "offline";
  }
}

export class DocumentSaveCoordinator<T> {
  private readonly save: DocumentSaveCoordinatorOptions<T>["save"];
  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly draft?: DocumentSaveDraftConfig<T>;
  private readonly onStateChange?: DocumentSaveCoordinatorOptions<T>["onStateChange"];
  private readonly onCommitted?: DocumentSaveCoordinatorOptions<T>["onCommitted"];
  private readonly onError?: DocumentSaveCoordinatorOptions<T>["onError"];
  private pending: PendingValue<T> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private draftWriteChain: Promise<void> = Promise.resolve();
  private localRevision = 0;
  private committedRevision = 0;
  private status: DocumentSaveStatus = "clean";
  private error: DocumentSaveError | null = null;
  private hasLocalDraft = false;
  private paused = false;
  private disposed = false;
  private baseHash = "";
  private baseRevision = 0;

  constructor(options: DocumentSaveCoordinatorOptions<T>) {
    this.save = options.save;
    this.debounceMs = options.debounceMs ?? 800;
    this.maxWaitMs = options.maxWaitMs ?? 3000;
    this.draft = options.draft;
    this.onStateChange = options.onStateChange;
    this.onCommitted = options.onCommitted;
    this.onError = options.onError;
    this.baseHash = options.draft?.baseHash ?? "";
    this.baseRevision = options.draft?.baseRevision ?? 0;
  }

  getSnapshot(): DocumentSaveSnapshot {
    return {
      status: this.status,
      error: this.error,
      localRevision: this.localRevision,
      committedRevision: this.committedRevision,
      hasLocalDraft: this.hasLocalDraft,
    };
  }

  setBase(value: T, revision = this.baseRevision): void {
    if (!this.draft) return;
    this.baseHash = contentFingerprint(this.draft.serialize(value));
    this.baseRevision = revision;
  }

  markDirty(value: T): void {
    if (this.disposed) return;
    const localRevision = ++this.localRevision;
    this.pending = { value, localRevision };
    this.hasLocalDraft = Boolean(this.draft);
    this.error = null;
    if (!this.paused) this.updateStatus("dirty");
    this.persistDraft(value, localRevision);
    this.scheduleFlush();
  }

  async flush(): Promise<boolean> {
    if (this.disposed || this.paused) return false;
    this.clearTimers();
    if (this.inFlight) await this.inFlight;
    // A failed request pauses the coordinator and keeps the newest value in
    // `pending`. Do not submit that value from the caller that was already
    // waiting for the failed request; only an explicit retry may resume it.
    if (this.paused) return false;
    if (!this.pending) return true;

    const pending = this.pending;
    this.pending = null;
    this.updateStatus("saving");
    const request = this.save(pending.value)
      .then((receipt) => {
        const latest = this.pending === null && pending.localRevision === this.localRevision;
        this.committedRevision = Math.max(
          this.committedRevision,
          pending.localRevision,
        );
        if (latest) {
          this.hasLocalDraft = false;
          this.error = null;
          this.updateStatus("saved");
          this.removeDraft(pending.localRevision);
        } else {
          this.updateStatus("dirty");
        }
        this.onCommitted?.({
          value: pending.value,
          receipt,
          localRevision: pending.localRevision,
          latest,
        });
        return true;
      })
      .catch((reason: unknown) => {
        const error = toDocumentSaveError(reason);
        if (!this.pending || this.pending.localRevision < pending.localRevision) {
          this.pending = pending;
        }
        this.error = error;
        this.paused = true;
        this.updateStatus(statusForError(error));
        this.onError?.(error);
        return false;
      })
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = request;
    return request;
  }

  async retry(): Promise<boolean> {
    if (this.disposed) return false;
    this.paused = false;
    this.error = null;
    if (this.pending) this.updateStatus("dirty");
    return this.flush();
  }

  async readDraft(serverValue: T): Promise<DraftReadResult<T>> {
    if (!this.draft) return { status: "none" };
    let draft: OfflineDraft | null;
    try {
      draft = await this.findDraft();
    } catch {
      // IndexedDB is an enhancement. A browser/runtime without it must still
      // be able to load and edit the server document normally.
      return { status: "none" };
    }
    if (!draft) {
      this.hasLocalDraft = false;
      return { status: "none" };
    }
    this.hasLocalDraft = true;
    const serverHash = contentFingerprint(this.draft.serialize(serverValue));
    if (draft.baseHash !== serverHash) {
      this.error = new DocumentSaveError(
        "本地草稿与服务端版本不同，请选择保留哪一份内容。",
        { code: "RESOURCE_CONFLICT" },
      );
      this.updateStatus("conflict");
      return { status: "conflict", draft };
    }
    return {
      status: "match",
      value: this.draft.deserialize(draft.content),
      draft,
    };
  }

  /**
   * 用户确认冲突后恢复本地草稿，并重新进入正常的自动保存队列。
   * 冲突状态不会隐式覆盖服务端内容，只有显式调用此方法才会恢复本地版本。
   */
  async restoreDraft(): Promise<T | null> {
    if (!this.draft || this.disposed) return null;
    let draft: OfflineDraft | null;
    try {
      draft = await this.findDraft();
    } catch {
      return null;
    }
    if (!draft) {
      this.hasLocalDraft = false;
      return null;
    }
    const value = this.draft.deserialize(draft.content);
    this.clearTimers();
    const localRevision = ++this.localRevision;
    this.pending = { value, localRevision };
    this.hasLocalDraft = true;
    this.paused = false;
    this.error = null;
    this.updateStatus("dirty");
    this.persistDraft(value, localRevision);
    this.scheduleFlush();
    return value;
  }

  async discardDraft(): Promise<void> {
    if (!this.draft) return;
    try {
      await this.draft.store.removeDraft(this.draft.workspaceId, this.draft.path);
    } catch {
      // Draft cleanup must not prevent the editor from returning to the server
      // version when local storage is unavailable.
    }
    this.clearTimers();
    this.pending = null;
    this.paused = false;
    this.error = null;
    this.hasLocalDraft = false;
    this.updateStatus("clean");
  }

  async dispose(): Promise<boolean> {
    if (this.disposed) return false;
    const flushed = await this.flush();
    this.clearTimers();
    this.disposed = true;
    return flushed;
  }

  private updateStatus(status: DocumentSaveStatus): void {
    this.status = status;
    this.onStateChange?.(this.getSnapshot());
  }

  private scheduleFlush(): void {
    if (this.disposed || this.paused) return;
    if (this.maxWaitTimer === null) {
      this.maxWaitTimer = setTimeout(() => {
        this.maxWaitTimer = null;
        void this.flush();
      }, this.maxWaitMs);
    }
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  private clearTimers(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.maxWaitTimer !== null) clearTimeout(this.maxWaitTimer);
    this.debounceTimer = null;
    this.maxWaitTimer = null;
  }

  private persistDraft(value: T, localRevision: number): void {
    if (!this.draft) return;
    const draft: OfflineDraft = {
      workspaceId: this.draft.workspaceId,
      projectId: this.draft.projectId,
      path: this.draft.path,
      content: this.draft.serialize(value),
      baseRevision: this.baseRevision,
      baseHash: this.baseHash,
      savedAt: Date.now(),
    };
    this.draftWriteChain = this.draftWriteChain
      .then(() => this.draft!.store.saveDraft(draft))
      .then(() => undefined)
      .catch(() => undefined);
    void localRevision;
  }

  private removeDraft(localRevision: number): void {
    const draftConfig = this.draft;
    if (!draftConfig) return;
    this.draftWriteChain = this.draftWriteChain
      .then(async () => {
        if (this.localRevision !== localRevision || this.pending) return;
        await draftConfig.store.removeDraft(draftConfig.workspaceId, draftConfig.path);
      })
      .catch(() => undefined);
  }

  private async findDraft(): Promise<OfflineDraft | null> {
    if (!this.draft) return null;
    const drafts = await this.draft.store.getDrafts(this.draft.workspaceId);
    return drafts.find((candidate) => candidate.path === this.draft!.path) ?? null;
  }
}
