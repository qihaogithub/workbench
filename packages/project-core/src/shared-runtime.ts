/**
 * `@workbench/shared` is consumed by both bundlers and Node ESM packages.
 * The package remains CommonJS-compatible for the former, so Node's ESM
 * namespace import exposes its exports through `default`. Bundlers expose
 * the same symbols directly. Unwrap both shapes in one Node-only adapter.
 */
import * as sharedModule from "@workbench/shared";
import * as pageRequirementsModule from "@workbench/shared/demo/page-requirements";
import * as configRuntimeModule from "@workbench/shared/demo/config-runtime-compatibility";
import * as configSchemaFieldsModule from "@workbench/shared/demo/config-schema-fields";
import * as markdownReferenceModule from "@workbench/shared/markdown-reference";
import * as workspacePathModule from "@workbench/shared/workspace-path";

function unwrap<T extends object>(module: T): T {
  const defaultExport = (module as T & { default?: unknown }).default;
  return (
    defaultExport && typeof defaultExport === "object" ? defaultExport : module
  ) as T;
}

const shared = unwrap(sharedModule) as typeof import("@workbench/shared");
const pageRequirements = unwrap(
  pageRequirementsModule,
) as typeof import("@workbench/shared/demo/page-requirements");
const configRuntime = unwrap(
  configRuntimeModule,
) as typeof import("@workbench/shared/demo/config-runtime-compatibility");
const configSchemaFields = unwrap(
  configSchemaFieldsModule,
) as typeof import("@workbench/shared/demo/config-schema-fields");
const markdownReference = unwrap(
  markdownReferenceModule,
) as typeof import("@workbench/shared/markdown-reference");
const workspacePath = unwrap(
  workspacePathModule,
) as typeof import("@workbench/shared/workspace-path");

export const {
  WHITEBOARD_DOCUMENT_MAX_BYTES,
  applyPagePresentationToSchema,
  isWhiteboardBinding,
  isWhiteboardDocument,
  parseVisibilityRules,
  recommendHtmlImportPresentation,
} = shared;

export const { parsePageRequirementsRefs } = pageRequirements;
export const { checkConfigSchemaAgainstPrototype } = configRuntime;
export const { enumerateSchemaFields } = configSchemaFields;
export const {
  encodeMarkdownReferenceUri,
  MARKDOWN_REFERENCE_INDEX_VERSION,
  parseMarkdownReferences,
} = markdownReference;
export const { validateWorkspacePathSegment } = workspacePath;
