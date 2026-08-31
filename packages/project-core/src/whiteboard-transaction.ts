import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const JOURNAL_FILE = ".whiteboard-transaction.json";
const LOCK_FILE = ".whiteboard-transaction.lock";

export class WhiteboardTransactionConflictError extends Error {
  constructor(message = "Whiteboard files changed before the transaction could commit") {
    super(message);
    this.name = "WhiteboardTransactionConflictError";
  }
}

export interface WhiteboardTransactionWrite {
  path: string;
  content: string | Buffer;
  expectedHash?: string;
  expectedAbsent?: boolean;
}

export interface WhiteboardTransactionDelete {
  path: string;
  expectedHash: string;
}

interface JournalEntry { path: string; backup: string }
interface Journal { version: 1; state: "prepared" | "committed"; transactionDir: string; entries: JournalEntry[]; newPaths?: string[] }

function sha256(content: Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalizeRelativePath(value: string): string {
  if (!value || path.isAbsolute(value) || value.includes("\\") || value.split("/").includes("..")) {
    throw new Error("Invalid whiteboard transaction path");
  }
  return value;
}

function journalPath(workspacePath: string): string { return path.join(workspacePath, JOURNAL_FILE); }

function readJournal(workspacePath: string): Journal | null {
  const file = journalPath(workspacePath);
  if (!fs.existsSync(file)) return null;
  try {
    const journal = JSON.parse(fs.readFileSync(file, "utf8")) as Journal;
    if (journal.version !== 1 || (journal.state !== "prepared" && journal.state !== "committed") || !/^[A-Za-z0-9._-]+$/.test(journal.transactionDir) || !Array.isArray(journal.entries)) throw new Error("invalid");
    for (const entry of journal.entries) {
      normalizeRelativePath(entry.path);
      normalizeRelativePath(entry.backup);
    }
    for (const resourcePath of journal.newPaths ?? []) normalizeRelativePath(resourcePath);
    return journal;
  } catch {
    throw new Error("Whiteboard transaction journal is corrupted; manual recovery is required");
  }
}

function writeJournal(workspacePath: string, journal: Journal): void {
  const temporary = `${journalPath(workspacePath)}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(journal)}\n`, "utf8");
  fs.renameSync(temporary, journalPath(workspacePath));
}

/** Complete a committed transaction or restore an interrupted prepared one. */
export function recoverWhiteboardTransaction(workspacePath: string): void {
  const journal = readJournal(workspacePath);
  if (!journal) return;
  const transactionPath = path.join(workspacePath, journal.transactionDir);
  if (journal.state === "prepared") {
    for (const entry of [...journal.entries].reverse()) {
      const target = path.join(workspacePath, entry.path);
      const backup = path.join(transactionPath, entry.backup);
      const hasBackup = fs.existsSync(backup);
      if (hasBackup || (journal.newPaths ?? []).includes(entry.path)) fs.rmSync(target, { force: true });
      if (hasBackup) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(backup, target);
      }
    }
  }
  fs.rmSync(transactionPath, { recursive: true, force: true });
  fs.rmSync(journalPath(workspacePath), { force: true });
}

function acquireLock(workspacePath: string): () => void {
  const lockPath = path.join(workspacePath, LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = fs.openSync(lockPath, "wx");
      fs.writeFileSync(descriptor, `${process.pid}\n`, "utf8");
      fs.closeSync(descriptor);
      return () => fs.rmSync(lockPath, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const ownerPid = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
      let ownerIsAlive = Number.isInteger(ownerPid) && ownerPid > 0;
      if (ownerIsAlive) {
        try { process.kill(ownerPid, 0); } catch (cause) {
          ownerIsAlive = (cause as NodeJS.ErrnoException).code !== "ESRCH";
        }
      }
      if (!ownerIsAlive && attempt === 0) {
        fs.rmSync(lockPath, { force: true });
        continue;
      }
      throw new WhiteboardTransactionConflictError("Another whiteboard transaction is in progress");
    }
  }
  throw new WhiteboardTransactionConflictError("Another whiteboard transaction is in progress");
}

function verifyExpectedState(workspacePath: string, writes: readonly WhiteboardTransactionWrite[], deletes: readonly WhiteboardTransactionDelete[]): void {
  for (const write of writes) {
    const target = path.join(workspacePath, normalizeRelativePath(write.path));
    const exists = fs.existsSync(target);
    if (write.expectedAbsent) {
      if (exists) throw new WhiteboardTransactionConflictError(`${write.path} was created concurrently`);
      continue;
    }
    if (!write.expectedHash || !exists || sha256(fs.readFileSync(target)) !== write.expectedHash) {
      throw new WhiteboardTransactionConflictError(`${write.path} changed concurrently`);
    }
  }
  for (const deletion of deletes) {
    const target = path.join(workspacePath, normalizeRelativePath(deletion.path));
    if (!fs.existsSync(target) || sha256(fs.readFileSync(target)) !== deletion.expectedHash) {
      throw new WhiteboardTransactionConflictError(`${deletion.path} changed before cleanup`);
    }
  }
}

/**
 * Atomically-ish applies a small set of whiteboard resources on a non-live
 * workspace. A durable journal makes an interrupted prepared write roll back
 * on the next transaction; a committed journal is finalized instead.
 */
export function writeWhiteboardTransaction(
  workspacePath: string,
  input: { writes: readonly WhiteboardTransactionWrite[]; deletes?: readonly WhiteboardTransactionDelete[] },
): void {
  const releasesLock = acquireLock(workspacePath);
  try {
    recoverWhiteboardTransaction(workspacePath);
    const writes = input.writes.map((item) => ({ ...item, path: normalizeRelativePath(item.path) }));
    const deletes = (input.deletes ?? []).map((item) => ({ ...item, path: normalizeRelativePath(item.path) }));
    if (new Set([...writes, ...deletes].map((item) => item.path)).size !== writes.length + deletes.length) throw new Error("A whiteboard transaction cannot write and delete the same path");
    verifyExpectedState(workspacePath, writes, deletes);

    const transactionDir = `.whiteboard-transaction-${crypto.randomUUID()}`;
    const transactionPath = path.join(workspacePath, transactionDir);
    fs.mkdirSync(path.join(transactionPath, "staged"), { recursive: true });
    const entries: JournalEntry[] = [];
    const newPaths: string[] = [];
    for (const write of writes) {
      const staged = path.join(transactionPath, "staged", write.path);
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.writeFileSync(staged, write.content);
      entries.push({ path: write.path, backup: `backups/${write.path}` });
      if (!fs.existsSync(path.join(workspacePath, write.path))) newPaths.push(write.path);
    }
    for (const deletion of deletes) entries.push({ path: deletion.path, backup: `backups/${deletion.path}` });
    const journal: Journal = { version: 1, state: "prepared", transactionDir, entries, newPaths };
    writeJournal(workspacePath, journal);
    try {
      for (const write of writes) {
        const target = path.join(workspacePath, write.path);
        const backup = path.join(transactionPath, "backups", write.path);
        if (fs.existsSync(target)) {
          fs.mkdirSync(path.dirname(backup), { recursive: true });
          fs.renameSync(target, backup);
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(path.join(transactionPath, "staged", write.path), target);
      }
      for (const deletion of deletes) {
        const target = path.join(workspacePath, deletion.path);
        const backup = path.join(transactionPath, "backups", deletion.path);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.renameSync(target, backup);
      }
      writeJournal(workspacePath, { ...journal, state: "committed" });
    } catch (error) {
      recoverWhiteboardTransaction(workspacePath);
      throw error;
    }
    recoverWhiteboardTransaction(workspacePath);
  } finally {
    releasesLock();
  }
}
