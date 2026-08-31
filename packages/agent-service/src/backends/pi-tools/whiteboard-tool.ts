import fs from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import {
  asWhiteboardDocumentV2,
  getWhiteboardDocumentRevision,
  isWhiteboardDocument,
  whiteboardDocumentPath,
  type WhiteboardDocumentV2,
} from "@workbench/shared";
import {
  applyWhiteboardActions,
  WHITEBOARD_ACTION_SCHEMA_VERSION,
  WHITEBOARD_CONTEXT_SCHEMA_VERSION,
  WHITEBOARD_PLAN_SCHEMA_VERSION,
  getWhiteboardSelection,
  parseWhiteboardCode,
  serializeWhiteboardCode,
  validateWhiteboardDocument,
  type WhiteboardAction,
  type WhiteboardContext,
  type WhiteboardPlan,
} from "@workbench/whiteboard-core";
import type { AgentConfig } from "../../core/types";
import { DEFAULT_WORKSPACE_PERMISSIONS, isPathAllowed } from "./permissions";
import { createGenerateImageTool } from "./generate-image-tool";

type WhiteboardPermissionHandler = (toolCallId: string, request: { title: string; summary?: string; planId?: string }) => Promise<boolean>;

const WhiteboardId = Type.String({ pattern: "^[A-Za-z0-9_-]{1,80}$" });
const SemanticRole = Type.Union(["background", "subject", "logo", "decor", "title", "subtitle", "label"].map((role) => Type.Literal(role)));
const StylePatch = Type.Object({
  fill: Type.Optional(Type.String()),
  stroke: Type.Optional(Type.String()),
  strokeWidth: Type.Optional(Type.Number({ minimum: 0 })),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  radius: Type.Optional(Type.Number({ minimum: 0 })),
  fontSize: Type.Optional(Type.Number({ minimum: 1 })),
  fontWeight: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  textAlign: Type.Optional(Type.Union(["left", "center", "right"].map((value) => Type.Literal(value)))),
  color: Type.Optional(Type.String()),
  imageFit: Type.Optional(Type.Union(["cover", "contain", "fill"].map((value) => Type.Literal(value)))),
}, { additionalProperties: false });
const NodePatch = Type.Object({
  x: Type.Optional(Type.Number()),
  y: Type.Optional(Type.Number()),
  width: Type.Optional(Type.Number({ minimum: 0 })),
  height: Type.Optional(Type.Number({ minimum: 0 })),
  text: Type.Optional(Type.String()),
  rotation: Type.Optional(Type.Number()),
  style: Type.Optional(StylePatch),
}, { additionalProperties: false });
const WhiteboardActionSchema = Type.Union([
  Type.Object({ type: Type.Literal("updateNode"), nodeId: Type.String(), patch: NodePatch }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("updateRole"), nodeId: Type.String(), role: Type.Optional(SemanticRole) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("placeAsset"), nodeId: Type.String(), assetId: Type.String(), src: Type.String() }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("setImageFit"), nodeId: Type.String(), fit: Type.Union([Type.Literal("cover"), Type.Literal("contain"), Type.Literal("fill")]) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("removeNode"), nodeId: Type.String() }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("addText"), nodeId: Type.Optional(Type.String()), text: Type.String(), x: Type.Number(), y: Type.Number(), width: Type.Number(), height: Type.Number(), role: Type.Optional(SemanticRole) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("align"), nodeIds: Type.Array(Type.String()), axis: Type.Union(["left", "center", "right", "top", "middle", "bottom"].map((axis) => Type.Literal(axis))) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal("distribute"), nodeIds: Type.Array(Type.String()), axis: Type.Union([Type.Literal("horizontal"), Type.Literal("vertical")]) }, { additionalProperties: false }),
]);
const NodeIds = Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 80 }), { maxItems: 100 }));
const ReadWhiteboardParams = Type.Object({ whiteboardId: WhiteboardId, nodeIds: NodeIds }, { additionalProperties: false });
const ApplyWhiteboardParams = Type.Object({
  whiteboardId: WhiteboardId,
  actions: Type.Array(WhiteboardActionSchema, { description: "WhiteboardAction array" }),
  baseDocumentRevision: Type.Integer({ minimum: 0, description: "Revision read immediately before this dry-run or write." }),
  dryRun: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
const SerializeWhiteboardParams = Type.Object({ whiteboardId: WhiteboardId }, { additionalProperties: false });
const ImportWhiteboardParams = Type.Object({
  whiteboardId: WhiteboardId,
  html: Type.String(),
  css: Type.Optional(Type.String()),
  baseDocumentRevision: Type.Integer({ minimum: 0, description: "Revision read immediately before this dry-run or write." }),
  dryRun: Type.Optional(Type.Boolean()),
}, { additionalProperties: false });
const PlanWhiteboardParams = Type.Object({
  whiteboardId: WhiteboardId,
  intent: Type.String({ minLength: 1, maxLength: 2000 }),
  nodeIds: NodeIds,
}, { additionalProperties: false });
const GenerateWhiteboardAssetParams = Type.Object({
  whiteboardId: Type.Optional(WhiteboardId),
  prompt: Type.String({ minLength: 1, maxLength: 1000 }),
  filename: Type.String({ minLength: 1 }),
  size: Type.Optional(Type.Union(["1024x1024", "1024x1792", "1792x1024"].map((size) => Type.Literal(size)))),
  n: Type.Optional(Type.Number({ minimum: 1, maximum: 4 })),
}, { additionalProperties: false });

type ReadWhiteboardParams = Static<typeof ReadWhiteboardParams>;
type ApplyWhiteboardParams = Static<typeof ApplyWhiteboardParams>;
type SerializeWhiteboardParams = Static<typeof SerializeWhiteboardParams>;
type ImportWhiteboardParams = Static<typeof ImportWhiteboardParams>;
type PlanWhiteboardParams = Static<typeof PlanWhiteboardParams>;
type GenerateWhiteboardAssetParams = Static<typeof GenerateWhiteboardAssetParams>;

const UndoWhiteboardEditParams = Type.Object({
  whiteboardId: WhiteboardId,
  baseDocumentRevision: Type.Integer({ minimum: 0 }),
}, { additionalProperties: false });
type UndoWhiteboardEditParams = Static<typeof UndoWhiteboardEditParams>;

interface WhiteboardCandidateAsset {
  assetId: string;
  src: string;
  width?: number;
  height?: number;
  whiteboardId?: string;
  lifecycle: "candidate";
  createdAt: number;
}
const whiteboardCandidateAssets = new Map<string, WhiteboardCandidateAsset>();
const WHITEBOARD_CANDIDATE_TTL_MS = 30 * 60_000;

function pruneCandidateAssets(): void {
  const expiresBefore = Date.now() - WHITEBOARD_CANDIDATE_TTL_MS;
  for (const [assetId, candidate] of whiteboardCandidateAssets) {
    if (candidate.createdAt < expiresBefore) whiteboardCandidateAssets.delete(assetId);
  }
}

function isSafeManagedAssetSource(assetId: string, src: string): boolean {
  return src === `/api/images/${assetId}`
    || src === `assets/${assetId}`
    || src === `/assets/${assetId}`
    || /^\/api\/sessions\/[A-Za-z0-9_-]{1,80}\/workspace\/assets\/[A-Za-z0-9._/-]+$/.test(src);
}

function candidateKey(config: AgentConfig, whiteboardId: string | undefined, assetId: string): string {
  return `${path.resolve(config.workingDir || ".")}::${config.sessionId ?? ""}::${whiteboardId ?? ""}::${assetId}`;
}

function validatePlaceAssetCandidates(config: AgentConfig, whiteboardId: string, actions: readonly WhiteboardAction[], document: WhiteboardDocumentV2): string | null {
  pruneCandidateAssets();
  for (const action of actions) {
    if (action.type !== "placeAsset") continue;
    const candidate = whiteboardCandidateAssets.get(candidateKey(config, whiteboardId, action.assetId));
    if (candidate) {
      if (candidate.src !== action.src) return `asset ${action.assetId} does not match the generated candidate source`;
      continue;
    }
    const alreadyAttached = Object.values(document.nodeSemantics).some((semantics) => semantics.assetRef === action.assetId);
    if (!alreadyAttached || !isSafeManagedAssetSource(action.assetId, action.src)) return `asset ${action.assetId} is not a confirmed managed asset candidate`;
  }
  return null;
}

function undoKey(config: AgentConfig, whiteboardId: string): string {
  return `${path.resolve(config.workingDir || ".")}::${whiteboardId}`;
}

function relativeDocumentPath(whiteboardId: string): string {
  return whiteboardDocumentPath(whiteboardId);
}

function absoluteDocumentPath(config: AgentConfig, whiteboardId: string): string {
  return path.join(config.workingDir || ".", relativeDocumentPath(whiteboardId));
}

function canAccess(config: AgentConfig, whiteboardId: string): boolean {
  return isPathAllowed(
    relativeDocumentPath(whiteboardId),
    config.workingDir || "",
    config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS,
  );
}

async function readDocument(config: AgentConfig, whiteboardId: string): Promise<WhiteboardDocumentV2> {
  const raw = JSON.parse(await fs.promises.readFile(absoluteDocumentPath(config, whiteboardId), "utf8")) as unknown;
  if (!isWhiteboardDocument(raw)) throw new Error("Invalid whiteboard document");
  const document = asWhiteboardDocumentV2(raw);
  const validation = validateWhiteboardDocument(document);
  if (!validation.valid) throw new Error(validation.diagnostics.map((item) => item.message).join("; "));
  return document;
}

function denied(whiteboardId: string) {
  return {
    content: [{ type: "text" as const, text: `Error: whiteboard "${whiteboardId}" is not allowed by workspace permissions` }],
    details: { whiteboardId, error: "permission denied" },
    isError: true,
  };
}

function failure(whiteboardId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    details: { whiteboardId, error: message },
    isError: true,
  };
}

export function createReadWhiteboardContextTool(config: AgentConfig): AgentTool<typeof ReadWhiteboardParams> {
  return {
    name: "readWhiteboardContext",
    label: "Read Whiteboard Context",
    description: "Read a durable whiteboard document and its semantic node context without changing bindings or config values.",
    parameters: ReadWhiteboardParams,
    execute: async (_toolCallId: string, args: ReadWhiteboardParams) => {
      if (!canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      try {
        const document = await readDocument(config, args.whiteboardId);
        const context: WhiteboardContext = {
          schemaVersion: WHITEBOARD_CONTEXT_SCHEMA_VERSION,
          whiteboardId: document.id,
          documentRevision: document.documentRevision,
          pageSize: document.scene.pageSize,
          ...(document.safeArea ? { safeArea: document.safeArea } : {}),
          nodeSemantics: document.nodeSemantics,
          nodes: document.scene.nodes,
          ...(args.nodeIds ? { selection: getWhiteboardSelection(document, args.nodeIds) } : {}),
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(context, null, 2) }],
          details: { whiteboardId: args.whiteboardId, document, context },
        };
      } catch (error) {
        return failure(args.whiteboardId, error);
      }
    },
  };
}

export function createApplyWhiteboardActionsTool(config: AgentConfig, _permissionHandler?: WhiteboardPermissionHandler): AgentTool<typeof ApplyWhiteboardParams> {
  return {
    name: "applyWhiteboardActions",
    label: "Apply Whiteboard Actions",
    description: "Validate semantic whiteboard actions and return a private draft proposal. A host WhiteboardCommit must render and atomically commit the proposal with its PNG, binding and config value.",
    parameters: ApplyWhiteboardParams,
    execute: async (_toolCallId: string, args: ApplyWhiteboardParams) => {
      if (!canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      try {
        const document = await readDocument(config, args.whiteboardId);
        if (args.baseDocumentRevision !== document.documentRevision) {
          return {
            content: [{ type: "text" as const, text: "Error: whiteboard document revision has changed; reload before applying actions." }],
            details: { whiteboardId: args.whiteboardId, currentDocumentRevision: document.documentRevision },
            isError: true,
          };
        }
        if (args.actions.length === 0) {
          return { content: [{ type: "text" as const, text: "No whiteboard actions to apply." }], details: { whiteboardId: args.whiteboardId, document, dryRun: args.dryRun ?? false } };
        }
        const result = applyWhiteboardActions(document, args.actions as WhiteboardAction[]);
        if (!result.value) return { content: [{ type: "text" as const, text: result.diagnostics.map((item) => item.message).join("; ") }], details: { whiteboardId: args.whiteboardId, diagnostics: result.diagnostics }, isError: true };
        const candidateError = validatePlaceAssetCandidates(config, args.whiteboardId, args.actions as WhiteboardAction[], document);
        if (candidateError) return { content: [{ type: "text" as const, text: `Error: ${candidateError}` }], details: { whiteboardId: args.whiteboardId, error: "asset_candidate_required" }, isError: true };
        const nextDocument = result.value;
        return {
          content: [{ type: "text" as const, text: `Proposed ${args.actions.length} whiteboard action(s). The host must commit this draft with a matching PNG before it becomes durable.` }],
          details: { whiteboardId: args.whiteboardId, draft: nextDocument, requiresHostCommit: true, dryRun: true },
        };
      } catch (error) {
        return failure(args.whiteboardId, error);
      }
    },
  };
}

export function createSerializeWhiteboardCodeTool(config: AgentConfig): AgentTool<typeof SerializeWhiteboardParams> {
  return {
    name: "serializeWhiteboardCode",
    label: "Serialize Whiteboard Code",
    description: "Export a durable whiteboard document to the constrained HTML/CSS bridge format.",
    parameters: SerializeWhiteboardParams,
    execute: async (_toolCallId: string, args: SerializeWhiteboardParams) => {
      if (!canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      try {
        const document = await readDocument(config, args.whiteboardId);
        const result = serializeWhiteboardCode(document);
        if (!result.value) return { content: [{ type: "text" as const, text: result.diagnostics.map((item) => item.message).join("; ") }], details: { whiteboardId: args.whiteboardId, diagnostics: result.diagnostics }, isError: true };
        return { content: [{ type: "text" as const, text: JSON.stringify(result.value, null, 2) }], details: { whiteboardId: args.whiteboardId, code: result.value } };
      } catch (error) {
        return failure(args.whiteboardId, error);
      }
    },
  };
}

export function createImportWhiteboardCodeTool(config: AgentConfig, _permissionHandler?: WhiteboardPermissionHandler): AgentTool<typeof ImportWhiteboardParams> {
  return {
    name: "importWhiteboardCode",
    label: "Import Whiteboard Code",
    description: "Parse constrained HTML/CSS bridge code into a private draft proposal. A host WhiteboardCommit must render and atomically commit it with its PNG, binding and config value.",
    parameters: ImportWhiteboardParams,
    execute: async (_toolCallId: string, args: ImportWhiteboardParams) => {
      if (!canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      try {
        const current = await readDocument(config, args.whiteboardId);
        if (args.baseDocumentRevision !== current.documentRevision) {
          return { content: [{ type: "text" as const, text: "Error: whiteboard document revision has changed; reload before importing code." }], details: { whiteboardId: args.whiteboardId, currentDocumentRevision: current.documentRevision }, isError: true };
        }
        const parsed = parseWhiteboardCode(args.html, args.css ?? "", { id: current.id });
        if (!parsed.value) return { content: [{ type: "text" as const, text: parsed.diagnostics.map((item) => `${item.code}: ${item.message}`).join("\n") }], details: { whiteboardId: args.whiteboardId, diagnostics: parsed.diagnostics }, isError: true };
        const nextDocument: WhiteboardDocumentV2 = { ...parsed.value, documentRevision: current.documentRevision + 1, updatedAt: Date.now() };
        return { content: [{ type: "text" as const, text: "Parsed whiteboard code into a draft. The host must commit this draft with a matching PNG before it becomes durable." }], details: { whiteboardId: args.whiteboardId, draft: nextDocument, requiresHostCommit: true, dryRun: true } };
      } catch (error) {
        return failure(args.whiteboardId, error);
      }
    },
  };
}

export function createUndoWhiteboardEditTool(config: AgentConfig, permissionHandler?: WhiteboardPermissionHandler): AgentTool<typeof UndoWhiteboardEditParams> {
  return {
    name: "undoWhiteboardEdit",
    label: "Undo Whiteboard Edit",
    description: "Undo the most recent confirmed AI whiteboard edit as a new document revision. The operation never changes bindings or configuration values.",
    parameters: UndoWhiteboardEditParams,
    execute: async (_toolCallId: string, args: UndoWhiteboardEditParams) => {
      if (!canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      void permissionHandler;
      void _toolCallId;
      return {
        content: [{ type: "text" as const, text: "Error: whiteboard undo is owned by the host draft until a complete PNG/binding/config commit exists." }],
        details: { whiteboardId: args.whiteboardId, error: "host_draft_required" },
        isError: true,
      };
    },
  };
}

export function createPlanWhiteboardCompositionTool(config: AgentConfig): AgentTool<typeof PlanWhiteboardParams> {
  return {
    name: "planWhiteboardComposition",
    label: "Plan Whiteboard Composition",
    description: "Create a read-only, auditable whiteboard action plan. Planning never changes the document, binding, or configuration.",
    parameters: PlanWhiteboardParams,
    execute: async (_toolCallId: string, args: PlanWhiteboardParams) => {
      if (!canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      try {
        const document = await readDocument(config, args.whiteboardId);
        const selection = getWhiteboardSelection(document, args.nodeIds ?? []);
        const selectedNodeIds = selection.nodeIds;
        const plan: WhiteboardPlan = {
          schemaVersion: WHITEBOARD_PLAN_SCHEMA_VERSION,
          actionSchemaVersion: WHITEBOARD_ACTION_SCHEMA_VERSION,
          intent: args.intent,
          baseDocumentRevision: document.documentRevision,
          selectedNodeIds,
          selection,
          ...(document.safeArea ? { safeArea: document.safeArea } : {}),
          constraints: { bridgeProfile: "html-css-v1", safeAreaEnforced: Boolean(document.safeArea), coordinateSpace: "page-px" },
          suggestedActionTypes: ["updateNode", "updateRole", "addText", "placeAsset", "setImageFit", "align", "distribute", "removeNode"],
          requiresConfirmation: true,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(plan, null, 2) }],
          details: { whiteboardId: args.whiteboardId, documentRevision: document.documentRevision, selectedNodeIds, plan },
        };
      } catch (error) {
        return failure(args.whiteboardId, error);
      }
    },
  };
}

export function createGenerateWhiteboardAssetTool(config: AgentConfig): AgentTool<typeof GenerateWhiteboardAssetParams> {
  return {
    name: "generateWhiteboardAsset",
    label: "Generate Whiteboard Asset",
    description: "Generate an image candidate for a whiteboard. The managed asset id and dimensions are returned, but the candidate is never attached to a node or configuration automatically.",
    parameters: GenerateWhiteboardAssetParams,
    execute: async (toolCallId: string, args: GenerateWhiteboardAssetParams, signal?: AbortSignal) => {
      if (args.whiteboardId && !canAccess(config, args.whiteboardId)) return denied(args.whiteboardId);
      const result = await createGenerateImageTool(config).execute(toolCallId, {
        prompt: args.prompt,
        filename: args.filename,
        ...(args.size ? { size: args.size } : {}),
        ...(args.n ? { n: args.n } : {}),
      }, signal);
      if ("isError" in result && result.isError) return result;
      const details = result.details && typeof result.details === "object" ? result.details as Record<string, unknown> : {};
      const candidates = (Array.isArray(details.results)
        ? details.results.map((candidate) => ({ ...(candidate as Record<string, unknown>), lifecycle: "candidate" as const }))
        : []) as Array<Record<string, unknown> & { lifecycle: "candidate" }>;
      for (const candidate of candidates) {
        if (typeof candidate.imageId !== "string" || typeof candidate.url !== "string") continue;
        whiteboardCandidateAssets.set(candidateKey(config, args.whiteboardId, candidate.imageId), {
          assetId: candidate.imageId,
          src: candidate.url,
          ...(args.whiteboardId ? { whiteboardId: args.whiteboardId } : {}),
          lifecycle: "candidate",
          ...(typeof candidate.width === "number" ? { width: candidate.width } : {}),
          ...(typeof candidate.height === "number" ? { height: candidate.height } : {}),
          createdAt: Date.now(),
        });
      }
      return {
        ...result,
        content: [{ type: "text" as const, text: candidates.length ? `Generated ${candidates.length} whiteboard asset candidate(s). Confirm and place one with placeAsset before editing the document.` : "Generated whiteboard asset candidate." }],
        details: { ...details, whiteboardId: args.whiteboardId, lifecycle: "candidate", candidates },
      };
    },
  };
}
