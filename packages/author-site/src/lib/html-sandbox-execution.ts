import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATA_DIR } from "./paths";

export const HTML_SANDBOX_EXECUTION_TTL_MS = 5 * 60 * 1000;
export const HTML_SANDBOX_POLICY_VERSION = 1;

export interface HtmlSandboxExecutionTicket {
  executionId: string;
  channelId: string;
  html: string;
  createdAt: number;
  expiresAt: number;
  sandboxPolicyVersion: number;
}

const EXECUTION_ID_PATTERN = /^[a-f0-9]{32}$/;

function executionDir(): string {
  return path.join(DATA_DIR, "html-sandbox-executions");
}

function executionPath(executionId: string): string | null {
  if (!EXECUTION_ID_PATTERN.test(executionId)) return null;
  return path.join(executionDir(), `${executionId}.json`);
}

function removeExpiredTickets(now: number): void {
  const dir = executionDir();
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(dir, entry.name);
    try {
      const ticket = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<HtmlSandboxExecutionTicket>;
      if (typeof ticket.expiresAt !== "number" || ticket.expiresAt <= now) {
        fs.rmSync(filePath, { force: true });
      }
    } catch {
      fs.rmSync(filePath, { force: true });
    }
  }
}

export function createHtmlSandboxExecution(
  html: string,
  now = Date.now(),
): Pick<HtmlSandboxExecutionTicket, "executionId" | "channelId" | "expiresAt"> {
  const dir = executionDir();
  fs.mkdirSync(dir, { recursive: true });
  removeExpiredTickets(now);
  const executionId = crypto.randomBytes(16).toString("hex");
  const ticket: HtmlSandboxExecutionTicket = {
    executionId,
    channelId: crypto.randomBytes(16).toString("hex"),
    html,
    createdAt: now,
    expiresAt: now + HTML_SANDBOX_EXECUTION_TTL_MS,
    sandboxPolicyVersion: HTML_SANDBOX_POLICY_VERSION,
  };
  const target = executionPath(executionId);
  if (!target) throw new Error("HTML_SANDBOX_EXECUTION_ID_INVALID");
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(ticket)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, target);
  return { executionId, channelId: ticket.channelId, expiresAt: ticket.expiresAt };
}

export function readHtmlSandboxExecution(
  executionId: string,
  now = Date.now(),
): HtmlSandboxExecutionTicket | null {
  const filePath = executionPath(executionId);
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const ticket = JSON.parse(fs.readFileSync(filePath, "utf8")) as HtmlSandboxExecutionTicket;
    if (
      ticket.executionId !== executionId ||
      typeof ticket.channelId !== "string" ||
      typeof ticket.html !== "string" ||
      ticket.sandboxPolicyVersion !== HTML_SANDBOX_POLICY_VERSION ||
      typeof ticket.expiresAt !== "number" ||
      ticket.expiresAt <= now
    ) {
      fs.rmSync(filePath, { force: true });
      return null;
    }
    return ticket;
  } catch {
    fs.rmSync(filePath, { force: true });
    return null;
  }
}

function stripInputPolicyElements(html: string): string {
  return html
    .replace(/<base\b[^>]*>/gi, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?content-security-policy\b)[^>]*>/gi, "")
    .replace(/<meta\b(?=[^>]*http-equiv\s*=\s*["']?refresh\b)[^>]*>/gi, "");
}

function bridgeScript(channelId: string): string {
  const channel = JSON.stringify(channelId);
  return `<script>(function(){"use strict";const channelId=${channel};const hash=new URLSearchParams(location.hash.slice(1));const loadGeneration=Number(hash.get("workbenchGeneration"))||0;let sent=0;let windowStart=Date.now();const post=(type,payload={})=>{const now=Date.now();if(now-windowStart>1000){windowStart=now;sent=0}if(sent>=20)return;sent++;parent.postMessage({channel:"workbench-sandboxed-html-v1",channelId,loadGeneration,type,payload},"*")};addEventListener("error",e=>post("RUNTIME_ERROR",{message:String(e.message||"Runtime error").slice(0,500)}));addEventListener("unhandledrejection",e=>post("RUNTIME_ERROR",{message:String(e.reason||"Unhandled rejection").slice(0,500)}));const ready=()=>{post("READY");let last=0;const resize=()=>{const now=Date.now();if(now-last<100)return;last=now;post("RESIZE",{width:Math.min(10000,Math.max(0,document.documentElement.scrollWidth)),height:Math.min(10000,Math.max(0,document.documentElement.scrollHeight))})};resize();if(typeof ResizeObserver==="function")new ResizeObserver(resize).observe(document.documentElement)};document.readyState==="loading"?addEventListener("DOMContentLoaded",ready,{once:true}):ready()})();</script>`;
}

export function buildHtmlSandboxExecutionDocument(ticket: HtmlSandboxExecutionTicket): string {
  const source = stripInputPolicyElements(ticket.html);
  const bridge = bridgeScript(ticket.channelId);
  if (/<head\b[^>]*>/i.test(source)) {
    return source.replace(/<head\b([^>]*)>/i, `<head$1>${bridge}`);
  }
  if (/<html\b[^>]*>/i.test(source)) {
    return source.replace(/<html\b([^>]*)>/i, `<html$1><head>${bridge}</head>`);
  }
  return `<!doctype html><html><head>${bridge}</head><body>${source}</body></html>`;
}

export function getHtmlSandboxResponseHeaders(frameAncestors: string[]): Record<string, string> {
  const ancestors = frameAncestors.length > 0 ? frameAncestors.join(" ") : "'none'";
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "script-src-elem 'unsafe-inline'",
      "script-src-attr 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src data:",
      "media-src data: blob:",
      "connect-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "worker-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      `frame-ancestors ${ancestors}`,
    ].join("; ") + ";",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), clipboard-read=(), clipboard-write=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
}

export function resolveHtmlSandboxPublicOrigin(requestOrigin: string): string | null {
  const configured = process.env.HTML_SANDBOX_PUBLIC_ORIGIN?.trim();
  if (configured) {
    try { return new URL(configured).origin; } catch { return null; }
  }
  if (process.env.NODE_ENV === "production") return null;
  try {
    const url = new URL(requestOrigin);
    url.hostname = url.hostname === "localhost" ? "127.0.0.1" : "localhost";
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveHtmlSandboxFrameAncestors(): string[] {
  const configured = process.env.HTML_SANDBOX_FRAME_ANCESTORS?.trim();
  if (configured) return configured.split(/\s+/).filter(Boolean);
  if (process.env.NODE_ENV === "production") return [];
  return ["http://localhost:4200", "http://127.0.0.1:4200"];
}
