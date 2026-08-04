import crypto from "crypto";
import fs from "fs";
import path from "path";

import { encodeDocumentName, type CollabDocumentName } from "./document-name";
import { logger } from "../utils/logger";

function stateFileName(descriptor: CollabDocumentName): string {
  const key = encodeDocumentName(descriptor);
  return crypto.createHash("sha256").update(key).digest("hex") + ".yjs";
}

export class CollabStateStore {
  private readonly storeDir: string;

  constructor(dataDir: string) {
    this.storeDir = path.join(dataDir, "collab-state");
  }

  private workspaceDir(workspaceId: string): string {
    return path.join(this.storeDir, encodeURIComponent(workspaceId));
  }

  private filePath(workspaceId: string, descriptor: CollabDocumentName): string {
    return path.join(this.workspaceDir(workspaceId), stateFileName(descriptor));
  }

  save(workspaceId: string, descriptor: CollabDocumentName, update: Uint8Array): void {
    try {
      const dir = this.workspaceDir(workspaceId);
      fs.mkdirSync(dir, { recursive: true });
      const target = this.filePath(workspaceId, descriptor);
      fs.writeFileSync(target, update);
    } catch (error) {
      logger.error({ error, workspaceId }, "CollabStateStore: save failed");
    }
  }

  load(workspaceId: string, descriptor: CollabDocumentName): Uint8Array | null {
    try {
      const target = this.filePath(workspaceId, descriptor);
      if (!fs.existsSync(target)) return null;
      const buf = fs.readFileSync(target);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (error) {
      logger.error({ error, workspaceId }, "CollabStateStore: load failed");
      return null;
    }
  }

  deleteWorkspace(workspaceId: string): void {
    try {
      const dir = this.workspaceDir(workspaceId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.error({ error, workspaceId }, "CollabStateStore: deleteWorkspace failed");
    }
  }
}
