#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const dataDirIndex = process.argv.indexOf("--data-dir");
const dataDir = path.resolve(
  dataDirIndex >= 0 && process.argv[dataDirIndex + 1]
    ? process.argv[dataDirIndex + 1]
    : process.env.DATA_DIR || "data",
);
const sessionsRoot = path.join(dataDir, "sessions");
const projectsRoot = path.join(dataDir, "projects");
const attachmentReferenceScopes = new Map();
const physicalAttachments = new Map();
let attachmentReferenceOccurrences = 0;
const report = {
  schemaVersion: 2,
  dataDir,
  scannedAt: new Date().toISOString(),
  sessionMetaFiles: 0,
  messageFiles: 0,
  invalidJsonFiles: 0,
  messages: 0,
  duplicateMessageIds: 0,
  invalidTimestamps: 0,
  largeMessageFiles: 0,
  largestMessageFileBytes: 0,
  attachments: {
    directories: 0,
    manifestFiles: 0,
    missingManifestFiles: 0,
    invalidManifestJsonFiles: 0,
    scopedManifests: 0,
    unscopedManifests: 0,
    missingOwnerUserId: 0,
    missingConversationId: 0,
    mismatchedAttachmentIds: 0,
    totalBytes: 0,
    largestAttachmentBytes: 0,
    largeAttachments: 0,
    referenceAnalysis: {
      referencedIds: 0,
      referenceOccurrences: 0,
      physicallyPresentReferencedIds: 0,
      missingPhysicalReferencedIds: 0,
      unreferencedPhysicalAttachments: 0,
      uniquelyMappableUnscopedAttachments: 0,
      ambiguousUnscopedAttachments: 0,
    },
  },
};

function attachmentKey(projectId, attachmentId) {
  return `${projectId}\u0000${attachmentId}`;
}

function collectAttachmentIds(value, result, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentIds(item, result, seen);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === "attachmentId" && typeof nested === "string" && nested.trim()) {
      result.push(nested.trim());
    } else {
      collectAttachmentIds(nested, result, seen);
    }
  }
}

function inspectJson(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    report.invalidJsonFiles += 1;
    return;
  }
  if (!filePath.endsWith(".messages.json")) return;
  const size = fs.statSync(filePath).size;
  report.messageFiles += 1;
  report.largestMessageFileBytes = Math.max(report.largestMessageFileBytes, size);
  if (size > 1024 * 1024) report.largeMessageFiles += 1;
  if (!Array.isArray(parsed)) return;
  report.messages += parsed.length;
  const relativeParts = path.relative(sessionsRoot, filePath).split(path.sep);
  const [ownerUserId, projectId, conversationId] = relativeParts;
  if (ownerUserId && projectId && conversationId) {
    const scope = JSON.stringify({ ownerUserId, projectId, conversationId });
    const referencedIds = [];
    collectAttachmentIds(parsed, referencedIds);
    for (const attachmentId of referencedIds) {
      attachmentReferenceOccurrences += 1;
      const key = attachmentKey(projectId, attachmentId);
      const scopes = attachmentReferenceScopes.get(key) ?? new Set();
      scopes.add(scope);
      attachmentReferenceScopes.set(key, scopes);
    }
  }
  const ids = new Set();
  for (const message of parsed) {
    if (message && typeof message === "object") {
      if (typeof message.id === "string") {
        if (ids.has(message.id)) report.duplicateMessageIds += 1;
        ids.add(message.id);
      }
      if (message.timestamp !== undefined && !Number.isFinite(message.timestamp)) {
        report.invalidTimestamps += 1;
      }
    }
  }
}

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name === ".session.json") {
      report.sessionMetaFiles += 1;
      inspectJson(target);
    } else if (entry.name === ".messages.json") {
      inspectJson(target);
    }
  }
}

function directorySize(directory) {
  let bytes = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) bytes += directorySize(target);
    else if (entry.isFile()) bytes += fs.statSync(target).size;
  }
  return bytes;
}

function inspectAttachmentDirectory(projectId, attachmentId, attachmentDirectory) {
  report.attachments.directories += 1;
  physicalAttachments.set(attachmentKey(projectId, attachmentId), { scoped: false });
  const bytes = directorySize(attachmentDirectory);
  report.attachments.totalBytes += bytes;
  report.attachments.largestAttachmentBytes = Math.max(
    report.attachments.largestAttachmentBytes,
    bytes,
  );
  if (bytes > 20 * 1024 * 1024) report.attachments.largeAttachments += 1;

  const manifestPath = path.join(attachmentDirectory, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    report.attachments.missingManifestFiles += 1;
    return;
  }
  report.attachments.manifestFiles += 1;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    report.invalidJsonFiles += 1;
    report.attachments.invalidManifestJsonFiles += 1;
    return;
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    report.attachments.invalidManifestJsonFiles += 1;
    return;
  }
  if (manifest.id !== attachmentId) {
    report.attachments.mismatchedAttachmentIds += 1;
  }
  const hasOwnerUserId =
    typeof manifest.ownerUserId === "string" && manifest.ownerUserId.trim().length > 0;
  const hasConversationId =
    typeof manifest.conversationId === "string" && manifest.conversationId.trim().length > 0;
  if (!hasOwnerUserId) report.attachments.missingOwnerUserId += 1;
  if (!hasConversationId) report.attachments.missingConversationId += 1;
  if (hasOwnerUserId && hasConversationId) {
    report.attachments.scopedManifests += 1;
  } else {
    report.attachments.unscopedManifests += 1;
  }
  physicalAttachments.set(attachmentKey(projectId, attachmentId), {
    scoped: hasOwnerUserId && hasConversationId,
  });
}

function walkProjectAttachments() {
  if (!fs.existsSync(projectsRoot)) return;
  for (const projectEntry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
    if (!projectEntry.isDirectory()) continue;
    const attachmentsRoot = path.join(
      projectsRoot,
      projectEntry.name,
      ".ai-attachments",
    );
    if (!fs.existsSync(attachmentsRoot)) continue;
    for (const attachmentEntry of fs.readdirSync(attachmentsRoot, {
      withFileTypes: true,
    })) {
      if (!attachmentEntry.isDirectory()) continue;
      inspectAttachmentDirectory(
        projectEntry.name,
        attachmentEntry.name,
        path.join(attachmentsRoot, attachmentEntry.name),
      );
    }
  }
}

function finalizeAttachmentReferenceAnalysis() {
  const analysis = report.attachments.referenceAnalysis;
  analysis.referencedIds = attachmentReferenceScopes.size;
  analysis.referenceOccurrences = attachmentReferenceOccurrences;
  for (const [key, attachment] of physicalAttachments) {
    const scopes = attachmentReferenceScopes.get(key);
    if (!scopes) {
      analysis.unreferencedPhysicalAttachments += 1;
      continue;
    }
    analysis.physicallyPresentReferencedIds += 1;
    if (!attachment.scoped) {
      if (scopes.size === 1) analysis.uniquelyMappableUnscopedAttachments += 1;
      else analysis.ambiguousUnscopedAttachments += 1;
    }
  }
  for (const key of attachmentReferenceScopes.keys()) {
    if (!physicalAttachments.has(key)) {
      analysis.missingPhysicalReferencedIds += 1;
    }
  }
}

walk(sessionsRoot);
walkProjectAttachments();
finalizeAttachmentReferenceAnalysis();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
