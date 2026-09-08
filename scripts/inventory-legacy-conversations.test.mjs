import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "inventory-legacy-conversations.mjs",
);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

test("inventories legacy messages and attachment ownership without returning content", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-inventory-"));
  try {
    writeJson(
      path.join(dataDir, "sessions", "user-1", "project-1", "conversation-1", ".session.json"),
      { id: "conversation-1" },
    );
    writeJson(
      path.join(dataDir, "sessions", "user-1", "project-1", "conversation-1", ".messages.json"),
      [{
        id: "message-1",
        timestamp: 123,
        content: "must-not-leak",
        parts: [
          { attachmentId: "attachment-scoped" },
          { attachmentId: "attachment-legacy" },
          { attachmentId: "attachment-missing" },
        ],
      }],
    );

    const scopedDirectory = path.join(
      dataDir,
      "projects",
      "project-1",
      ".ai-attachments",
      "attachment-scoped",
    );
    writeJson(path.join(scopedDirectory, "manifest.json"), {
      id: "attachment-scoped",
      ownerUserId: "user-1",
      conversationId: "conversation-1",
    });
    fs.writeFileSync(path.join(scopedDirectory, "text.txt"), "attachment-secret", "utf8");

    const legacyDirectory = path.join(
      dataDir,
      "projects",
      "project-1",
      ".ai-attachments",
      "attachment-legacy",
    );
    writeJson(path.join(legacyDirectory, "manifest.json"), {
      id: "wrong-id",
      name: "legacy.md",
    });
    fs.writeFileSync(path.join(legacyDirectory, "text.txt"), "legacy-secret", "utf8");

    fs.mkdirSync(path.join(
      dataDir,
      "projects",
      "project-1",
      ".ai-attachments",
      "attachment-no-manifest",
    ));

    const output = execFileSync(process.execPath, [scriptPath, "--data-dir", dataDir], {
      encoding: "utf8",
    });
    const report = JSON.parse(output);

    assert.equal(report.schemaVersion, 2);
    assert.equal(report.sessionMetaFiles, 1);
    assert.equal(report.messageFiles, 1);
    assert.equal(report.messages, 1);
    assert.deepEqual(report.attachments, {
      directories: 3,
      manifestFiles: 2,
      missingManifestFiles: 1,
      invalidManifestJsonFiles: 0,
      scopedManifests: 1,
      unscopedManifests: 1,
      missingOwnerUserId: 1,
      missingConversationId: 1,
      mismatchedAttachmentIds: 1,
      totalBytes: report.attachments.totalBytes,
      largestAttachmentBytes: report.attachments.largestAttachmentBytes,
      largeAttachments: 0,
      referenceAnalysis: {
        referencedIds: 3,
        referenceOccurrences: 3,
        physicallyPresentReferencedIds: 2,
        missingPhysicalReferencedIds: 1,
        unreferencedPhysicalAttachments: 1,
        uniquelyMappableUnscopedAttachments: 1,
        ambiguousUnscopedAttachments: 0,
      },
    });
    assert.ok(report.attachments.totalBytes > 0);
    assert.ok(report.attachments.largestAttachmentBytes > 0);
    assert.equal(output.includes("must-not-leak"), false);
    assert.equal(output.includes("attachment-secret"), false);
    assert.equal(output.includes("legacy-secret"), false);
    assert.equal(output.includes("attachment-scoped"), false);
    assert.equal(output.includes("attachment-legacy"), false);
    assert.equal(output.includes("attachment-missing"), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
