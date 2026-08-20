import fs from "node:fs";
import path from "node:path";
import { normalizeHtmlImport } from "@workbench/project-core";
import { getDataDir } from "@/lib/fs-utils";
import { createHtmlSandboxExecution, HTML_SANDBOX_POLICY_VERSION, resolveHtmlSandboxPublicOrigin } from "@/lib/html-sandbox-execution";

type PublishedMeta = { source: "html-import"; analysisVersion: number; sourceHash: string; normalizedHash: string; sandboxPolicyVersion: number; viewport?: { width: number; height: number } };
type PublishedManifestEntry = { sourceKey: string; fileName: string; htmlImportMeta: PublishedMeta };
export type PublishedHtmlExecutionIssueResult =
  | { ok: true; data: { executionUrl: string; channelId: string; expiresAt: number; sandboxPolicyVersion: number } }
  | { ok: false; status: number; message: string };

function failure(status: number, message: string): PublishedHtmlExecutionIssueResult { return { ok: false, status, message }; }
function isSafeSegment(value: string): boolean { return Boolean(value) && value !== "." && value !== ".." && !/[\\/]/.test(value); }
function isMeta(value: unknown): value is PublishedMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as Partial<PublishedMeta>;
  return meta.source === "html-import" && meta.analysisVersion === 1 &&
    meta.sandboxPolicyVersion === HTML_SANDBOX_POLICY_VERSION &&
    typeof meta.sourceHash === "string" && /^[a-f0-9]{64}$/i.test(meta.sourceHash) &&
    typeof meta.normalizedHash === "string" && /^[a-f0-9]{64}$/i.test(meta.normalizedHash);
}

/** Validate a private published source and issue a short-lived sandbox ticket. */
export function issuePublishedHtmlExecution(input: { projectId: string; pageId: string; version: string; requestOrigin: string }): PublishedHtmlExecutionIssueResult {
  const { projectId, pageId, version, requestOrigin } = input;
  if (!isSafeSegment(projectId) || !isSafeSegment(pageId) || !isSafeSegment(version)) return failure(400, "发布 HTML 参数不合法");
  const projectJsonPath = path.join(getDataDir(), "published", projectId, "project.json");
  if (!fs.existsSync(projectJsonPath)) return failure(404, "发布项目不存在");
  let project: { id?: string; publishedVersion?: string; demoPages?: Array<Record<string, unknown>> };
  try { project = JSON.parse(fs.readFileSync(projectJsonPath, "utf8")) as typeof project; }
  catch { return failure(500, "发布项目清单损坏"); }
  const page = project.demoPages?.find((candidate) => candidate.id === pageId);
  if (project.id !== projectId || project.publishedVersion !== version || !page) return failure(404, "发布页面不存在");
  if (page.runtimeType !== "sandboxed-html" || typeof page.sandboxExecutionPath !== "string") return failure(409, "页面不是 sandbox HTML 运行时");
  const pageMeta = page.htmlImportMeta;
  if (!isMeta(pageMeta)) return failure(422, "发布 HTML 安全元数据无效");

  const publicationDir = path.join(getDataDir(), "html-sandbox-published", projectId, version);
  let manifest: { version?: number; projectId?: string; publishedVersion?: string; pages?: Record<string, unknown> };
  try { manifest = JSON.parse(fs.readFileSync(path.join(publicationDir, "manifest.json"), "utf8")) as typeof manifest; }
  catch { return failure(404, "发布 HTML 源不存在"); }
  if (manifest.version !== 1 || manifest.projectId !== projectId || manifest.publishedVersion !== version) return failure(422, "发布 HTML manifest 不一致");
  const entry = manifest.pages?.[pageId];
  if (!entry || typeof entry !== "object") return failure(404, "发布 HTML 页面源不存在");
  const candidate = entry as Partial<PublishedManifestEntry>;
  if (!isSafeSegment(candidate.sourceKey ?? "") || !isSafeSegment(candidate.fileName ?? "") || !isMeta(candidate.htmlImportMeta)) return failure(422, "发布 HTML manifest 条目无效");
  if (candidate.htmlImportMeta.sourceHash !== pageMeta.sourceHash || candidate.htmlImportMeta.normalizedHash !== pageMeta.normalizedHash || candidate.htmlImportMeta.sandboxPolicyVersion !== pageMeta.sandboxPolicyVersion) return failure(422, "发布 HTML 页面元数据不一致");
  if (candidate.fileName !== `${candidate.sourceKey}.html`) return failure(422, "发布 HTML 源文件名不一致");
  const sourcePath = path.join(publicationDir, candidate.fileName);
  if (!sourcePath.startsWith(`${publicationDir}${path.sep}`) || !fs.existsSync(sourcePath)) return failure(404, "发布 HTML 源不存在");
  let html: string;
  try { html = fs.readFileSync(sourcePath, "utf8"); }
  catch { return failure(500, "读取发布 HTML 源失败"); }
  const normalized = normalizeHtmlImport(html);
  if (normalized.analysis.outcome.status !== "accepted" || normalized.analysis.outcome.runtimeType !== "sandboxed-html" || normalized.analysis.sourceHash !== pageMeta.normalizedHash) return failure(422, "发布 HTML 源哈希或安全合同不一致");
  const publicOrigin = resolveHtmlSandboxPublicOrigin(requestOrigin);
  if (!publicOrigin) return failure(503, "HTML sandbox 独立 origin 未配置");
  const ticket = createHtmlSandboxExecution(html);
  return { ok: true, data: { executionUrl: `${publicOrigin}/api/html-sandbox/executions/${ticket.executionId}`, channelId: ticket.channelId, expiresAt: ticket.expiresAt, sandboxPolicyVersion: HTML_SANDBOX_POLICY_VERSION } };
}
