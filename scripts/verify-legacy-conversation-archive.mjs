#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dataDir = path.resolve(option("--data-dir") || process.env.DATA_DIR || "data");
const archiveId = option("--archive-id");
if (!archiveId || !/^[a-zA-Z0-9._-]+$/.test(archiveId)) {
  throw new Error("a valid --archive-id is required");
}
const archiveDirectory = path.join(
  dataDir,
  "legacy-conversation-archives",
  archiveId,
);
const manifestPath = path.join(archiveDirectory, "manifest.json");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function resolveManifestPath(relativePath) {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath === "manifest.json"
  ) {
    throw new Error("archive manifest contains an invalid path");
  }
  const target = path.resolve(archiveDirectory, relativePath);
  if (!target.startsWith(`${archiveDirectory}${path.sep}`)) {
    throw new Error("archive manifest path escapes archive directory");
  }
  return target;
}

function collectArchivedFiles(directory, relativeRoot, result) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error("archive contains a symbolic link");
    }
    if (entry.isDirectory()) collectArchivedFiles(target, relativePath, result);
    else if (entry.isFile() && relativePath !== "manifest.json") result.add(relativePath);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (
  !manifest ||
  manifest.schemaVersion !== 1 ||
  manifest.archiveId !== archiveId ||
  manifest.sourceRemoved !== false ||
  !Array.isArray(manifest.files)
) {
  throw new Error("archive manifest schema is invalid");
}

const declaredPaths = new Set();
let totalBytes = 0;
for (const entry of manifest.files) {
  if (
    !entry ||
    typeof entry !== "object" ||
    !Number.isSafeInteger(entry.sizeBytes) ||
    entry.sizeBytes < 0 ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    throw new Error("archive manifest file entry is invalid");
  }
  const target = resolveManifestPath(entry.path);
  if (declaredPaths.has(entry.path)) {
    throw new Error("archive manifest contains a duplicate path");
  }
  declaredPaths.add(entry.path);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("archive entry is not a regular file");
  }
  if (stat.size !== entry.sizeBytes) {
    throw new Error("archive entry size does not match manifest");
  }
  if (sha256(target) !== entry.sha256) {
    throw new Error("archive entry hash does not match manifest");
  }
  totalBytes += stat.size;
}

const actualPaths = new Set();
collectArchivedFiles(archiveDirectory, "", actualPaths);
if (
  actualPaths.size !== declaredPaths.size ||
  [...actualPaths].some((relativePath) => !declaredPaths.has(relativePath))
) {
  throw new Error("archive contains missing or undeclared files");
}

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  archiveId,
  verified: true,
  files: declaredPaths.size,
  totalBytes,
  manifestSha256: sha256(manifestPath),
  sourceRemoved: false,
}, null, 2)}\n`);
