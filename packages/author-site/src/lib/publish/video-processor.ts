import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { PublishContext } from "./types";

const SESSION_WORKSPACE_VIDEO_RE = /\/api\/sessions\/[^/]+\/workspace\/(assets\/videos\/(?:[^/?#]+\/)*[^/?#]+\.(?:mp4|webm))(?:[?#][^"'\s)]*)?/gi;
const SINGLE_SESSION_WORKSPACE_VIDEO_RE = /\/api\/sessions\/[^/]+\/workspace\/(assets\/videos\/(?:[^/?#]+\/)*[^/?#]+\.(?:mp4|webm))(?:[?#][^"'\s)]*)?/i;

export interface VideoProcessResult {
  urlMap: Map<string, string>;
  errors: Array<{ url: string; reason: string }>;
}

function collectVideoUrls(workspacePath: string): Set<string> {
  const urls = new Set<string>();
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (["config.schema.json", "config.values.json", "project.config.schema.json", "project.config.values.json"].includes(entry.name)) {
        const content = fs.readFileSync(filePath, "utf-8");
        for (const match of content.matchAll(SESSION_WORKSPACE_VIDEO_RE)) urls.add(match[0]);
      }
    }
  };
  visit(workspacePath);
  return urls;
}

function workspaceVideoPath(workspacePath: string, url: string): string | null {
  const match = url.match(SINGLE_SESSION_WORKSPACE_VIDEO_RE);
  if (!match) return null;
  const absolutePath = path.resolve(workspacePath, match[1]);
  return absolutePath.startsWith(`${path.resolve(workspacePath)}${path.sep}`) ? absolutePath : null;
}

/** Localizes session-scoped configuration videos into the published project. */
export function processVideosForPublish(context: PublishContext): VideoProcessResult {
  const urlMap = new Map<string, string>();
  const errors: VideoProcessResult["errors"] = [];
  const targetDirectory = path.join(context.publishDir, "assets", "videos");
  for (const url of collectVideoUrls(context.workspacePath)) {
    const sourcePath = workspaceVideoPath(context.workspacePath, url);
    if (!sourcePath || !fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      errors.push({ url, reason: "FILE_NOT_FOUND" });
      continue;
    }
    const extension = path.extname(sourcePath).toLowerCase();
    const filename = `${crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex").slice(0, 16)}${extension}`;
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(targetDirectory, filename));
    urlMap.set(url, `/data/${context.projectId}/assets/videos/${filename}`);
  }
  return { urlMap, errors };
}
