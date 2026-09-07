import fs from "fs";
import path from "path";
import type { ConversationRepository } from "./repository";
import type { ConversationDeletionScope } from "./domain";

export async function backupConversationLedger(input: {
  repository: ConversationRepository;
  backupDirectory: string;
  keep?: number;
  now?: number;
}): Promise<string> {
  const keep = Math.max(1, Math.min(30, Math.floor(input.keep ?? 7)));
  const now = input.now ?? Date.now();
  fs.mkdirSync(input.backupDirectory, { recursive: true });
  const destination = path.join(input.backupDirectory, `conversation-${now}.db`);
  await input.repository.backup(destination);
  const backups = fs.readdirSync(input.backupDirectory)
    .filter((name) => /^conversation-\d+\.db$/.test(name))
    .sort((left, right) => right.localeCompare(left));
  for (const expired of backups.slice(keep)) {
    fs.rmSync(path.join(input.backupDirectory, expired));
  }
  return destination;
}

export function runConversationRetention(input: {
  repository: ConversationRepository;
  now?: number;
}): ConversationDeletionScope[] {
  return input.repository.deleteExpired(input.now);
}
