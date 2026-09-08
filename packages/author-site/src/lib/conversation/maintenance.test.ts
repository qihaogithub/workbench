/** @jest-environment node */

import fs from "fs";
import os from "os";
import path from "path";
import { backupConversationLedger } from "./maintenance";
import { SqliteConversationRepository } from "./sqlite-repository";

describe("conversation ledger maintenance", () => {
  it("creates online backups and keeps only the configured rotation window", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "conversation-maintenance-"));
    const repository = new SqliteConversationRepository(path.join(directory, "conversation.db"));
    repository.ensureConversation({
      id: "conversation-1",
      ownerUserId: "user-1",
      projectId: "project-1",
    });
    const backupDirectory = path.join(directory, "backups");
    await backupConversationLedger({ repository, backupDirectory, keep: 2, now: 1 });
    await backupConversationLedger({ repository, backupDirectory, keep: 2, now: 2 });
    await backupConversationLedger({ repository, backupDirectory, keep: 2, now: 3 });
    expect(fs.readdirSync(backupDirectory).sort()).toEqual([
      "conversation-2.db",
      "conversation-3.db",
    ]);
    const restored = new SqliteConversationRepository(path.join(backupDirectory, "conversation-3.db"));
    expect(restored.quickCheck()).toBe(true);
    restored.close();
    repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
