/**
 * `@workbench/shared` remains CommonJS-compatible for bundler consumers.
 * NodeNext/tsx exposes the CommonJS re-exports through `default`, while
 * bundlers may expose them directly.  Keep the runtime boundary in one place
 * so Node services do not rely on Node's incomplete CJS named-export scan.
 */
import * as sharedModule from "@workbench/shared";
import * as markdownReferenceModule from "@workbench/shared/markdown-reference";

function unwrap<T extends object>(module: T): T {
  const defaultExport = (module as T & { default?: unknown }).default;
  return (
    defaultExport && typeof defaultExport === "object" ? defaultExport : module
  ) as T;
}

const shared = unwrap(sharedModule) as typeof import("@workbench/shared");
const markdownReference = unwrap(
  markdownReferenceModule,
) as typeof import("@workbench/shared/markdown-reference");

export const {
  canonicalInventoryJson,
  inventorySearchText,
  isInventoryEvidenceRef,
  isInventoryGeneratedSemantic,
  isInventorySnapshot,
  normalizeInventoryHuman,
  resolveInventorySemantic,
  PROJECT_INVENTORY_GENERATOR_VERSION,
  PROJECT_INVENTORY_SCHEMA_VERSION,
} = shared;

export const {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
} = markdownReference;
