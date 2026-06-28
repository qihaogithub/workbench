import fs from "node:fs";
import path from "node:path";

import type { ProjectAdminActor } from "./types.js";

export const DEFAULT_AGENT_SERVICE_URL = "http://localhost:3201";
export const DEFAULT_SCREENSHOT_SERVICE_URL = "http://localhost:3202";
export const DEFAULT_PROJECT_ADMIN_MAX_BATCH_SIZE = 20;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function findProjectRoot(cwd: string): string {
  let current = path.resolve(cwd);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return cwd;
}

export function getProjectAdminDataDir(cwd = process.cwd()): string {
  return process.env.DATA_DIR ?? path.join(findProjectRoot(cwd), "data");
}

export function getProjectAdminAuditDir(dataDir: string): string {
  return (
    process.env.PROJECT_ADMIN_AUDIT_DIR ??
    path.join(dataDir, "audit", "project-admin")
  );
}

export function getProjectAdminMaxBatchSize(): number {
  return Number(
    process.env.PROJECT_ADMIN_MAX_BATCH_SIZE ||
      DEFAULT_PROJECT_ADMIN_MAX_BATCH_SIZE,
  );
}

export function getProjectAdminMode(
  writable: boolean,
): "cli" | "local" | "readonly" {
  return process.env.PROJECT_ADMIN_CLI_MODE === "local"
    ? "local"
    : writable
      ? "cli"
      : "readonly";
}

export function getProjectAdminActorEnv(): ProjectAdminActor {
  const role = (process.env.PROJECT_ADMIN_ROLE ??
    "admin") as ProjectAdminActor["role"];
  const user = process.env.USER ?? "local-codex";
  return {
    id: user,
    name: user,
    role: ["admin", "creator", "readonly"].includes(role) ? role : "admin",
    source: "project-admin-core",
    allowedProjectIds: parseCsvEnv(process.env.PROJECT_ADMIN_ALLOWED_PROJECTS),
  };
}

export function getViewerBaseUrl(): string {
  return trimTrailingSlashes(
    process.env.VIEWER_CLOUDFLARE_URL || process.env.VIEWER_LAN_URL || "",
  );
}

export function getScreenshotServiceUrl(): string {
  return trimTrailingSlashes(
    process.env.SCREENSHOT_SERVICE_URL ||
      process.env.NEXT_PUBLIC_SCREENSHOT_SERVICE_URL ||
      DEFAULT_SCREENSHOT_SERVICE_URL,
  );
}

export function getAgentServiceUrl(): string {
  return trimTrailingSlashes(
    process.env.AGENT_SERVICE_URL ||
      process.env.NEXT_PUBLIC_AGENT_SERVICE_URL ||
      DEFAULT_AGENT_SERVICE_URL,
  );
}
