#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const dataDir = path.resolve(option("--data-dir") || process.env.DATA_DIR || "data");
const apply = process.argv.includes("--apply");
const archiveId = option("--archive-id") || new Date().toISOString().replace(/[:.]/g, "-");
if (!/^[a-zA-Z0-9._-]+$/.test(archiveId)) {
  throw new Error("archive id contains invalid characters");
}

const archiveParent = path.join(dataDir, "legacy-conversation-archives");
const destination = path.join(archiveParent, archiveId);

function collectFiles(directory, relativeRoot, result) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    const relativePath = path.join(relativeRoot, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to archive symbolic link: ${relativePath}`);
    }
    if (entry.isDirectory()) collectFiles(source, relativePath, result);
    else if (entry.isFile()) result.push({ source, relativePath });
  }
}

function collectSessionConversationFiles(directory, result) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`refusing to archive symbolic link: ${path.relative(dataDir, source)}`);
    }
    if (entry.isDirectory()) {
      collectSessionConversationFiles(source, result);
    } else if (
      entry.isFile() &&
      (entry.name === ".session.json" || entry.name === ".messages.json")
    ) {
      result.push({ source, relativePath: path.relative(dataDir, source) });
    }
  }
}

function collectLegacyFiles() {
  const files = [];
  collectSessionConversationFiles(path.join(dataDir, "sessions"), files);
  const projectsRoot = path.join(dataDir, "projects");
  if (fs.existsSync(projectsRoot)) {
    for (const project of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (!project.isDirectory()) continue;
      collectFiles(
        path.join(projectsRoot, project.name, ".ai-attachments"),
        path.join("projects", project.name, ".ai-attachments"),
        files,
      );
    }
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

const files = collectLegacyFiles();
const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file.source).size, 0);
if (!apply) {
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "dry-run",
    archiveId,
    destination,
    files: files.length,
    totalBytes,
    sourceRemoved: false,
  }, null, 2)}\n`);
  process.exit(0);
}

if (fs.existsSync(destination)) {
  throw new Error(`archive destination already exists: ${destination}`);
}

fs.mkdirSync(archiveParent, { recursive: true });
const temporaryDestination = path.join(
  archiveParent,
  `.tmp-${archiveId}-${process.pid}`,
);
if (fs.existsSync(temporaryDestination)) {
  throw new Error(`temporary archive destination already exists: ${temporaryDestination}`);
}

try {
  const archivedFiles = [];
  for (const file of files) {
    const target = path.join(temporaryDestination, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target, fs.constants.COPYFILE_EXCL);
    const sourceHash = sha256(file.source);
    const targetHash = sha256(target);
    if (sourceHash !== targetHash) {
      throw new Error(`archive verification failed: ${file.relativePath}`);
    }
    archivedFiles.push({
      path: file.relativePath,
      sizeBytes: fs.statSync(file.source).size,
      sha256: sourceHash,
    });
  }
  const manifest = {
    schemaVersion: 1,
    archiveId,
    createdAt: new Date().toISOString(),
    sourceRemoved: false,
    files: archivedFiles,
  };
  const manifestPath = path.join(temporaryDestination, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  const manifestSha256 = sha256(manifestPath);
  fs.renameSync(temporaryDestination, destination);
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    mode: "applied",
    archiveId,
    destination,
    files: archivedFiles.length,
    totalBytes,
    manifestSha256,
    sourceRemoved: false,
  }, null, 2)}\n`);
} catch (error) {
  fs.rmSync(temporaryDestination, { recursive: true, force: true });
  throw error;
}
