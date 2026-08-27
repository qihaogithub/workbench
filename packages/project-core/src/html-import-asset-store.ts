import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HASH = /^[a-f0-9]{64}$/;
const EXT = /^\.[a-z0-9]{1,10}$/i;

export interface HtmlImportAssetReference {
  hash: string;
  path: string;
  size: number;
}

function extension(sourcePath: string): string {
  const value = path.posix.extname(sourcePath).toLowerCase();
  return EXT.test(value) ? value : ".bin";
}

/** Content-addressed, project-private store for local HTML bundle resources. */
export class HtmlImportAssetStore {
  constructor(private readonly workspacePath: string) {}

  persist(content: Buffer, sourcePath: string): HtmlImportAssetReference {
    if (!Buffer.isBuffer(content) || content.length === 0) throw new Error("HTML_IMPORT_ASSET_INVALID");
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const relativePath = `assets/html-import/${hash}${extension(sourcePath)}`;
    const target = path.join(this.workspacePath, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) {
      const existing = fs.readFileSync(target);
      if (!existing.equals(content)) throw new Error("HTML_IMPORT_ASSET_HASH_COLLISION");
    } else {
      const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      fs.writeFileSync(temporary, content, { mode: 0o600 });
      try { fs.renameSync(temporary, target); }
      catch { fs.rmSync(temporary, { force: true }); }
    }
    return { hash, path: relativePath, size: content.length };
  }

  read(hash: string): Buffer | null {
    if (!HASH.test(hash)) return null;
    const directory = path.join(this.workspacePath, "assets", "html-import");
    if (!fs.existsSync(directory)) return null;
    const match = fs.readdirSync(directory).find((name) => name.startsWith(`${hash}.`));
    if (!match) return null;
    const content = fs.readFileSync(path.join(directory, match));
    return crypto.createHash("sha256").update(content).digest("hex") === hash ? content : null;
  }

  prune(reachableHashes: Iterable<string>): string[] {
    const reachable = new Set([...reachableHashes].filter((hash) => HASH.test(hash)));
    const directory = path.join(this.workspacePath, "assets", "html-import");
    if (!fs.existsSync(directory)) return [];
    const removed: string[] = [];
    for (const name of fs.readdirSync(directory)) {
      const hash = name.slice(0, 64);
      if (!HASH.test(hash) || reachable.has(hash)) continue;
      const target = path.join(directory, name);
      if (fs.statSync(target).isFile()) {
        fs.rmSync(target, { force: true });
        removed.push(hash);
      }
    }
    return removed;
  }
}
