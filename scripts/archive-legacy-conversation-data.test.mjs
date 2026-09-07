import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "archive-legacy-conversation-data.mjs",
);
const verifyScriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "verify-legacy-conversation-archive.mjs",
);

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("dry-run is read-only and apply creates a verified non-destructive archive", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-archive-"));
  try {
    const messagePath = path.join(
      dataDir,
      "sessions",
      "user-1",
      "project-1",
      "conversation-1",
      ".messages.json",
    );
    const attachmentPath = path.join(
      dataDir,
      "projects",
      "project-1",
      ".ai-attachments",
      "attachment-1",
      "text.txt",
    );
    fs.mkdirSync(path.dirname(messagePath), { recursive: true });
    fs.mkdirSync(path.dirname(attachmentPath), { recursive: true });
    fs.writeFileSync(messagePath, "message-secret", "utf8");
    fs.writeFileSync(attachmentPath, "attachment-secret", "utf8");
    const unrelatedWorkspaceFile = path.join(
      dataDir,
      "sessions",
      "user-1",
      "project-1",
      "conversation-1",
      "workspace",
      "page.tsx",
    );
    fs.mkdirSync(path.dirname(unrelatedWorkspaceFile), { recursive: true });
    fs.writeFileSync(unrelatedWorkspaceFile, "workspace-secret", "utf8");

    const dryRun = JSON.parse(execFileSync(process.execPath, [
      scriptPath,
      "--data-dir",
      dataDir,
      "--archive-id",
      "test-archive",
    ], { encoding: "utf8" }));
    assert.equal(dryRun.mode, "dry-run");
    assert.equal(dryRun.files, 2);
    assert.equal(dryRun.sourceRemoved, false);
    assert.equal(fs.existsSync(dryRun.destination), false);

    const applied = JSON.parse(execFileSync(process.execPath, [
      scriptPath,
      "--data-dir",
      dataDir,
      "--archive-id",
      "test-archive",
      "--apply",
    ], { encoding: "utf8" }));
    assert.equal(applied.mode, "applied");
    assert.equal(applied.files, 2);
    assert.equal(applied.sourceRemoved, false);
    assert.equal(fs.existsSync(messagePath), true);
    assert.equal(fs.existsSync(attachmentPath), true);

    const archivedMessage = path.join(
      applied.destination,
      path.relative(dataDir, messagePath),
    );
    const archivedAttachment = path.join(
      applied.destination,
      path.relative(dataDir, attachmentPath),
    );
    assert.equal(sha256(archivedMessage), sha256(messagePath));
    assert.equal(sha256(archivedAttachment), sha256(attachmentPath));
    assert.equal(fs.existsSync(path.join(
      applied.destination,
      path.relative(dataDir, unrelatedWorkspaceFile),
    )), false);
    const manifestPath = path.join(applied.destination, "manifest.json");
    assert.equal(sha256(manifestPath), applied.manifestSha256);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.files.length, 2);
    assert.equal(manifest.sourceRemoved, false);

    const verified = JSON.parse(execFileSync(process.execPath, [
      verifyScriptPath,
      "--data-dir",
      dataDir,
      "--archive-id",
      "test-archive",
    ], { encoding: "utf8" }));
    assert.equal(verified.verified, true);
    assert.equal(verified.files, 2);

    fs.writeFileSync(archivedAttachment, "tampered", "utf8");
    assert.throws(() => execFileSync(process.execPath, [
      verifyScriptPath,
      "--data-dir",
      dataDir,
      "--archive-id",
      "test-archive",
    ], { encoding: "utf8", stdio: "pipe" }));

    fs.writeFileSync(archivedAttachment, "attachment-secret", "utf8");
    fs.writeFileSync(path.join(applied.destination, "undeclared.txt"), "extra", "utf8");
    assert.throws(() => execFileSync(process.execPath, [
      verifyScriptPath,
      "--data-dir",
      dataDir,
      "--archive-id",
      "test-archive",
    ], { encoding: "utf8", stdio: "pipe" }));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
