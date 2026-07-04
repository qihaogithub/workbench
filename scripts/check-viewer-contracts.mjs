import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value, pathLabel) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${pathLabel} must be a non-empty string`);
  }
}

function expectNumber(value, pathLabel) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${pathLabel} must be a finite number`);
  }
}

function validateProjectsIndex(value, label) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  if (!Array.isArray(value.projects)) {
    errors.push(`${label}.projects must be an array`);
    return;
  }
  expectNumber(value.generatedAt, `${label}.generatedAt`);
  value.projects.forEach((project, index) => {
    const prefix = `${label}.projects[${index}]`;
    if (!isObject(project)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    expectString(project.id, `${prefix}.id`);
    expectString(project.name, `${prefix}.name`);
    expectNumber(project.publishedAt, `${prefix}.publishedAt`);
    expectString(project.publishedVersion, `${prefix}.publishedVersion`);
    expectNumber(project.demoCount, `${prefix}.demoCount`);
  });
}

function validatePublishedProject(value, label) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  expectString(value.id, `${label}.id`);
  expectString(value.name, `${label}.name`);
  expectString(value.publishedVersion, `${label}.publishedVersion`);
  expectNumber(value.publishedAt, `${label}.publishedAt`);
  if (!Array.isArray(value.demoPages)) {
    errors.push(`${label}.demoPages must be an array`);
    return;
  }
  if (!Array.isArray(value.demoFolders)) {
    errors.push(`${label}.demoFolders must be an array`);
  }
  value.demoPages.forEach((page, index) => {
    const prefix = `${label}.demoPages[${index}]`;
    if (!isObject(page)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    expectString(page.id, `${prefix}.id`);
    expectString(page.name, `${prefix}.name`);
    expectNumber(page.order, `${prefix}.order`);
    if (page.parentId !== null && typeof page.parentId !== "string") {
      errors.push(`${prefix}.parentId must be string or null`);
    }
    if (page.runtimeType === "prototype-html-css") {
      expectString(page.prototypeHtmlPath, `${prefix}.prototypeHtmlPath`);
      expectString(page.prototypeCssPath, `${prefix}.prototypeCssPath`);
      if (typeof page.prototypeHtmlPath === "string" && !page.prototypeHtmlPath.endsWith(".html")) {
        errors.push(`${prefix}.prototypeHtmlPath must point to an HTML artifact`);
      }
      if (typeof page.prototypeCssPath === "string" && !page.prototypeCssPath.endsWith(".css")) {
        errors.push(`${prefix}.prototypeCssPath must point to a CSS artifact`);
      }
    } else {
      expectString(page.compiledJsPath, `${prefix}.compiledJsPath`);
      if (typeof page.compiledJsPath === "string" && !page.compiledJsPath.endsWith(".js")) {
        errors.push(`${prefix}.compiledJsPath must point to a JavaScript artifact`);
      }
    }
    if (page.schemaPath !== undefined && typeof page.schemaPath !== "string") {
      errors.push(`${prefix}.schemaPath must be a string when present`);
    }
  });
}

const sampleIndex = {
  projects: [
    {
      id: "proj_contract",
      name: "契约样例",
      publishedAt: 1,
      publishedVersion: "v1",
      demoCount: 1,
    },
  ],
  generatedAt: 1,
};

const sampleProject = {
  id: "proj_contract",
  name: "契约样例",
  publishedVersion: "v1",
  publishedAt: 1,
  demoPages: [
    {
      id: "page_home",
      name: "首页",
      order: 0,
      parentId: null,
      compiledJsPath: "demos/page_home/compiled.js",
      schemaPath: "demos/page_home/schema.json",
    },
  ],
  demoFolders: [],
};

validateProjectsIndex(sampleIndex, "sample projects index");
validatePublishedProject(sampleProject, "sample published project");

const publishedDir = path.join(root, "data", "published");
if (fs.existsSync(publishedDir)) {
  const projectJsonPaths = [];
  for (const entry of fs.readdirSync(publishedDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const projectJson = path.join(publishedDir, entry.name, "project.json");
    if (fs.existsSync(projectJson)) projectJsonPaths.push(projectJson);
  }
  for (const projectJson of projectJsonPaths.slice(0, 20)) {
    try {
      validatePublishedProject(
        JSON.parse(fs.readFileSync(projectJson, "utf8")),
        path.relative(root, projectJson).replace(/\\/g, "/"),
      );
    } catch (error) {
      errors.push(`${path.relative(root, projectJson)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (projectJsonPaths.length > 20) {
    warnings.push(`Skipped ${projectJsonPaths.length - 20} published project contract file(s) after first 20.`);
  }
} else {
  warnings.push("data/published does not exist; only static viewer contract fixtures were checked.");
}

for (const warning of warnings) {
  console.warn(`[warn] ${warning}`);
}
for (const error of errors) {
  console.error(`[error] ${error}`);
}

if (errors.length > 0) {
  console.error(`viewer contract check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`viewer contract check passed with ${warnings.length} warning(s).`);
