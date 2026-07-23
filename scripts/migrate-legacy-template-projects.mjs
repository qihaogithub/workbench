#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const removeLegacy = args.has("--remove-legacy");
const dataArgIndex = process.argv.indexOf("--data-dir");
const dataDir = path.resolve(
  dataArgIndex >= 0 && process.argv[dataArgIndex + 1]
    ? process.argv[dataArgIndex + 1]
    : process.env.DATA_DIR ?? "data",
);
const templatesDir = path.join(dataDir, "templates");
const projectsDir = path.join(dataDir, "projects");

if (!fs.existsSync(templatesDir)) {
  console.log(
    JSON.stringify({ ok: true, applied: apply, migrated: [], message: "没有旧模板目录" }),
  );
  process.exit(0);
}

const migrated = [];
for (const entry of fs.readdirSync(templatesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const legacyDir = path.join(templatesDir, entry.name);
  const meta = readJson(path.join(legacyDir, "template.json"));
  if (!meta || typeof meta.name !== "string") continue;

  const sourceProjectId =
    typeof meta.sourceProjectId === "string" && meta.sourceProjectId
      ? meta.sourceProjectId
      : null;
  const sourceProjectDir = sourceProjectId
    ? path.join(projectsDir, sourceProjectId)
    : null;
  const useSource = sourceProjectDir && fs.existsSync(sourceProjectDir);
  const projectId = useSource
    ? sourceProjectId
    : `proj_migrated_${entry.name.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const projectDir = path.join(projectsDir, projectId);
  const workspaceDir = path.join(projectDir, "workspace");

  migrated.push({
    legacyTemplateId: entry.name,
    projectId,
    action: useSource ? "mark-source-project" : "create-project",
  });
  if (!apply) continue;

  fs.mkdirSync(projectsDir, { recursive: true });
  if (!useSource) {
    if (fs.existsSync(projectDir)) {
      throw new Error(`目标项目已存在: ${projectId}`);
    }
    fs.mkdirSync(projectDir, { recursive: true });
    fs.cpSync(path.join(legacyDir, "workspace"), workspaceDir, {
      recursive: true,
      force: false,
    });
  }
  const projectJsonPath = path.join(projectDir, "project.json");
  const current = readJson(projectJsonPath) ?? {};
  const now = Date.now();
  const project = {
    ...current,
    id: projectId,
    name: meta.name,
    category: meta.category,
    description:
      typeof current.description === "string" ? current.description : undefined,
    projectType: "template",
    templateSettings: {
      description:
        typeof meta.description === "string" ? meta.description : "",
      scope:
        meta.scope === "personal" || meta.scope === "official"
          ? meta.scope
          : "team",
      official: meta.official === true,
    },
    workspacePath: workspaceDir,
    demoPages: Array.isArray(current.demoPages)
      ? current.demoPages
      : Array.isArray(meta.demoPages)
        ? meta.demoPages
        : [],
    demoFolders: Array.isArray(current.demoFolders) ? current.demoFolders : [],
    versions: Array.isArray(current.versions) ? current.versions : [],
    createdAt:
      typeof current.createdAt === "number"
        ? current.createdAt
        : typeof meta.createdAt === "number"
          ? meta.createdAt
          : now,
    updatedAt: now,
    thumbnail:
      typeof meta.thumbnail === "string" ? meta.thumbnail : current.thumbnail,
  };
  writeJson(projectJsonPath, project);
  if (removeLegacy) {
    fs.rmSync(legacyDir, { recursive: true, force: true });
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      applied: apply,
      removedLegacy: apply && removeLegacy,
      dataDir,
      migrated,
    },
    null,
    2,
  ),
);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
}
