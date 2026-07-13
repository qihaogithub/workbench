import * as fs from 'fs';
import crypto from 'crypto';
import * as path from 'path';
import { Type, type Static } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import {
  applySketchScenePatchOperations,
  bindSketchSceneConfigField,
  parseSketchSceneDocument,
  validateSketchSceneDocument,
  type SketchSceneDocument,
  type SketchSceneNode,
  type SketchScenePatchOperation,
} from '@workbench/sketch-core';
import type { AgentConfig } from '../../core/types';
import type { WorkspaceMutationReceipt } from '@workbench/shared/contracts';
import { logger } from '../../utils/logger';
import { DEFAULT_WORKSPACE_PERMISSIONS, isPathAllowed } from './permissions';
import { resolveLiveWorkspaceMutationContext } from '../../workspace/workspace-mutation-authority';

const ReadSketchSceneParams = Type.Object({
  pageId: Type.String({ description: 'Page id under demos/<pageId>' }),
});
type ReadSketchSceneParams = Static<typeof ReadSketchSceneParams>;

const PatchSketchSceneParams = Type.Object({
  pageId: Type.String({ description: 'Page id under demos/<pageId>' }),
  operations: Type.Array(Type.Any(), { description: 'SketchScenePatchOperation array' }),
  dryRun: Type.Optional(Type.Boolean()),
});
type PatchSketchSceneParams = Static<typeof PatchSketchSceneParams>;

const CreateSketchNodesParams = Type.Object({
  pageId: Type.String({ description: 'Page id under demos/<pageId>' }),
  nodes: Type.Array(Type.Any(), { description: 'SketchSceneNode array' }),
  dryRun: Type.Optional(Type.Boolean()),
});
type CreateSketchNodesParams = Static<typeof CreateSketchNodesParams>;

const BindSketchConfigParams = Type.Object({
  pageId: Type.String(),
  nodeId: Type.String(),
  property: Type.String(),
  field: Type.String(),
  dryRun: Type.Optional(Type.Boolean()),
});
type BindSketchConfigParams = Static<typeof BindSketchConfigParams>;

const ConvertSketchPageParams = Type.Object({
  pageId: Type.String(),
  targetRuntimeType: Type.Union([
    Type.Literal('prototype-html-css'),
    Type.Literal('high-fidelity-react'),
  ]),
});
type ConvertSketchPageParams = Static<typeof ConvertSketchPageParams>;

type SketchPatchToolDetails = {
  pageId: string;
  dryRun: boolean;
  scene: SketchSceneDocument;
  patch: {
    baseSceneKey: string;
    nextSceneKey: string;
    operations: SketchScenePatchOperation[];
    operationCount: number;
    changed: boolean;
    nodeCountBefore: number;
    nodeCountAfter: number;
  };
};

function sketchScenePath(config: AgentConfig, pageId: string): string {
  return path.join(config.workingDir || '.', 'demos', pageId, 'sketch.scene.json');
}

function sketchSceneRelativePath(pageId: string): string {
  return path.join('demos', pageId, 'sketch.scene.json');
}

function canAccess(config: AgentConfig, pageId: string): boolean {
  return isPathAllowed(
    sketchSceneRelativePath(pageId),
    config.workingDir || '',
    config.permissions ?? DEFAULT_WORKSPACE_PERMISSIONS,
  );
}

async function readScene(config: AgentConfig, pageId: string): Promise<SketchSceneDocument | null> {
  const content = await fs.promises.readFile(sketchScenePath(config, pageId), 'utf-8');
  return parseSketchSceneDocument(content);
}

async function writeScene(config: AgentConfig, pageId: string, scene: SketchSceneDocument): Promise<WorkspaceMutationReceipt | null> {
  const filePath = sketchScenePath(config, pageId);
  const content = JSON.stringify(scene, null, 2);
  const existing = await fs.promises.readFile(filePath, 'utf-8').catch(() => null);
  const liveWorkspace = config.workingDir ? resolveLiveWorkspaceMutationContext(config.workingDir) : null;
  if (liveWorkspace) {
    const state = await liveWorkspace.authority.getState(liveWorkspace.projectId, liveWorkspace.workspaceId);
    return liveWorkspace.authority.mutate({
      mutationId: crypto.randomUUID(), projectId: liveWorkspace.projectId, workspaceId: liveWorkspace.workspaceId,
      sessionId: config.sessionId, baseRevision: state.revision, actor: 'ai', reason: 'agent_sketch_scene',
      operations: [{ type: 'put_text', path: sketchSceneRelativePath(pageId), content,
        ...(existing === null ? { expectedAbsent: true } : { expectedHash: crypto.createHash('sha256').update(existing).digest('hex') }) }],
    });
  }
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf-8');
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isRecord(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((output, key) => {
      output[key] = sortJsonValue(value[key]);
      return output;
    }, {});
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function createPatchToolDetails(input: {
  pageId: string;
  dryRun?: boolean;
  scene: SketchSceneDocument;
  nextScene: SketchSceneDocument;
  operations: SketchScenePatchOperation[];
}): SketchPatchToolDetails {
  const baseSceneKey = stableStringify(input.scene);
  const nextSceneKey = stableStringify(input.nextScene);
  return {
    pageId: input.pageId,
    dryRun: input.dryRun ?? false,
    scene: input.nextScene,
    patch: {
      baseSceneKey,
      nextSceneKey,
      operations: input.operations,
      operationCount: input.operations.length,
      changed: baseSceneKey !== nextSceneKey,
      nodeCountBefore: input.scene.nodes.length,
      nodeCountAfter: input.nextScene.nodes.length,
    },
  };
}

function sceneSummary(scene: SketchSceneDocument): Record<string, unknown> {
  return {
    version: scene.version,
    pageSize: scene.pageSize,
    nodeCount: scene.nodes.length,
    nodes: scene.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      text: node.text,
      bindings: node.bindings,
    })),
    assets: scene.assets ?? [],
    metadata: scene.metadata ?? {},
  };
}

function validationError(pageId: string, validation: ReturnType<typeof validateSketchSceneDocument>) {
  return {
    content: [{ type: 'text' as const, text: `Error: sketch scene validation failed for ${pageId}` }],
    details: { pageId, runtimeValidation: validation },
    isError: true,
  };
}

export function createReadSketchSceneTool(config: AgentConfig): AgentTool<typeof ReadSketchSceneParams> {
  return {
    name: 'readSketchScene',
    label: 'Read Sketch Scene',
    description: 'Read a sketch-scene page as a compact object tree with page size, nodes, assets and bindings.',
    parameters: ReadSketchSceneParams,
    execute: async (_toolCallId: string, args: ReadSketchSceneParams) => {
      if (!canAccess(config, args.pageId)) {
        return {
          content: [{ type: 'text', text: `Error: page "${args.pageId}" is not allowed by workspace permissions` }],
          details: { pageId: args.pageId, error: 'permission denied' },
          isError: true,
        };
      }
      try {
        const scene = await readScene(config, args.pageId);
        if (!scene) throw new Error('Invalid sketch.scene.json');
        return {
          content: [{ type: 'text', text: JSON.stringify(sceneSummary(scene), null, 2) }],
          details: { pageId: args.pageId, scene },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.warn({ pageId: args.pageId, error: message }, 'readSketchScene failed');
        return {
          content: [{ type: 'text', text: `Error reading sketch scene: ${message}` }],
          details: { pageId: args.pageId, error: message },
          isError: true,
        };
      }
    },
  };
}

export function createPatchSketchSceneTool(config: AgentConfig): AgentTool<typeof PatchSketchSceneParams> {
  return {
    name: 'patchSketchScene',
    label: 'Patch Sketch Scene',
    description: 'Apply object-level add/update/delete/reorder/bind operations to demos/<pageId>/sketch.scene.json.',
    parameters: PatchSketchSceneParams,
    execute: async (_toolCallId: string, args: PatchSketchSceneParams) => {
      if (!canAccess(config, args.pageId)) {
        return {
          content: [{ type: 'text', text: `Error: page "${args.pageId}" is not allowed by workspace permissions` }],
          details: { pageId: args.pageId, error: 'permission denied' },
          isError: true,
        };
      }
      try {
        const scene = await readScene(config, args.pageId);
        if (!scene) throw new Error('Invalid sketch.scene.json');
        const operations = args.operations as SketchScenePatchOperation[];
        const nextScene = applySketchScenePatchOperations(
          scene,
          operations,
        );
        const validation = validateSketchSceneDocument(nextScene);
        if (!validation.valid) return validationError(args.pageId, validation);
        const details = createPatchToolDetails({
          pageId: args.pageId,
          dryRun: args.dryRun,
          scene,
          nextScene,
          operations,
        });
        const receipt = !args.dryRun && details.patch.changed
          ? await writeScene(config, args.pageId, nextScene)
          : null;
        return {
          content: [{
            type: 'text',
            text: args.dryRun
              ? `Sketch scene patch validated (${details.patch.operationCount} operations, changed=${details.patch.changed}).`
              : `Sketch scene patch applied (${details.patch.operationCount} operations, changed=${details.patch.changed}).`,
          }],
          details: { ...details, receipt },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.warn({ pageId: args.pageId, error: message }, 'patchSketchScene failed');
        return {
          content: [{ type: 'text', text: `Error patching sketch scene: ${message}` }],
          details: { pageId: args.pageId, error: message },
          isError: true,
        };
      }
    },
  };
}

export function createCreateSketchNodesTool(config: AgentConfig): AgentTool<typeof CreateSketchNodesParams> {
  return {
    name: 'createSketchNodes',
    label: 'Create Sketch Nodes',
    description: 'Append semantic sketch nodes to a sketch-scene page.',
    parameters: CreateSketchNodesParams,
    execute: async (toolCallId: string, args: CreateSketchNodesParams) => {
      const operations: SketchScenePatchOperation[] = (args.nodes as SketchSceneNode[]).map((node) => ({
        op: 'add',
        node,
      }));
      return createPatchSketchSceneTool(config).execute(toolCallId, {
        pageId: args.pageId,
        operations,
        dryRun: args.dryRun,
      });
    },
  };
}

export function createBindSketchConfigTool(config: AgentConfig): AgentTool<typeof BindSketchConfigParams> {
  return {
    name: 'bindSketchConfig',
    label: 'Bind Sketch Config',
    description: 'Bind a sketch node property to a config.schema.json field in sketch.scene.json.',
    parameters: BindSketchConfigParams,
    execute: async (_toolCallId: string, args: BindSketchConfigParams) => {
      if (!canAccess(config, args.pageId)) {
        return {
          content: [{ type: 'text', text: `Error: page "${args.pageId}" is not allowed by workspace permissions` }],
          details: { pageId: args.pageId, error: 'permission denied' },
          isError: true,
        };
      }
      try {
        const scene = await readScene(config, args.pageId);
        if (!scene) throw new Error('Invalid sketch.scene.json');
        const operations: SketchScenePatchOperation[] = [{
          op: 'bind',
          nodeId: args.nodeId,
          property: args.property as never,
          field: args.field,
        }];
        const nextScene = bindSketchSceneConfigField(scene, args.nodeId, args.property as never, args.field);
        const validation = validateSketchSceneDocument(nextScene);
        if (!validation.valid) return validationError(args.pageId, validation);
        const details = createPatchToolDetails({
          pageId: args.pageId,
          dryRun: args.dryRun,
          scene,
          nextScene,
          operations,
        });
        const receipt = !args.dryRun && details.patch.changed
          ? await writeScene(config, args.pageId, nextScene)
          : null;
        return {
          content: [{
            type: 'text',
            text: args.dryRun
              ? `Sketch config binding validated (changed=${details.patch.changed}).`
              : `Sketch config binding saved (changed=${details.patch.changed}).`,
          }],
          details: {
            ...details,
            receipt,
            nodeId: args.nodeId,
            property: args.property,
            field: args.field,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [{ type: 'text', text: `Error binding sketch config: ${message}` }],
          details: { pageId: args.pageId, error: message },
          isError: true,
        };
      }
    },
  };
}

export function createConvertSketchPageTool(_config: AgentConfig): AgentTool<typeof ConvertSketchPageParams> {
  return {
    name: 'convertSketchPage',
    label: 'Convert Sketch Page',
    description: 'Request conversion from sketch-scene to prototype-html-css or high-fidelity-react. Returns diagnostics; generation is handled by the agent workflow.',
    parameters: ConvertSketchPageParams,
    execute: async (_toolCallId: string, args: ConvertSketchPageParams) => ({
      content: [{
        type: 'text',
        text: `Conversion requested for ${args.pageId} -> ${args.targetRuntimeType}. Generate target files, validate them, then update workspace-tree.json runtimeType.`,
      }],
      details: {
        pageId: args.pageId,
        targetRuntimeType: args.targetRuntimeType,
        nextActions: [
          'readSketchScene',
          args.targetRuntimeType === 'prototype-html-css' ? 'write demos/<pageId>/prototype.html/css' : 'write demos/<pageId>/index.tsx',
          'update workspace-tree.json runtimeType only after validation',
        ],
      },
    }),
  };
}
