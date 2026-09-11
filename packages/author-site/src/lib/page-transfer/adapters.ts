import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  PageTransferStore,
  PagePackageBuilder,
  createWorkspaceResourceRegistry,
  type PagePackage,
  type PagePackageBuildInput,
  type PageTransferConflict,
  type PageTransferResolution,
  type ProjectAdminActor,
  type ReferenceGrant,
  type SourceSnapshotAuthPort,
  type TargetMutationPort,
} from "@workbench/project-core";
import {
  parseVisibilityRules,
  type DemoPageMeta,
  type WorkspaceTree,
} from "@workbench/shared";
import type { WorkspaceMutationOperation } from "@workbench/shared/contracts";

import { getProjectAdminService } from "@/lib/project-admin-service";
import {
  commitWorkspaceMutation,
  getWorkspaceAuthoritySnapshot,
  getWorkspaceMutationReceipt,
  stageWorkspaceBinary,
} from "@/lib/workspace-authority-client";

const PAGE_PREFIX = "demos/";
const JSON_INDENT = 2;

function hash(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readManagedFiles(root: string): Record<string, string | Buffer> {
  const registry = createWorkspaceResourceRegistry();
  const resources: Record<string, string | Buffer> = {};
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join("/");
        const descriptor = registry.describe(relative);
        if (descriptor)
          resources[relative] = descriptor.text
            ? fs.readFileSync(full, "utf8")
            : fs.readFileSync(full);
      }
    }
  };
  visit(root);
  return resources;
}

function parseObject(
  value: string | Buffer | undefined,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.isBuffer(value) ? value.toString("utf8") : value,
    );
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function pageText(
  resources: Record<string, string | Buffer>,
  pageId: string,
): string {
  const prefix = `${PAGE_PREFIX}${pageId}/`;
  return Object.entries(resources)
    .filter(
      ([resourcePath, content]) =>
        resourcePath.startsWith(prefix) && typeof content === "string",
    )
    .map(([, content]) => content as string)
    .join("\n");
}

function projectConfigKeys(text: string): Set<string> {
  if (/\bconfigData\s*\[(?!\s*["'])/u.test(text)) {
    throw Object.assign(new Error("页面包含无法静态确定的动态项目配置访问"), {
      code: "DYNAMIC_CONFIG_DEPENDENCY",
    });
  }
  const keys = new Set<string>();
  for (const expression of [
    /\bconfigData\.([A-Za-z_$][\w$]*)/gu,
    /\bconfigData\s*\[\s*["']([^"']+)["']\s*\]/gu,
    /data-config-key\s*=\s*["']([^"']+)["']/gu,
  ]) {
    for (const match of text.matchAll(expression))
      if (match[1]) keys.add(match[1]);
  }
  return keys;
}

function configClosure(
  resources: Record<string, string | Buffer>,
  pageId: string,
): Record<string, string> {
  const schema = parseObject(resources["project.config.schema.json"]);
  const values = parseObject(resources["project.config.values.json"]);
  if (!schema && !values) return {};
  const properties =
    schema &&
    typeof schema.properties === "object" &&
    schema.properties &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};
  const available = new Set([
    ...Object.keys(properties),
    ...Object.keys(values ?? {}),
  ]);
  const used = [...projectConfigKeys(pageText(resources, pageId))].filter(
    (key) => available.has(key),
  );
  if (!used.length) return {};
  const result: Record<string, string> = {};
  if (schema) {
    const required = Array.isArray(schema.required)
      ? schema.required.filter(
          (key): key is string => typeof key === "string" && used.includes(key),
        )
      : undefined;
    result["project.config.schema.json"] = JSON.stringify(
      {
        ...schema,
        properties: Object.fromEntries(
          used
            .filter((key) => key in properties)
            .map((key) => [key, properties[key]]),
        ),
        ...(required?.length ? { required } : { required: undefined }),
      },
      null,
      JSON_INDENT,
    );
  }
  if (values) {
    result["project.config.values.json"] = JSON.stringify(
      Object.fromEntries(
        used.filter((key) => key in values).map((key) => [key, values[key]]),
      ),
      null,
      JSON_INDENT,
    );
  }
  return result;
}

function assetPaths(text: string): Set<string> {
  const result = new Set<string>();
  for (const match of text.matchAll(/(?:^|["'(/\s])(assets\/[^"')\s?#]+)/gmu))
    if (match[1]) result.add(match[1]);
  return result;
}

function selectedDesignSpecResources(
  resources: Record<string, string | Buffer>,
  pageId: string,
): Record<string, string> {
  const selected: Array<{
    id: string;
    path: string;
    value: Record<string, unknown>;
  }> = [];
  for (const [resourcePath, content] of Object.entries(resources)) {
    if (!/^design-spec\/spec-[^/]+\.json$/u.test(resourcePath)) continue;
    const value = parseObject(content);
    if (!value) continue;
    const mentionsPage =
      value.autoManagedPageId === pageId ||
      JSON.stringify(value).includes(`"pageId":"${pageId}"`) ||
      JSON.stringify(value).includes(`"pageId": "${pageId}"`);
    if (mentionsPage && typeof value.id === "string")
      selected.push({ id: value.id, path: resourcePath, value });
  }
  if (!selected.length) return {};
  const manifest = parseObject(resources["design-spec/manifest.json"]);
  const items = Array.isArray(manifest?.items)
    ? manifest.items.filter((item): item is Record<string, unknown> =>
        Boolean(
          item &&
            typeof item === "object" &&
            selected.some(
              (entry) => entry.id === (item as Record<string, unknown>).id,
            ),
        ),
      )
    : [];
  return {
    "design-spec/manifest.json": JSON.stringify(
      { ...(manifest ?? { version: 1 }), items },
      null,
      JSON_INDENT,
    ),
    ...Object.fromEntries(
      selected.map((entry) => [
        entry.path,
        JSON.stringify(entry.value, null, JSON_INDENT),
      ]),
    ),
  };
}

function selectedWhiteboardResources(
  resources: Record<string, string | Buffer>,
  pageId: string,
): Record<string, string | Buffer> {
  const bindings = parseObject(resources["whiteboards/bindings.json"]);
  const selected = Array.isArray(bindings?.bindings)
    ? (bindings.bindings.filter((binding) => {
        if (!binding || typeof binding !== "object") return false;
        const target = (binding as { target?: unknown }).target;
        return Boolean(
          target &&
            typeof target === "object" &&
            (target as { scope?: unknown }).scope === "page" &&
            (target as { pageId?: unknown }).pageId === pageId,
        );
      }) as Array<Record<string, unknown>>)
    : [];
  if (!selected.length) return {};
  const result: Record<string, string | Buffer> = {
    "whiteboards/bindings.json": JSON.stringify(
      { bindings: selected },
      null,
      JSON_INDENT,
    ),
  };
  for (const binding of selected) {
    if (typeof binding.whiteboardId !== "string") continue;
    const documentPath = `whiteboards/${binding.whiteboardId}.json`;
    if (resources[documentPath] !== undefined)
      result[documentPath] = resources[documentPath];
  }
  return result;
}

function selectedVisibilityResource(
  resources: Record<string, string | Buffer>,
  pageId: string,
): Record<string, string> {
  const raw = resources["project.visibility-rules.json"];
  const parsed = parseVisibilityRules(
    Buffer.isBuffer(raw) ? raw.toString("utf8") : raw,
  );
  if (!parsed) return {};
  const rules = parsed.rules.filter((rule) => rule.target.pageId === pageId);
  return rules.length
    ? {
        "project.visibility-rules.json": JSON.stringify(
          { ...parsed, rules },
          null,
          JSON_INDENT,
        ),
      }
    : {};
}

function layoutForPage(workspacePath: string, pageId: string): unknown {
  const value = parseObject(
    fs.existsSync(path.join(workspacePath, ".canvas-layout.json"))
      ? fs.readFileSync(path.join(workspacePath, ".canvas-layout.json"), "utf8")
      : undefined,
  );
  const state = value?.state;
  const pages =
    state && typeof state === "object" && !Array.isArray(state)
      ? (state as { pages?: unknown }).pages
      : undefined;
  return pages && typeof pages === "object" && !Array.isArray(pages)
    ? (pages as Record<string, unknown>)[pageId]
    : undefined;
}

function buildPageInput(terminal: {
  projectId: string;
  page: DemoPageMeta;
  workspacePath: string;
}): PagePackageBuildInput {
  const all = readManagedFiles(terminal.workspacePath);
  const prefix = `${PAGE_PREFIX}${terminal.page.id}/`;
  const selected: Record<string, string | Buffer> = Object.fromEntries(
    Object.entries(all).filter(([resourcePath]) =>
      resourcePath.startsWith(prefix),
    ),
  );
  Object.assign(selected, configClosure(all, terminal.page.id));
  Object.assign(selected, selectedDesignSpecResources(all, terminal.page.id));
  Object.assign(selected, selectedWhiteboardResources(all, terminal.page.id));
  Object.assign(selected, selectedVisibilityResource(all, terminal.page.id));
  const referencedAssets = assetPaths(
    Object.values(selected)
      .filter((value): value is string => typeof value === "string")
      .join("\n"),
  );
  for (const assetPath of referencedAssets)
    if (all[assetPath] !== undefined) selected[assetPath] = all[assetPath];
  return {
    pageId: terminal.page.id,
    meta: { ...terminal.page, reference: undefined },
    resources: selected,
    registry: createWorkspaceResourceRegistry(),
    referenceMeta: {
      terminalSourceProjectId: terminal.projectId,
      terminalSourcePageId: terminal.page.id,
      sourceLayout: layoutForPage(terminal.workspacePath, terminal.page.id),
    },
  };
}

export function buildGrantedPagePackage(grant: ReferenceGrant): PagePackage {
  const detail = getProjectAdminService().getProject(grant.sourceProjectId, {
    id: "page-reference-projector",
    name: "page-reference-projector",
    role: "admin",
  });
  if (!detail.ok || !detail.data)
    throw Object.assign(new Error("源项目不可用"), { code: "SOURCE_DELETED" });
  const page = detail.data.pages.find(
    (candidate) => candidate.id === grant.sourcePageId,
  );
  if (!page || page.reference)
    throw Object.assign(new Error("终端源页面不可用"), {
      code: "SOURCE_DELETED",
    });
  return new PagePackageBuilder().build(
    buildPageInput({
      projectId: grant.sourceProjectId,
      page,
      workspacePath: detail.data.project.workspacePath,
    }),
  );
}

export function createSourcePort(input: {
  actor: ProjectAdminActor;
  dataDir: string;
}): SourceSnapshotAuthPort {
  const admin = getProjectAdminService();
  const grants = new PageTransferStore({ dataDir: input.dataDir });
  const resolveTerminal = (
    projectId: string,
    pageId: string,
    visited = new Set<string>(),
  ): { projectId: string; page: DemoPageMeta; workspacePath: string } => {
    const key = `${projectId}:${pageId}`;
    if (visited.has(key))
      throw Object.assign(new Error("页面引用存在环"), {
        code: "REFERENCE_CYCLE",
      });
    visited.add(key);
    const detail = admin.getProject(projectId, input.actor);
    if (!detail.ok || !detail.data)
      throw Object.assign(
        new Error(detail.error?.message ?? "源项目不可访问"),
        { code: detail.error?.code ?? "SOURCE_FORBIDDEN" },
      );
    const page = detail.data.pages.find((candidate) => candidate.id === pageId);
    if (!page)
      throw Object.assign(new Error(`源页面不存在: ${pageId}`), {
        code: "SOURCE_PAGE_NOT_FOUND",
      });
    if (!page.reference)
      return {
        projectId,
        page,
        workspacePath: detail.data.project.workspacePath,
      };
    const grant = grants.getGrant(page.reference.grantId);
    if (
      !grant ||
      grant.status !== "active" ||
      grant.targetProjectId !== projectId ||
      grant.targetPageId !== pageId
    ) {
      throw Object.assign(new Error("源引用授权无效"), {
        code: "REFERENCE_NOT_ACTIVE",
      });
    }
    return resolveTerminal(grant.sourceProjectId, grant.sourcePageId, visited);
  };
  return {
    authorize: async ({ sourceProjectId, actorId }) => {
      if (actorId !== input.actor.id) throw new Error("SOURCE_ACTOR_MISMATCH");
      const detail = admin.getProject(sourceProjectId, input.actor);
      if (!detail.ok)
        throw Object.assign(
          new Error(detail.error?.message ?? "源项目不可访问"),
          { code: detail.error?.code ?? "SOURCE_FORBIDDEN" },
        );
    },
    getPage: async ({
      sourceProjectId,
      pageId,
    }): Promise<PagePackageBuildInput> => {
      const terminal = resolveTerminal(sourceProjectId, pageId);
      return buildPageInput(terminal);
    },
    close: () => grants.close(),
  } as SourceSnapshotAuthPort & { close(): void };
}

function pageResourcePath(
  resourcePath: string,
  sourcePageId: string,
  targetPageId: string,
): string {
  const prefix = `${PAGE_PREFIX}${sourcePageId}/`;
  return resourcePath.startsWith(prefix)
    ? `${PAGE_PREFIX}${targetPageId}/${resourcePath.slice(prefix.length)}`
    : resourcePath;
}

function conflict(
  code: string,
  message: string,
  page: PagePackage,
  details: Partial<PageTransferConflict> = {},
): PageTransferConflict {
  return { code, message, sourcePageId: page.pageId, ...details };
}

function configConflicts(
  page: PagePackage,
  targetResources: Record<string, string>,
): PageTransferConflict[] {
  const result: PageTransferConflict[] = [];
  for (const resourcePath of [
    "project.config.schema.json",
    "project.config.values.json",
  ] as const) {
    const source = parseObject(
      page.resources.find((resource) => resource.path === resourcePath)
        ?.content,
    );
    const target = parseObject(targetResources[resourcePath]);
    if (!source || !target) continue;
    const sourceFields =
      resourcePath.endsWith("schema.json") &&
      typeof source.properties === "object" &&
      source.properties &&
      !Array.isArray(source.properties)
        ? (source.properties as Record<string, unknown>)
        : source;
    const targetFields =
      resourcePath.endsWith("schema.json") &&
      typeof target.properties === "object" &&
      target.properties &&
      !Array.isArray(target.properties)
        ? (target.properties as Record<string, unknown>)
        : target;
    for (const [key, value] of Object.entries(sourceFields)) {
      if (
        key in targetFields &&
        JSON.stringify(targetFields[key]) !== JSON.stringify(value)
      ) {
        result.push(
          conflict(
            resourcePath.endsWith("schema.json")
              ? "PROJECT_CONFIG_DEFINITION_CONFLICT"
              : "PROJECT_CONFIG_VALUE_CONFLICT",
            `项目配置字段 ${key} 与目标项目不一致`,
            page,
            {
              key,
              sourceValue: value,
              targetValue: targetFields[key],
              allowedActions: [
                "reuse_target",
                "replace_target",
                "map_to_target",
              ],
            },
          ),
        );
      }
    }
  }
  return result;
}

function applyConfigResource(
  resourcePath: "project.config.schema.json" | "project.config.values.json",
  sourceContent: string | Buffer,
  targetContent: string | undefined,
  resolutions: readonly PageTransferResolution[],
): string {
  const source = parseObject(sourceContent) ?? {};
  const target = parseObject(targetContent) ?? {};
  const schema = resourcePath.endsWith("schema.json");
  const sourceFields =
    schema &&
    typeof source.properties === "object" &&
    source.properties &&
    !Array.isArray(source.properties)
      ? (source.properties as Record<string, unknown>)
      : source;
  const targetFields =
    schema &&
    typeof target.properties === "object" &&
    target.properties &&
    !Array.isArray(target.properties)
      ? (target.properties as Record<string, unknown>)
      : target;
  const merged = { ...targetFields };
  for (const [key, value] of Object.entries(sourceFields)) {
    const resolution = resolutions.find(
      (item) =>
        item.key === key &&
        item.code ===
          (schema
            ? "PROJECT_CONFIG_DEFINITION_CONFLICT"
            : "PROJECT_CONFIG_VALUE_CONFLICT"),
    );
    if (!(key in merged) || resolution?.action === "replace_target")
      merged[key] = value;
    else if (resolution?.action === "map_to_target" && resolution.targetKey)
      merged[resolution.targetKey] = value;
  }
  const next = schema ? { ...target, ...source, properties: merged } : merged;
  return JSON.stringify(next, null, JSON_INDENT);
}

function mergeJsonArrayResource(
  pathName: string,
  sourceContent: string | Buffer,
  targetContent: string | undefined,
): string {
  const source = parseObject(sourceContent) ?? {};
  const target = parseObject(targetContent) ?? {};
  const key =
    pathName === "whiteboards/bindings.json"
      ? "bindings"
      : pathName === "design-spec/manifest.json"
        ? "items"
        : "rules";
  const current = Array.isArray(target[key])
    ? (target[key] as Array<Record<string, unknown>>)
    : [];
  const additions = Array.isArray(source[key])
    ? (source[key] as Array<Record<string, unknown>>)
    : [];
  const byId = new Map(current.map((item) => [String(item.id), item]));
  for (const item of additions) byId.set(String(item.id), item);
  return JSON.stringify(
    { ...target, ...source, [key]: [...byId.values()] },
    null,
    JSON_INDENT,
  );
}

function rewritePageReferences(
  content: string | Buffer,
  sourcePageId: string,
  targetPageId: string,
): string | Buffer {
  if (Buffer.isBuffer(content)) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        key === "pageId" && child === sourcePageId
          ? targetPageId
          : visit(child),
      ]),
    );
  };
  return JSON.stringify(visit(parsed), null, JSON_INDENT);
}

function whiteboardIdMap(
  page: PagePackage,
  targetPageId: string,
): Map<string, string> {
  const bindingResource = page.resources.find(
    (resource) => resource.path === "whiteboards/bindings.json",
  );
  const parsed = parseObject(bindingResource?.content);
  const bindings = Array.isArray(parsed?.bindings) ? parsed.bindings : [];
  return new Map(
    bindings.flatMap((binding) => {
      if (
        !binding ||
        typeof binding !== "object" ||
        typeof (binding as { whiteboardId?: unknown }).whiteboardId !== "string"
      )
        return [];
      const sourceId = (binding as { whiteboardId: string }).whiteboardId;
      return [
        [
          sourceId,
          `wb_${hash(`${targetPageId}:${sourceId}`).slice(0, 32)}`,
        ] as const,
      ];
    }),
  );
}

function rewriteWhiteboardReferences(
  content: string | Buffer,
  idMap: Map<string, string>,
): string | Buffer {
  if (Buffer.isBuffer(content) || idMap.size === 0) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        key === "whiteboardId" && typeof child === "string" && idMap.has(child)
          ? idMap.get(child)
          : visit(child),
      ]),
    );
  };
  return JSON.stringify(visit(parsed), null, JSON_INDENT);
}

function omitExternalVisibilityRelations(
  content: string | Buffer,
  sourcePageId: string,
): string | Buffer {
  if (Buffer.isBuffer(content)) return content;
  const parsed = parseVisibilityRules(content);
  if (!parsed) return content;
  return JSON.stringify(
    {
      ...parsed,
      rules: parsed.rules.map((rule) => {
        if (
          rule.strategy?.kind === "fallback-page" &&
          rule.strategy.pageId !== sourcePageId
        )
          return {
            ...rule,
            strategy: {
              kind: "unavailable" as const,
              message: rule.strategy.message,
            },
          };
        if (
          rule.strategy?.kind === "alternative-region" &&
          rule.strategy.pageId !== sourcePageId
        )
          return {
            ...rule,
            strategy: {
              kind: "unavailable" as const,
              message: rule.strategy.message,
            },
          };
        return rule;
      }),
    },
    null,
    JSON_INDENT,
  );
}

export function createTargetPort(input: {
  sessionId?: string;
}): TargetMutationPort {
  return {
    preflightPage: async ({ targetProjectId, targetWorkspaceId, page }) => {
      const snapshot = await getWorkspaceAuthoritySnapshot({
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId ?? "page-transfer",
      });
      const tree = parseObject(snapshot.resources["workspace-tree.json"]) as
        | WorkspaceTree
        | undefined;
      const conflicts = configConflicts(page, snapshot.resources);
      const routeKey =
        typeof page.meta.routeKey === "string" ? page.meta.routeKey : undefined;
      if (
        routeKey &&
        tree?.pages.some((candidate) => candidate.routeKey === routeKey)
      )
        conflicts.push(
          conflict("ROUTE_KEY_CONFLICT", `routeKey ${routeKey} 已存在`, page, {
            key: routeKey,
            allowedActions: ["map_to_target"],
          }),
        );
      const visibility = page.resources.find(
        (resource) => resource.path === "project.visibility-rules.json",
      );
      const rules = parseVisibilityRules(
        Buffer.isBuffer(visibility?.content)
          ? visibility.content.toString("utf8")
          : visibility?.content,
      );
      if (
        rules?.rules.some(
          (rule) =>
            (rule.strategy?.kind === "fallback-page" ||
              rule.strategy?.kind === "alternative-region") &&
            rule.strategy.pageId !== page.pageId,
        )
      ) {
        conflicts.push(
          conflict(
            "EXTERNAL_PAGE_RELATION",
            "页面状态规则依赖未转移页面",
            page,
            { allowedActions: ["omit_relation"] },
          ),
        );
      }
      for (const resource of page.resources) {
        if (
          resource.path.startsWith(`${PAGE_PREFIX}${page.pageId}/`) ||
          [
            "project.config.schema.json",
            "project.config.values.json",
            "whiteboards/bindings.json",
            "design-spec/manifest.json",
            "project.visibility-rules.json",
          ].includes(resource.path) ||
          /^whiteboards\/[^/]+\.json$/u.test(resource.path)
        )
          continue;
        const currentHash = snapshot.state.resourceHashes[resource.path];
        if (currentHash && currentHash !== resource.contentHash)
          conflicts.push(
            conflict(
              "WORKSPACE_RESOURCE_CONFLICT",
              `目标依赖资源冲突: ${resource.path}`,
              page,
              {
                resourcePath: resource.path,
                expectedHash: resource.contentHash,
                actualHash: currentHash,
              },
            ),
          );
      }
      return conflicts;
    },
    commitPage: async ({
      mutationId,
      targetProjectId,
      targetWorkspaceId,
      targetPageId,
      page,
      mode,
      referenceGrantId,
      targetFolderId,
      placement,
      pagePlacement,
      resolutions = [],
    }) => {
      const existingReceipt = await getWorkspaceMutationReceipt({
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId ?? "page-transfer",
        mutationId,
      });
      if (existingReceipt) return existingReceipt;
      const snapshot = await getWorkspaceAuthoritySnapshot({
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId ?? "page-transfer",
      });
      const parsedTree = parseObject(snapshot.resources["workspace-tree.json"]);
      const tree: WorkspaceTree = {
        folders: Array.isArray(parsedTree?.folders)
          ? (parsedTree.folders as WorkspaceTree["folders"])
          : [],
        pages: Array.isArray(parsedTree?.pages)
          ? (parsedTree.pages as WorkspaceTree["pages"])
          : [],
      };
      if (tree.pages.some((candidate) => candidate.id === targetPageId))
        throw Object.assign(new Error("目标页面 ID 已存在"), {
          code: "WORKSPACE_RESOURCE_CONFLICT",
        });
      const unresolved = configConflicts(page, snapshot.resources).filter(
        (entry) =>
          !resolutions.some(
            (resolution) =>
              resolution.code === entry.code && resolution.key === entry.key,
          ),
      );
      if (unresolved[0])
        throw Object.assign(new Error(unresolved[0].message), {
          code: unresolved[0].code,
        });
      const sourceRouteKey =
        typeof page.meta.routeKey === "string" ? page.meta.routeKey : undefined;
      if (
        sourceRouteKey &&
        tree.pages.some((candidate) => candidate.routeKey === sourceRouteKey) &&
        !resolutions.some(
          (resolution) =>
            resolution.code === "ROUTE_KEY_CONFLICT" &&
            resolution.action === "map_to_target" &&
            resolution.targetKey,
        )
      ) {
        throw Object.assign(new Error(`routeKey ${sourceRouteKey} 已存在`), {
          code: "ROUTE_KEY_CONFLICT",
        });
      }
      const visibility = page.resources.find(
        (resource) => resource.path === "project.visibility-rules.json",
      );
      const visibilityRules = parseVisibilityRules(
        Buffer.isBuffer(visibility?.content)
          ? visibility.content.toString("utf8")
          : visibility?.content,
      );
      if (
        visibilityRules?.rules.some(
          (rule) =>
            (rule.strategy?.kind === "fallback-page" ||
              rule.strategy?.kind === "alternative-region") &&
            rule.strategy.pageId !== page.pageId,
        ) &&
        !resolutions.some(
          (resolution) =>
            resolution.code === "EXTERNAL_PAGE_RELATION" &&
            resolution.action === "omit_relation",
        )
      ) {
        throw Object.assign(new Error("页面状态规则依赖未转移页面"), {
          code: "EXTERNAL_PAGE_RELATION",
        });
      }
      const routeResolution = resolutions.find(
        (resolution) =>
          resolution.code === "ROUTE_KEY_CONFLICT" &&
          resolution.action === "map_to_target",
      );
      const terminalProjectId =
        typeof page.referenceMeta?.terminalSourceProjectId === "string"
          ? page.referenceMeta.terminalSourceProjectId
          : undefined;
      const terminalPageId =
        typeof page.referenceMeta?.terminalSourcePageId === "string"
          ? page.referenceMeta.terminalSourcePageId
          : page.pageId;
      const pageMeta: DemoPageMeta = {
        ...(page.meta as DemoPageMeta),
        id: targetPageId,
        parentId: targetFolderId,
        order: tree.pages.length,
        ...(routeResolution?.targetKey
          ? { routeKey: routeResolution.targetKey }
          : {}),
        ...(mode === "reference"
          ? {
              reference: {
                grantId: referenceGrantId as string,
                sourceProjectId: terminalProjectId as string,
                sourcePageId: terminalPageId,
              },
            }
          : { reference: undefined }),
      };
      if (mode === "reference" && (!referenceGrantId || !terminalProjectId))
        throw new Error("REFERENCE_BINDING_INVALID");
      const operations: WorkspaceMutationOperation[] = [];
      if (mode === "copy") {
        const boardIds = whiteboardIdMap(page, targetPageId);
        for (const resource of page.resources) {
          let targetPath = pageResourcePath(
            resource.path,
            page.pageId,
            targetPageId,
          );
          let content = resource.content;
          const whiteboardDocument = targetPath.match(
            /^whiteboards\/([^/]+)\.json$/u,
          );
          if (
            whiteboardDocument?.[1] &&
            whiteboardDocument[1] !== "bindings" &&
            boardIds.has(whiteboardDocument[1])
          ) {
            targetPath = `whiteboards/${boardIds.get(whiteboardDocument[1])}.json`;
          }
          content = rewritePageReferences(content, page.pageId, targetPageId);
          if (targetPath === "whiteboards/bindings.json")
            content = rewriteWhiteboardReferences(content, boardIds);
          if (
            targetPath === "project.visibility-rules.json" &&
            resolutions.some(
              (resolution) =>
                resolution.code === "EXTERNAL_PAGE_RELATION" &&
                resolution.action === "omit_relation",
            )
          )
            content = omitExternalVisibilityRelations(content, page.pageId);
          if (
            targetPath === "project.config.schema.json" ||
            targetPath === "project.config.values.json"
          ) {
            content = applyConfigResource(
              targetPath,
              content,
              snapshot.resources[targetPath],
              resolutions,
            );
          } else if (
            [
              "whiteboards/bindings.json",
              "design-spec/manifest.json",
              "project.visibility-rules.json",
            ].includes(targetPath)
          ) {
            content = mergeJsonArrayResource(
              targetPath,
              content,
              snapshot.resources[targetPath],
            );
          }
          const existingHash = snapshot.state.resourceHashes[targetPath];
          const contentHash = hash(content);
          if (existingHash === contentHash) continue;
          if (Buffer.isBuffer(content)) {
            if (existingHash)
              throw Object.assign(new Error(`目标资产冲突: ${targetPath}`), {
                code: "WORKSPACE_RESOURCE_CONFLICT",
              });
            const staged = await stageWorkspaceBinary({
              projectId: targetProjectId,
              workspaceId: targetWorkspaceId,
              sessionId: input.sessionId ?? "page-transfer",
              content,
            });
            operations.push({
              type: "put_binary",
              path: targetPath,
              stagingId: staged.stagingId,
              hash: staged.hash,
              size: staged.size,
              expectedAbsent: true,
            });
          } else {
            const mergeable =
              targetPath === "project.config.schema.json" ||
              targetPath === "project.config.values.json" ||
              targetPath === "whiteboards/bindings.json" ||
              targetPath === "design-spec/manifest.json" ||
              targetPath === "project.visibility-rules.json";
            if (
              existingHash &&
              !mergeable &&
              !targetPath.startsWith(`${PAGE_PREFIX}${targetPageId}/`)
            )
              throw Object.assign(
                new Error(`目标依赖资源冲突: ${targetPath}`),
                { code: "WORKSPACE_RESOURCE_CONFLICT" },
              );
            operations.push({
              type: "put_text",
              path: targetPath,
              content,
              ...(existingHash
                ? { expectedHash: existingHash }
                : { expectedAbsent: true }),
            });
          }
        }
      }
      const nextTree = {
        folders: tree.folders,
        pages: [...tree.pages, pageMeta],
      };
      operations.push({
        type: "put_text",
        path: "workspace-tree.json",
        content: JSON.stringify(nextTree, null, JSON_INDENT),
        ...(snapshot.state.resourceHashes["workspace-tree.json"]
          ? {
              expectedHash:
                snapshot.state.resourceHashes["workspace-tree.json"],
            }
          : { expectedAbsent: true }),
      });
      const layout = parseObject(snapshot.resources[".canvas-layout.json"]) ?? {
        version: 1,
        state: {},
      };
      const state =
        layout.state &&
        typeof layout.state === "object" &&
        !Array.isArray(layout.state)
          ? (layout.state as Record<string, unknown>)
          : {};
      const pages =
        state.pages &&
        typeof state.pages === "object" &&
        !Array.isArray(state.pages)
          ? (state.pages as Record<string, unknown>)
          : {};
      const sourceLayout =
        page.referenceMeta?.sourceLayout &&
        typeof page.referenceMeta.sourceLayout === "object"
          ? (page.referenceMeta.sourceLayout as Record<string, unknown>)
          : {};
      const x =
        pagePlacement?.x ??
        (typeof sourceLayout.x === "number"
          ? sourceLayout.x + (placement?.anchorX ?? 0)
          : placement?.anchorX);
      const y =
        pagePlacement?.y ??
        (typeof sourceLayout.y === "number"
          ? sourceLayout.y + (placement?.anchorY ?? 0)
          : placement?.anchorY);
      const nextLayout = {
        ...layout,
        updatedAt: Date.now(),
        state: {
          ...state,
          pages: {
            ...pages,
            [targetPageId]: {
              ...sourceLayout,
              ...(x === undefined ? {} : { x }),
              ...(y === undefined ? {} : { y }),
            },
          },
        },
      };
      operations.push({
        type: "put_text",
        path: ".canvas-layout.json",
        content: JSON.stringify(nextLayout, null, JSON_INDENT),
        ...(snapshot.state.resourceHashes[".canvas-layout.json"]
          ? {
              expectedHash:
                snapshot.state.resourceHashes[".canvas-layout.json"],
            }
          : { expectedAbsent: true }),
      });
      return commitWorkspaceMutation({
        mutationId,
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId,
        baseRevision: snapshot.state.revision,
        baseRootHash: snapshot.state.rootHash,
        actor: "author-site",
        reason:
          mode === "copy" ? "page_transfer_copy" : "page_transfer_reference",
        operations,
      });
    },
    commitTopology: async ({
      mutationId,
      targetProjectId,
      targetWorkspaceId,
      jobId,
      sourceProjectId,
      items,
    }) => {
      const existingReceipt = await getWorkspaceMutationReceipt({
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId ?? "page-transfer",
        mutationId,
      });
      if (existingReceipt) return existingReceipt;
      const source = getProjectAdminService().getProject(sourceProjectId, {
        id: "page-transfer",
        name: "page-transfer",
        role: "admin",
      });
      const sourceLayout =
        source.ok && source.data
          ? parseObject(
              fs.existsSync(
                path.join(
                  source.data.project.workspacePath,
                  ".canvas-layout.json",
                ),
              )
                ? fs.readFileSync(
                    path.join(
                      source.data.project.workspacePath,
                      ".canvas-layout.json",
                    ),
                    "utf8",
                  )
                : undefined,
            )
          : undefined;
      const snapshot = await getWorkspaceAuthoritySnapshot({
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId ?? "page-transfer",
      });
      const targetLayout = parseObject(
        snapshot.resources[".canvas-layout.json"],
      ) ?? { version: 1, state: {} };
      const targetState =
        targetLayout.state &&
        typeof targetLayout.state === "object" &&
        !Array.isArray(targetLayout.state)
          ? (targetLayout.state as Record<string, unknown>)
          : {};
      const sourceState =
        sourceLayout?.state &&
        typeof sourceLayout.state === "object" &&
        !Array.isArray(sourceLayout.state)
          ? (sourceLayout.state as Record<string, unknown>)
          : {};
      const mapping = new Map(
        items.map((item) => [item.sourcePageId, item.targetPageId]),
      );
      const remap = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(remap);
        if (!value || typeof value !== "object")
          return typeof value === "string" && mapping.has(value)
            ? mapping.get(value)
            : value;
        return Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(
            ([key, child]) => [
              mapping.get(key) ?? key,
              key === "pageId" && typeof child === "string"
                ? (mapping.get(child) ?? child)
                : remap(child),
            ],
          ),
        );
      };
      const sourceGroups =
        sourceState.pageGroups &&
        typeof sourceState.pageGroups === "object" &&
        !Array.isArray(sourceState.pageGroups)
          ? (sourceState.pageGroups as Record<string, unknown>)
          : {};
      const groupIdMapping = new Map(
        Object.entries(sourceGroups).flatMap(([groupId, value]) => {
          const pages =
            value &&
            typeof value === "object" &&
            Array.isArray((value as { pages?: unknown }).pages)
              ? (value as { pages: Array<{ pageId?: unknown }> }).pages
              : [];
          return pages.length &&
            pages.every(
              (entry) =>
                typeof entry.pageId === "string" && mapping.has(entry.pageId),
            )
            ? [
                [
                  groupId,
                  `group_${hash(`${jobId}:${groupId}`).slice(0, 24)}`,
                ] as const,
              ]
            : [];
        }),
      );
      const selectedGroups = Object.fromEntries(
        Object.entries(sourceGroups).flatMap(([groupId, value]) => {
          const targetGroupId = groupIdMapping.get(groupId);
          if (!targetGroupId) return [];
          return [
            [
              targetGroupId,
              {
                ...(remap(value) as Record<string, unknown>),
                id: targetGroupId,
              },
            ],
          ];
        }),
      );
      const sourcePages =
        sourceState.pages &&
        typeof sourceState.pages === "object" &&
        !Array.isArray(sourceState.pages)
          ? (sourceState.pages as Record<string, unknown>)
          : {};
      const targetPages =
        targetState.pages &&
        typeof targetState.pages === "object" &&
        !Array.isArray(targetState.pages)
          ? (targetState.pages as Record<string, unknown>)
          : {};
      const first = items.find(
        (item) =>
          sourcePages[item.sourcePageId] && targetPages[item.targetPageId],
      );
      const firstSourceLayout = first
        ? (sourcePages[first.sourcePageId] as Record<string, unknown>)
        : undefined;
      const firstTargetLayout = first
        ? (targetPages[first.targetPageId] as Record<string, unknown>)
        : undefined;
      const offsetX =
        typeof firstSourceLayout?.x === "number" &&
        typeof firstTargetLayout?.x === "number"
          ? firstTargetLayout.x - firstSourceLayout.x
          : 0;
      const offsetY =
        typeof firstSourceLayout?.y === "number" &&
        typeof firstTargetLayout?.y === "number"
          ? firstTargetLayout.y - firstSourceLayout.y
          : 0;
      const sourceSections =
        sourceState.sections &&
        typeof sourceState.sections === "object" &&
        !Array.isArray(sourceState.sections)
          ? (sourceState.sections as Record<string, unknown>)
          : {};
      const sectionIdMapping = new Map<string, string>();
      const sectionIncluded = (
        sectionId: string,
        visiting = new Set<string>(),
      ): boolean => {
        if (visiting.has(sectionId)) return false;
        const section = sourceSections[sectionId];
        const children =
          section &&
          typeof section === "object" &&
          Array.isArray((section as { children?: unknown }).children)
            ? (section as { children: Array<{ kind?: unknown; id?: unknown }> })
                .children
            : [];
        if (!children.length) return false;
        const nextVisiting = new Set(visiting).add(sectionId);
        const included = children.every(
          (child) =>
            typeof child.id === "string" &&
            (child.kind === "page"
              ? mapping.has(child.id)
              : child.kind === "page-group"
                ? groupIdMapping.has(child.id)
                : child.kind === "section"
                  ? sectionIncluded(child.id, nextVisiting)
                  : false),
        );
        if (included)
          sectionIdMapping.set(
            sectionId,
            `section_${hash(`${jobId}:${sectionId}`).slice(0, 24)}`,
          );
        return included;
      };
      Object.keys(sourceSections).forEach((sectionId) =>
        sectionIncluded(sectionId),
      );
      const selectedSections = Object.fromEntries(
        [...sectionIdMapping].map(([sectionId, targetSectionId]) => {
          const section = sourceSections[sectionId] as Record<string, unknown>;
          const layout =
            section.layout &&
            typeof section.layout === "object" &&
            !Array.isArray(section.layout)
              ? (section.layout as Record<string, unknown>)
              : {};
          const children = Array.isArray(section.children)
            ? section.children.map((child) => {
                if (!child || typeof child !== "object") return child;
                const value = child as { kind?: unknown; id?: unknown };
                const id =
                  typeof value.id === "string"
                    ? value.kind === "page"
                      ? mapping.get(value.id)
                      : value.kind === "page-group"
                        ? groupIdMapping.get(value.id)
                        : value.kind === "section"
                          ? sectionIdMapping.get(value.id)
                          : undefined
                    : undefined;
                return { ...value, id: id ?? value.id };
              })
            : [];
          return [
            targetSectionId,
            {
              ...section,
              id: targetSectionId,
              layout: {
                ...layout,
                ...(typeof layout.x === "number"
                  ? { x: layout.x + offsetX }
                  : {}),
                ...(typeof layout.y === "number"
                  ? { y: layout.y + offsetY }
                  : {}),
              },
              children,
            },
          ];
        }),
      );
      const sourceNavigation =
        sourceState.navigation &&
        typeof sourceState.navigation === "object" &&
        !Array.isArray(sourceState.navigation)
          ? (sourceState.navigation as Record<string, unknown>)
          : {};
      const hotspots =
        sourceNavigation.hotspots &&
        typeof sourceNavigation.hotspots === "object" &&
        !Array.isArray(sourceNavigation.hotspots)
          ? (sourceNavigation.hotspots as Record<string, unknown>)
          : {};
      const selectedHotspots = Object.fromEntries(
        Object.entries(hotspots)
          .filter(([, value]) =>
            Boolean(
              value &&
                typeof value === "object" &&
                typeof (value as { pageId?: unknown }).pageId === "string" &&
                mapping.has((value as { pageId: string }).pageId),
            ),
          )
          .map(([id, value]) => [id, remap(value)]),
      );
      const connections =
        sourceNavigation.connections &&
        typeof sourceNavigation.connections === "object" &&
        !Array.isArray(sourceNavigation.connections)
          ? (sourceNavigation.connections as Record<string, unknown>)
          : {};
      const selectedConnections = Object.fromEntries(
        Object.entries(connections)
          .filter(([, value]) => {
            if (!value || typeof value !== "object") return false;
            const sourcePageId = (value as { source?: { pageId?: unknown } })
              .source?.pageId;
            const targetPageId = (value as { target?: { pageId?: unknown } })
              .target?.pageId;
            return (
              typeof sourcePageId === "string" &&
              typeof targetPageId === "string" &&
              mapping.has(sourcePageId) &&
              mapping.has(targetPageId)
            );
          })
          .map(([id, value]) => [id, remap(value)]),
      );
      const currentGroups =
        targetState.pageGroups &&
        typeof targetState.pageGroups === "object" &&
        !Array.isArray(targetState.pageGroups)
          ? (targetState.pageGroups as Record<string, unknown>)
          : {};
      const currentSections =
        targetState.sections &&
        typeof targetState.sections === "object" &&
        !Array.isArray(targetState.sections)
          ? (targetState.sections as Record<string, unknown>)
          : {};
      const currentNavigation =
        targetState.navigation &&
        typeof targetState.navigation === "object" &&
        !Array.isArray(targetState.navigation)
          ? (targetState.navigation as Record<string, unknown>)
          : {};
      const currentHotspots =
        currentNavigation.hotspots &&
        typeof currentNavigation.hotspots === "object" &&
        !Array.isArray(currentNavigation.hotspots)
          ? (currentNavigation.hotspots as Record<string, unknown>)
          : {};
      const currentConnections =
        currentNavigation.connections &&
        typeof currentNavigation.connections === "object" &&
        !Array.isArray(currentNavigation.connections)
          ? (currentNavigation.connections as Record<string, unknown>)
          : {};
      const next = {
        ...targetLayout,
        updatedAt: Date.now(),
        state: {
          ...targetState,
          pageGroups: { ...currentGroups, ...selectedGroups },
          sections: { ...currentSections, ...selectedSections },
          navigation: {
            ...currentNavigation,
            hotspots: { ...currentHotspots, ...selectedHotspots },
            connections: { ...currentConnections, ...selectedConnections },
          },
        },
      };
      return commitWorkspaceMutation({
        mutationId,
        projectId: targetProjectId,
        workspaceId: targetWorkspaceId,
        sessionId: input.sessionId,
        baseRevision: snapshot.state.revision,
        baseRootHash: snapshot.state.rootHash,
        actor: "author-site",
        reason: "page_transfer_topology",
        operations: [
          {
            type: "put_text",
            path: ".canvas-layout.json",
            content: JSON.stringify(next, null, JSON_INDENT),
            ...(snapshot.state.resourceHashes[".canvas-layout.json"]
              ? {
                  expectedHash:
                    snapshot.state.resourceHashes[".canvas-layout.json"],
                }
              : { expectedAbsent: true }),
          },
        ],
      });
    },
  };
}

export function closeSourcePort(port: SourceSnapshotAuthPort): void {
  const candidate = port as SourceSnapshotAuthPort & { close?: () => void };
  candidate.close?.();
}
