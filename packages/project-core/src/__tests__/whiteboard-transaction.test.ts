import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  WhiteboardTransactionConflictError,
  recoverWhiteboardTransaction,
  writeWhiteboardTransaction,
} from "../whiteboard-transaction";

const roots: string[] = [];

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "whiteboard-transaction-"));
  roots.push(root);
  return root;
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("whiteboard non-live transactions", () => {
  it("rejects an outdated expected hash without changing any file", () => {
    const root = workspace();
    fs.writeFileSync(path.join(root, "document.json"), "newer");
    expect(() => writeWhiteboardTransaction(root, {
      writes: [{ path: "document.json", content: "next", expectedHash: hash("older") }],
    })).toThrow(WhiteboardTransactionConflictError);
    expect(fs.readFileSync(path.join(root, "document.json"), "utf8")).toBe("newer");
  });

  it("recovers an interrupted prepared transaction before accepting another write", () => {
    const root = workspace();
    fs.writeFileSync(path.join(root, "document.json"), "old");
    const txDir = path.join(root, ".whiteboard-transaction-interrupted");
    fs.mkdirSync(path.join(txDir, "backups"), { recursive: true });
    fs.renameSync(path.join(root, "document.json"), path.join(txDir, "backups", "document.json"));
    fs.writeFileSync(path.join(root, ".whiteboard-transaction.json"), JSON.stringify({
      version: 1,
      state: "prepared",
      transactionDir: path.basename(txDir),
      entries: [{ path: "document.json", backup: "backups/document.json" }],
    }));
    recoverWhiteboardTransaction(root);
    expect(fs.readFileSync(path.join(root, "document.json"), "utf8")).toBe("old");
    expect(fs.existsSync(path.join(root, ".whiteboard-transaction.json"))).toBe(false);
  });
});
