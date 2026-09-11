import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DocumentApplicationError, DocumentApplicationService, ResourceVersionDocumentAdapter } from "../documents/index.js";
import { WorkspaceDocumentRepository } from "../documents/workspace-document-repository.js";
import { ProjectAdminService } from "../service.js";
import type { ProjectAdminActor } from "../types.js";

const actor: ProjectAdminActor = { id: "u1", name: "Author", role: "creator", allowedProjectIds: ["p1"] };

function makeWorkspace(scope: "live" | "branch" = "branch") {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "document-domain-"));
  const workspace = path.join(dataDir, "projects", "p1", "workspace");
  fs.mkdirSync(path.join(workspace, "knowledge"), { recursive: true });
  fs.writeFileSync(path.join(workspace, ".workspace.json"), JSON.stringify({ scope, status: "active" }));
  fs.writeFileSync(path.join(workspace, "knowledge", "manifest.json"), JSON.stringify({ version: 1, items: [] }));
  return { dataDir, workspace };
}

describe("DocumentApplicationService", () => {
  it("uses projectId + documentId while keeping storage details internal", async () => {
    const { dataDir, workspace } = makeWorkspace();
    try {
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({ dataDir }));
      const created = await app.create({ projectId: "p1", title: "Rules", content: "# Rules", actor });
      expect(created.snapshot).toMatchObject({ projectId: "p1", title: "Rules", content: "# Rules", source: "user" });
      expect(created.snapshot).not.toHaveProperty("storageFileName");
      expect(created.snapshot).not.toHaveProperty("fileName");
      const listed = await app.list("p1", actor);
      expect(listed.items).toHaveLength(1);
      expect(listed.items[0]).not.toHaveProperty("content");
      expect(listed.issues).toEqual([]);
      const updated = await app.update({ locator: { projectId: "p1", documentId: created.snapshot.documentId }, content: "# Updated", actor });
      expect(updated.snapshot.content).toBe("# Updated");
      expect(fs.readFileSync(path.join(workspace, "knowledge", "Rules.md"), "utf8")).toBe("# Updated");
      await app.remove({ locator: { projectId: "p1", documentId: created.snapshot.documentId }, actor });
      await expect(app.get({ projectId: "p1", documentId: created.snapshot.documentId }, actor)).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("lists healthy documents when another manifest entry has no source file", async () => {
    const { dataDir, workspace } = makeWorkspace();
    try {
      fs.writeFileSync(path.join(workspace, "knowledge", "healthy.md"), "# Healthy");
      fs.writeFileSync(path.join(workspace, "knowledge", "manifest.json"), JSON.stringify({
        version: 1,
        items: [
          { id: "missing", title: "Missing", source: "user", fileName: "missing.md" },
          { id: "healthy", title: "Healthy", source: "user", fileName: "healthy.md" },
        ],
      }));
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({ dataDir }));

      const listed = await app.list("p1", actor);

      expect(listed.items).toEqual([expect.objectContaining({ documentId: "healthy", title: "Healthy" })]);
      expect(listed.issues).toEqual([expect.objectContaining({ code: "source_missing", documentId: "missing", title: "Missing", repairable: true })]);
      await expect(app.get({ projectId: "p1", documentId: "missing" }, actor)).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("removes a manifest-only orphan through the Authority without inventing source content", async () => {
    const { dataDir, workspace } = makeWorkspace("live");
    const commits: Array<{ operations: Array<{ type: string; path: string }> }> = [];
    try {
      fs.writeFileSync(path.join(workspace, "knowledge", "manifest.json"), JSON.stringify({
        version: 1,
        items: [{ id: "missing", title: "Missing", source: "user", fileName: "missing.md" }],
      }));
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({
        dataDir,
        authority: {
          async commit(input) {
            commits.push(input as typeof commits[number]);
            return { revision: 2, rootHash: "root-2" };
          },
        },
      }));

      const deleted = await app.remove({
        locator: { projectId: "p1", documentId: "missing" },
        actor,
        workspaceId: "w1",
        sessionId: "s1",
      });

      expect(deleted.deleted).toMatchObject({ documentId: "missing", title: "Missing", sourceState: "missing" });
      expect(deleted.authority).toEqual({ revision: 2, rootHash: "root-2" });
      expect(commits[0]?.operations).toEqual([expect.objectContaining({ type: "put_text", path: "knowledge/manifest.json" })]);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("rejects readonly actors and system documents", async () => {
    const { dataDir, workspace } = makeWorkspace();
    try {
      const manifest = { version: 1, items: [{ id: "sys", title: "System", source: "system", description: "System", fileName: "system.md", readonly: true }] };
      fs.writeFileSync(path.join(workspace, "knowledge", "manifest.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(workspace, "knowledge", "system.md"), "system");
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({ dataDir }));
      await expect(app.create({ projectId: "p1", title: "Nope", content: "x", actor: { ...actor, role: "readonly" } })).rejects.toMatchObject({ code: "DOCUMENT_FORBIDDEN" });
      await expect(app.update({ locator: { projectId: "p1", documentId: "sys" }, content: "x", actor })).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("routes live writes through the Authority port", async () => {
    const { dataDir } = makeWorkspace("live");
    const commits: unknown[] = [];
    try {
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({ dataDir, authority: { async commit(input) { commits.push(input); return { revision: 1, rootHash: "root" }; } } }));
      const result = await app.create({ projectId: "p1", title: "Live", content: "live", actor, workspaceId: "w1", sessionId: "s1" });
      expect(result.snapshot.documentId).toMatch(/^kb_/);
      expect(result.authority).toEqual({ revision: 1, rootHash: "root" });
      expect(commits).toHaveLength(1);
      expect(commits[0]).toMatchObject({ projectId: "p1", workspaceId: "w1", sessionId: "s1", reason: "create_document" });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("保留 live Workspace 缺失备份错误及资源诊断详情", async () => {
    const { dataDir } = makeWorkspace("live");
    try {
      const authorityError = Object.assign(
        new Error("Committed Workspace backup is missing or untrusted"),
        {
          code: "WORKSPACE_AUTHORITY_BACKUP_MISSING",
          details: { path: "knowledge/Rules.md", hash: "missing-hash" },
        },
      );
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({
        dataDir,
        authority: { async commit() { throw authorityError; } },
      }));

      await expect(app.create({ projectId: "p1", title: "Rules", content: "# Rules", actor, workspaceId: "w1", sessionId: "s1" }))
        .rejects.toMatchObject({
          code: "DOCUMENT_AUTHORITY_BACKUP_MISSING",
          details: { path: "knowledge/Rules.md", hash: "missing-hash" },
          message: "Committed Workspace backup is missing or untrusted",
        });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("fails closed when a live write has no Authority session", async () => {
    const { dataDir } = makeWorkspace("live");
    try {
      const app = new DocumentApplicationService(new WorkspaceDocumentRepository({ dataDir }));
      await expect(app.create({ projectId: "p1", title: "Live", content: "live", actor })).rejects.toBeInstanceOf(DocumentApplicationError);
      await expect(app.create({ projectId: "p1", title: "Live", content: "live", actor })).rejects.toMatchObject({ code: "DOCUMENT_AUTHORITY_NOT_READY" });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("maps document history to the existing ResourceVersion axis", async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "document-version-"));
    try {
      const projectService = new ProjectAdminService({ dataDir });
      const project = projectService.createProject({ name: "Versioned" });
      const projectId = project.data?.id ?? "";
      const app = new DocumentApplicationService(
        new WorkspaceDocumentRepository({ dataDir }),
        new ResourceVersionDocumentAdapter(projectService),
      );
      const created = await app.create({ projectId, title: "History", content: "v1", actor: { ...actor, allowedProjectIds: [projectId] } });
      const revisions = await app.listRevisions({ projectId, documentId: created.snapshot.documentId }, { ...actor, allowedProjectIds: [projectId] });
      expect(revisions).toHaveLength(1);
      expect(revisions[0]).toMatchObject({ documentId: created.snapshot.documentId, source: "user" });
      const revision = await app.getRevision({ projectId, documentId: created.snapshot.documentId }, revisions[0].id, { ...actor, allowedProjectIds: [projectId] });
      expect(revision.content).toBe("v1");
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
