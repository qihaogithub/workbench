#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const RESERVED_KEYS = new Set(["__order", "__orderH", "__positions"]);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function listFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, predicate));
    } else if (!predicate || predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function tryLoadTypeScript(root) {
  try {
    return require(path.join(root, "node_modules", "typescript"));
  } catch {
    try {
      return require("typescript");
    } catch {
      return null;
    }
  }
}

function validateTsx(root, files) {
  const ts = tryLoadTypeScript(root);
  if (!ts) {
    return ["typescript package not found; skipped TSX transpile validation"];
  }

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const result = ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
      fileName: file,
    });
    const diagnostics = result.diagnostics || [];
    if (diagnostics.length > 0) {
      const message = diagnostics
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        )
        .join("\n");
      throw new Error(`${file} failed TSX transpilation:\n${message}`);
    }
  }

  return [];
}

function main() {
  const projectArg = process.argv[2];
  if (!projectArg) {
    throw new Error("Usage: validate-migrated-project.mjs <projectId|projectPath>");
  }

  const root = process.cwd();
  const projectPath = path.isAbsolute(projectArg)
    ? projectArg
    : path.join(root, "data", "projects", projectArg);
  const workspacePath = path.join(projectPath, "workspace");
  const projectSchemaPath = path.join(workspacePath, "project.config.schema.json");
  const demosPath = path.join(workspacePath, "demos");

  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path not found: ${projectPath}`);
  }
  if (!fs.existsSync(workspacePath)) {
    throw new Error(`Workspace path not found: ${workspacePath}`);
  }

  const projectSchema = fs.existsSync(projectSchemaPath)
    ? readJson(projectSchemaPath)
    : { properties: {} };
  const projectKeys = new Set(Object.keys(projectSchema.properties || {}));
  const pageSchemaFiles = listFiles(demosPath, (file) =>
    file.endsWith(`${path.sep}config.schema.json`),
  );
  const tsxFiles = listFiles(demosPath, (file) => file.endsWith(".tsx"));

  if (pageSchemaFiles.length === 0) {
    throw new Error(`No page config.schema.json files found under ${demosPath}`);
  }
  if (tsxFiles.length === 0) {
    throw new Error(`No TSX demo files found under ${demosPath}`);
  }

  for (const file of pageSchemaFiles) {
    const pageSchema = readJson(file);
    const pageKeys = Object.keys(pageSchema.properties || {});
    const conflicts = pageKeys.filter(
      (key) => projectKeys.has(key) && !RESERVED_KEYS.has(key),
    );
    if (conflicts.length > 0) {
      throw new Error(`${file} conflicts with project schema: ${conflicts.join(", ")}`);
    }
    const previewSize = pageSchema.$demo && pageSchema.$demo.previewSize;
    if (
      !previewSize ||
      typeof previewSize.width !== "number" ||
      typeof previewSize.height !== "number"
    ) {
      throw new Error(`${file} is missing numeric $demo.previewSize.width/height`);
    }
  }

  const warnings = validateTsx(root, tsxFiles);

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectPath,
        projectConfigFields: Array.from(projectKeys),
        pageSchemas: pageSchemaFiles.length,
        tsxFiles: tsxFiles.length,
        warnings,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
