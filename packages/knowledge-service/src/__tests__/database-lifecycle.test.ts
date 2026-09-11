import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inspectDatabaseIntegrity, prepareKnowledgeDatabase, readLatestKnowledgeDatabaseRecovery } from "../database-lifecycle.js";
import { SqliteKnowledgeCatalog } from "../sqlite-catalog.js";
import { SqliteInventoryCatalog } from "../inventory-catalog.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("knowledge database lifecycle", () => {
  it("quarantines a corrupt database with its WAL and SHM before rebuilding", () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "knowledge-recovery-"));
    temporaryDirectories.push(dataDir);
    const knowledgeDir = path.join(dataDir, "knowledge");
    fs.mkdirSync(knowledgeDir, { recursive: true });
    const databasePath = path.join(knowledgeDir, "knowledge.db");
    fs.writeFileSync(databasePath, "not a sqlite database", "utf8");
    fs.writeFileSync(`${databasePath}-wal`, "wal", "utf8");
    fs.writeFileSync(`${databasePath}-shm`, "shm", "utf8");

    const recovery = prepareKnowledgeDatabase({ dataDir });

    expect(recovery).not.toBeNull();
    expect(recovery?.movedFiles.map((file) => path.basename(file)).sort()).toEqual([
      "knowledge.db",
      "knowledge.db-shm",
      "knowledge.db-wal",
    ]);
    expect(fs.existsSync(databasePath)).toBe(false);
    expect(fs.existsSync(path.join(recovery!.quarantinePath, "recovery.json"))).toBe(true);
    expect(readLatestKnowledgeDatabaseRecovery(dataDir)?.quarantinePath).toBe(recovery?.quarantinePath);

    const knowledge = new SqliteKnowledgeCatalog({ dataDir });
    const inventory = new SqliteInventoryCatalog({ dataDir, databasePath: knowledge.databasePath });
    inventory.close();
    knowledge.close();
    expect(inspectDatabaseIntegrity(databasePath).ok).toBe(true);
  });
});
