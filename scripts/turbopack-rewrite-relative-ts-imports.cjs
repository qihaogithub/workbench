const path = require("node:path");

const fs = require("node:fs");

const WORKSPACE_SOURCE_SEGMENT = `${path.sep}packages${path.sep}`;
const SOURCE_DIRECTORY_SEGMENT = `${path.sep}src${path.sep}`;

function isWorkspaceSourceModule(resourcePath) {
  const normalized = path.normalize(resourcePath || "");
  return (
    normalized.includes(WORKSPACE_SOURCE_SEGMENT) &&
    normalized.includes(SOURCE_DIRECTORY_SEGMENT)
  );
}

function resolveTypeScriptSource(resourcePath, relativePath) {
  const sourcePath = path.resolve(path.dirname(resourcePath), relativePath);
  for (const extension of [".ts", ".tsx"]) {
    if (fs.existsSync(`${sourcePath}${extension}`)) {
      return `${relativePath}${extension}`;
    }
  }
  return null;
}

/**
 * NodeNext source packages keep explicit `.js` specifiers so their emitted ESM
 * can run in Node. Turbopack resolves workspace source directly, where the
 * corresponding files are `.ts`; rewrite only resolvable workspace source
 * specifiers in Turbopack's in-memory pipeline rather than changing the
 * published Node ESM contract.
 */
module.exports = function rewriteRelativeTsImports(source) {
  if (!isWorkspaceSourceModule(this.resourcePath)) return source;

  return source.replace(
    /\b(from|import)(\s*\(?\s*["'])((?:\.\.?\/)[^"']+)\.js(["'])/g,
    (match, keyword, prefix, relativePath, suffixQuote) => {
      const sourceSpecifier = resolveTypeScriptSource(
        this.resourcePath,
        relativePath,
      );
      return sourceSpecifier
        ? `${keyword}${prefix}${sourceSpecifier}${suffixQuote}`
        : match;
    },
  );
};

module.exports.isWorkspaceSourceModule = isWorkspaceSourceModule;
module.exports.resolveTypeScriptSource = resolveTypeScriptSource;
