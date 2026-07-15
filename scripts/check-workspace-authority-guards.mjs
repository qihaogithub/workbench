import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function listSourceFiles(relativeDir) {
  const baseDir = path.join(root, relativeDir);
  if (!fs.existsSync(baseDir)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!/\.(?:ts|js|mjs)$/.test(entry.name)) continue;
      if (/\.test\.ts$/.test(entry.name)) continue;
      const relativePath = path
        .relative(root, fullPath)
        .split(path.sep)
        .join("/");
      if (relativePath === "scripts/check-workspace-authority-guards.mjs")
        continue;
      files.push(relativePath);
    }
  };
  visit(baseDir);
  return files;
}

function requireIncludes(source, token, label) {
  if (!source.includes(token)) {
    errors.push(`${label} must include ${token}`);
  }
}

function requireBefore(source, firstToken, secondToken, label) {
  const firstIndex = source.indexOf(firstToken);
  const secondIndex = source.indexOf(secondToken);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    errors.push(`${label} must place ${firstToken} before ${secondToken}`);
  }
}

function requireNotMatches(source, pattern, label, reason) {
  if (pattern.test(source)) {
    errors.push(`${label} must not match ${pattern}: ${reason}`);
  }
}

function requireNotCalledAssertion(source, helper, label) {
  const escapedHelper = helper.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `expect\\((?:\\w+\\.)?${escapedHelper}\\)\\.not\\.toHaveBeenCalled`,
  );
  if (!pattern.test(source)) {
    errors.push(
      `${label} must assert ${helper} is not called for live Workspace`,
    );
  }
}

function requireReason(source, reason, label) {
  if (!source.includes(`"${reason}"`) && !source.includes(`'${reason}'`)) {
    errors.push(`${label} must include reason: ${reason}`);
  }
}

function requireMatchCountAtLeast(source, pattern, minimum, label, reason) {
  const matches = source.match(pattern) ?? [];
  if (matches.length < minimum) {
    errors.push(
      `${label} must match ${pattern} at least ${minimum} times: ${reason}`,
    );
  }
}

const WRITE_API_PATTERN =
  /\b(?:fs\.)?(?:writeFileSync|writeFile|appendFileSync|appendFile|rmSync|rm|renameSync|rename|copyFileSync|copyFile|cpSync|cp|mkdirSync|mkdir)\b/;

const guardedRoutes = [
  {
    route:
      "packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.ts",
    test: "packages/author-site/src/app/api/sessions/[sessionId]/files/[demoId]/route.test.ts",
    reasons: ["update_demo_page_files"],
    legacyHelpers: ["updateWorkspaceDemoFiles"],
  },
  {
    route:
      "packages/author-site/src/app/api/sessions/[sessionId]/files/route.ts",
    test: "packages/author-site/src/app/api/sessions/[sessionId]/files/route.test.ts",
    reasons: ["update_session_files_legacy"],
    legacyHelpers: ["updateWorkspaceDemoFiles"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/demos/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/demos/route.test.ts",
    reasons: ["create_demo_page", "copy_demo_page"],
    legacyHelpers: ["createWorkspaceDemoPage", "copyWorkspaceDemoPage"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/route.test.ts",
    reasons: ["update_demo_page_meta", "delete_demo_page", "restore_demo_page"],
    legacyHelpers: [
      "writeDemoPageMeta",
      "deleteWorkspaceDemoPage",
      "restoreDeletedWorkspaceDemoPageSnapshot",
    ],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/runtime/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/runtime/route.test.ts",
    reasons: ["switch_demo_page_runtime"],
    legacyHelpers: ["updateWorkspaceDemoFiles", "writeDemoPageMeta"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/files/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/demos/[demoId]/files/route.test.ts",
    reasons: ["update_demo_page_files"],
    legacyHelpers: ["updateWorkspaceDemoFiles"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/[versionId]/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/[versionId]/route.test.ts",
    reasons: ["restore_page_version"],
    legacyHelpers: [
      "restorePageVersion",
      "updateWorkspaceDemoFiles",
      "markWorkspaceBasedOnVersion",
      "flushAndSyncProjectWorkspace",
    ],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/config-values/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/config-values/route.test.ts",
    reasons: ["update_project_config_values"],
    legacyHelpers: ["saveProjectConfigValues", "updateWorkspaceTimestamp"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/config/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/config/route.test.ts",
    reasons: ["update_project_config_schema", "delete_project_config_schema"],
    legacyHelpers: ["saveProjectConfigSchema", "deleteProjectConfigSchema"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/folders/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/folders/route.test.ts",
    reasons: ["create_demo_folder"],
    legacyHelpers: ["createDemoFolder"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/folders/[folderId]/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/folders/[folderId]/route.test.ts",
    reasons: ["update_demo_folder", "delete_demo_folder"],
    legacyHelpers: ["updateDemoFolder", "deleteDemoFolder"],
  },
  {
    route:
      "packages/author-site/src/app/api/projects/[projectId]/demo-pages/reorder/route.ts",
    test: "packages/author-site/src/app/api/projects/[projectId]/demo-pages/reorder/route.test.ts",
    reasons: ["reorder_demo_pages"],
    legacyHelpers: ["reorderDemoPages"],
  },
  {
    route: "packages/author-site/src/app/api/knowledge/route.ts",
    test: "packages/author-site/src/app/api/knowledge/route.test.ts",
    reasons: ["create_knowledge_document"],
    legacyHelpers: [],
  },
  {
    route: "packages/author-site/src/app/api/knowledge/[docId]/route.ts",
    test: "packages/author-site/src/app/api/knowledge/route.test.ts",
    reasons: ["update_knowledge_document", "delete_knowledge_document"],
    legacyHelpers: [],
  },
];

for (const guard of guardedRoutes) {
  const routeSource = read(guard.route);
  const testSource = read(guard.test);
  if (!routeSource || !testSource) continue;

  requireIncludes(routeSource, "isLiveWorkspacePath", guard.route);
  requireIncludes(routeSource, "commitWorkspaceMutation", guard.route);
  requireIncludes(routeSource, "WorkspaceAuthorityClientError", guard.route);
  requireIncludes(routeSource, "createMutationErrorResponse", guard.route);

  for (const reason of guard.reasons) {
    requireReason(routeSource, reason, guard.route);
  }

  requireIncludes(testSource, "live Workspace", guard.test);
  requireIncludes(testSource, "commitWorkspaceMutation", guard.test);

  for (const helper of guard.legacyHelpers) {
    requireNotCalledAssertion(testSource, helper, guard.test);
  }
}

const authorityClientSource = read(
  "packages/author-site/src/lib/workspace-authority-client.ts",
);
requireIncludes(
  authorityClientSource,
  "Workspace Authority 不可用",
  "workspace authority client",
);
requireIncludes(
  authorityClientSource,
  "WorkspaceAuthorityClientError",
  "workspace authority client",
);
requireIncludes(
  authorityClientSource,
  "body.success",
  "workspace authority client",
);

const workspaceAuthoritySource = read(
  "packages/agent-service/src/workspace/workspace-mutation-authority.ts",
);
const workspaceAuthorityRouteSource = read(
  "packages/agent-service/src/routes/workspace-authority.ts",
);
const workspaceAuthorityRouteTestSource = read(
  "packages/agent-service/tests/unit/workspace-authority-routes.test.ts",
);
const workspaceAuthorityTestSource = read(
  "packages/agent-service/tests/unit/workspace-mutation-authority.test.ts",
);
const opsCliIndexSource = read("OPS/CLI/src/index.ts");
const opsCliWorkspaceAuthoritySource = read(
  "OPS/CLI/src/commands/workspace-authority.ts",
);
const opsCliWorkspaceAuthorityTestSource = read(
  "OPS/CLI/src/commands/workspace-authority.test.ts",
);
const opsCliDiagnosticsSource = read("OPS/CLI/src/commands/diagnostics.ts");
const opsCliDiagnosticsTestSource = read(
  "OPS/CLI/src/commands/diagnostics.test.ts",
);
const opsCliReadmeSource = read("OPS/CLI/README.md");
const rootPackageSource = read("package.json");
const workspaceDeployPreflightSource = read(
  "scripts/check-workspace-deploy-preflight.mjs",
);
const workspaceDeployPreflightTestSource = read(
  "scripts/check-workspace-deploy-preflight.test.mjs",
);
const deploySource = read("scripts/deploy.sh");
const workspaceAuthorityMigrationSource = read(
  "packages/agent-service/src/workspace/workspace-authority-migration.ts",
);
const workspaceAuthorityMigrationTestSource = read(
  "packages/agent-service/tests/unit/workspace-authority-migration.test.ts",
);
const workspaceAuthorityStartupRecoverySource = read(
  "packages/agent-service/src/workspace/workspace-authority-startup-recovery.ts",
);
const workspaceAuthorityStartupRecoveryTestSource = read(
  "packages/agent-service/tests/unit/workspace-authority-startup-recovery.test.ts",
);
const workspaceAuthorityDiagnosticsSource = read(
  "packages/agent-service/src/workspace/workspace-authority-diagnostics.ts",
);
const agentServiceServerSource = read("packages/agent-service/src/server.ts");
const sharedDiagnosticsSource = read("packages/shared/src/diagnostics.ts");
const sharedContractsSource = read("packages/shared/src/contracts.ts");
const sharedWorkspaceTypesSource = read("packages/shared/src/workspace.ts");
const workspaceResourceRegistrySource = read(
  "packages/project-core/src/workspace-resource-registry.ts",
);
const workspaceResourceRegistryTestSource = read(
  "packages/project-core/src/__tests__/workspace-resource-registry.test.ts",
);
const workspaceAuthorityInstancePolicySource = read(
  "packages/agent-service/src/workspace/workspace-authority-instance-policy.ts",
);
const workspaceAuthorityInstancePolicyTestSource = read(
  "packages/agent-service/tests/unit/workspace-authority-instance-policy.test.ts",
);
const authorWorkspaceAuthorityBrowserClientSource = read(
  "packages/author-site/src/lib/workspace-authority-browser-client.ts",
);
const authorWorkspaceAuthorityBrowserClientTestSource = read(
  "packages/author-site/src/lib/__tests__/workspace-authority-browser-client.test.ts",
);
const authorWorkspaceAuthorityProxySource = read(
  "packages/author-site/src/app/api/workspace-authority/[projectId]/[workspaceId]/[...segments]/route.ts",
);
const authorWorkspaceAuthorityProxyTestSource = read(
  "packages/author-site/src/app/api/workspace-authority/[projectId]/[workspaceId]/[...segments]/route.test.ts",
);
const projectCliWorkspaceAuthorityClientSource = read(
  "packages/project-cli/src/workspace-authority-client.ts",
);
const projectCliWorkspaceAuthorityClientTestSource = read(
  "packages/project-cli/src/workspace-authority-client.test.ts",
);
for (const contract of [
  "WorkspaceMutationRequest",
  "WorkspaceMutationOperation",
  "WorkspaceMutationReceipt",
  "WorkspaceMutationActor",
  "WorkspaceMutationCommittedEvent",
  "WorkspaceProjectionAck",
  "WorkspaceMutationErrorCode",
  "WorkspaceAuthorityStreamEvent",
  "WorkspaceAuthorityApiErrorCode",
]) {
  requireIncludes(
    sharedContractsSource,
    contract,
    `shared Workspace mutation contract ${contract}`,
  );
}
for (const versionAxis of [
  "ProjectBaseVersion",
  "WorkspaceRevision",
  "CanonicalSyncedRevision",
]) {
  requireIncludes(
    sharedWorkspaceTypesSource,
    versionAxis,
    `independent Workspace version axis ${versionAxis}`,
  );
}
requireIncludes(
  workspaceResourceRegistrySource,
  "class WorkspaceResourceRegistry",
  "Workspace resource registry",
);
requireIncludes(
  workspaceResourceRegistrySource,
  "createRootManifest",
  "Workspace root manifest builder",
);
requireIncludes(
  workspaceResourceRegistrySource,
  "validateSketchSceneDocument",
  "Workspace Sketch adapter validation",
);
requireIncludes(
  workspaceResourceRegistrySource,
  "assertBinaryWrite",
  "Workspace binary asset adapter validation",
);
requireIncludes(
  workspaceResourceRegistryTestSource,
  "覆盖所有活动 Workspace 资源 adapter",
  "Workspace resource adapter coverage test",
);
requireIncludes(
  workspaceResourceRegistryTestSource,
  "生成与输入顺序无关且内容敏感的 root manifest",
  "Workspace root manifest test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "允许旧 revision 在目标资源 hash 未变化时安全 rebase",
  "Workspace unrelated-resource rebase test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "跨 Authority 入口并发提交仍按 Workspace revision 串行",
  "Workspace serial queue test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "bootstrap 只生成 revision 1 状态和备份，不修改业务内容",
  "Workspace bootstrap non-mutation test",
);
requireIncludes(
  workspaceAuthorityInstancePolicySource,
  "WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED",
  "Workspace single-instance runtime assertion",
);
requireIncludes(
  workspaceAuthorityInstancePolicySource,
  "fencing-token lease",
  "Workspace multi-instance fencing boundary",
);
requireIncludes(
  workspaceAuthorityInstancePolicyTestSource,
  "拒绝多实例、非法副本数和通用 worker 并发",
  "Workspace single-instance runtime test",
);
requireIncludes(
  authorWorkspaceAuthorityBrowserClientSource,
  "sameOriginPath",
  "author-site same-origin Workspace Authority client",
);
requireIncludes(
  authorWorkspaceAuthorityBrowserClientSource,
  "/api/workspace-authority/",
  "author-site same-origin Workspace Authority path",
);
requireIncludes(
  authorWorkspaceAuthorityBrowserClientTestSource,
  "只访问 author-site 同源代理，不暴露 agent-service 地址",
  "author-site same-origin Workspace Authority client test",
);
requireIncludes(
  authorWorkspaceAuthorityProxySource,
  "getEditSession",
  "author-site Workspace Authority proxy Session validation",
);
requireIncludes(
  authorWorkspaceAuthorityProxySource,
  "getServerAgentServiceUrl",
  "author-site Workspace Authority proxy internal service boundary",
);
requireIncludes(
  authorWorkspaceAuthorityProxyTestSource,
  "校验登录 Session 后代理 read 且不接受任意内部路径",
  "author-site Workspace Authority proxy guard test",
);
requireIncludes(
  projectCliWorkspaceAuthorityClientSource,
  "class ProjectWorkspaceAuthorityClient",
  "project CLI typed Workspace Authority client",
);
requireIncludes(
  projectCliWorkspaceAuthorityClientSource,
  "ProjectWorkspaceAuthorityClientError",
  "project CLI stable Workspace Authority error client",
);
requireIncludes(
  projectCliWorkspaceAuthorityClientTestSource,
  "WORKSPACE_RESOURCE_CONFLICT",
  "project CLI typed Workspace Authority client error test",
);
requireIncludes(
  workspaceAuthoritySource,
  "getHealth(projectId: string, workspaceId: string)",
  "workspace authority health status",
);
requireIncludes(
  workspaceAuthoritySource,
  "queueDepth",
  "workspace authority health queue depth",
);
requireIncludes(
  workspaceAuthoritySource,
  "preparedCount",
  "workspace authority health prepared transaction count",
);
requireIncludes(
  workspaceAuthoritySource,
  "externalDrift",
  "workspace authority health external drift status",
);
requireIncludes(
  workspaceAuthoritySource,
  "persistCommittedBackups",
  "workspace authority committed backup persistence",
);
requireIncludes(
  workspaceAuthoritySource,
  "reconcileRestore(projectId: string, workspaceId: string)",
  "workspace authority reconcile restore",
);
requireIncludes(
  workspaceAuthoritySource,
  "WORKSPACE_AUTHORITY_BACKUP_MISSING",
  "workspace authority missing backup fail closed",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/health",
  "workspace authority health route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "getAuthorityHealth",
  "workspace authority health route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "/api/workspace-authority/projects/:projectId/workspaces/:workspaceId/reconcile/restore",
  "workspace authority reconcile restore route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "/resources/*",
  "workspace authority resource read route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "/events",
  "workspace authority catch-up route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "/stream",
  "workspace authority revision stream route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "/projection-acks",
  "workspace authority projection query route",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "workspace_revision_gap",
  "workspace authority stream gap detection",
);
requireIncludes(
  workspaceAuthorityRouteSource,
  "isWorkspaceAuthorityApiErrorCode",
  "workspace authority stable error mapping",
);
requireIncludes(
  workspaceAuthorityRouteTestSource,
  "鉴权后提供 state、resource、mutation catch-up 和 projection ack 查询",
  "workspace authority authenticated API test",
);
requireIncludes(
  workspaceAuthorityRouteTestSource,
  "WebSocket 重连先 catch-up，再推送 committed 与 projection 事件",
  "workspace authority reconnect catch-up test",
);
requireIncludes(
  workspaceAuthorityRouteTestSource,
  "workspace_revision_gap",
  "workspace authority stream gap test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "health 只读返回 ready、journal 和 external drift 状态",
  "workspace authority health test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "health 暴露 active lease 和 prepared 事务，供 preflight fail closed",
  "workspace authority health preflight test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "显式 reconcile restore 从 committed backup 恢复并删除漂移新增资源",
  "workspace authority reconcile restore test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "committed backup 缺失时 restore fail closed 且保留外部内容",
  "workspace authority restore missing backup test",
);
requireIncludes(
  opsCliIndexSource,
  "workspace-authority-status <projectId> <workspaceId>",
  "OPS CLI workspace authority status command",
);
requireIncludes(
  opsCliIndexSource,
  "workspaceAuthorityStatus",
  "OPS CLI workspace authority status registration",
);
requireIncludes(
  opsCliIndexSource,
  "workspace-authority-preflight <projectId> <workspaceId>",
  "OPS CLI workspace authority preflight command",
);
requireIncludes(
  opsCliIndexSource,
  "workspaceAuthorityPreflight",
  "OPS CLI workspace authority preflight registration",
);
requireIncludes(
  opsCliIndexSource,
  "workspace-authority-bootstrap <projectId> <workspaceId>",
  "OPS CLI workspace authority bootstrap command",
);
requireIncludes(
  opsCliIndexSource,
  "workspace-authority-reconcile-adopt <projectId> <workspaceId>",
  "OPS CLI workspace authority reconcile adopt command",
);
requireIncludes(
  opsCliIndexSource,
  "workspace-authority-reconcile-restore <projectId> <workspaceId>",
  "OPS CLI workspace authority reconcile restore command",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "/api/workspace-authority/projects/",
  "OPS CLI workspace authority status endpoint",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "external drift detected",
  "OPS CLI workspace authority status warnings",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "passed",
  "OPS CLI workspace authority preflight passed output",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "issues",
  "OPS CLI workspace authority preflight issues output",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "would_bootstrap",
  "OPS CLI workspace authority bootstrap dry-run",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "would_adopt",
  "OPS CLI workspace authority reconcile adopt dry-run",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "reconcile/adopt?sessionId",
  "OPS CLI workspace authority reconcile adopt endpoint",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "reconcile/restore?sessionId",
  "OPS CLI workspace authority reconcile restore endpoint",
);
requireIncludes(
  opsCliWorkspaceAuthoritySource,
  "would_restore",
  "OPS CLI workspace authority reconcile restore dry-run",
);
requireIncludes(
  opsCliWorkspaceAuthorityTestSource,
  "workspaceAuthorityStatus JSON 输出 ready 状态和 warnings",
  "OPS CLI workspace authority status test",
);
requireIncludes(
  opsCliWorkspaceAuthorityTestSource,
  "workspaceAuthorityPreflight JSON 输出 passed 和空 issues",
  "OPS CLI workspace authority preflight pass test",
);
requireIncludes(
  opsCliWorkspaceAuthorityTestSource,
  "workspaceAuthorityPreflight JSON 输出阻断 issues",
  "OPS CLI workspace authority preflight fail test",
);
requireIncludes(
  opsCliWorkspaceAuthorityTestSource,
  "workspaceAuthorityBootstrap 默认 dry-run 不创建 state",
  "OPS CLI workspace authority bootstrap dry-run test",
);
requireIncludes(
  opsCliWorkspaceAuthorityTestSource,
  "workspaceAuthorityReconcileAdopt 加 apply 后调用 adopt POST",
  "OPS CLI workspace authority reconcile adopt apply test",
);
requireIncludes(
  opsCliWorkspaceAuthorityTestSource,
  "workspaceAuthorityReconcileRestore 加 apply 后调用 restore POST",
  "OPS CLI workspace authority reconcile restore apply test",
);
requireIncludes(
  rootPackageSource,
  "workspace-authority:status",
  "root workspace authority status script",
);
requireIncludes(
  rootPackageSource,
  "workspace-authority:preflight",
  "root workspace authority preflight script",
);
requireIncludes(
  rootPackageSource,
  "workspace-authority:bootstrap",
  "root workspace authority bootstrap script",
);
requireIncludes(
  rootPackageSource,
  "workspace-authority:reconcile-adopt",
  "root workspace authority reconcile adopt script",
);
requireIncludes(
  rootPackageSource,
  "workspace-authority:reconcile-restore",
  "root workspace authority reconcile restore script",
);
requireIncludes(
  opsCliReadmeSource,
  "workspace-authority-status <projectId> <workspaceId>",
  "OPS CLI workspace authority status README",
);
requireIncludes(
  opsCliReadmeSource,
  "workspace-authority-preflight <projectId> <workspaceId>",
  "OPS CLI workspace authority preflight README",
);
requireIncludes(
  opsCliReadmeSource,
  "workspace-authority-bootstrap",
  "OPS CLI workspace authority bootstrap README",
);
requireIncludes(
  opsCliReadmeSource,
  "workspace-authority-reconcile-adopt",
  "OPS CLI workspace authority reconcile adopt README",
);
requireIncludes(
  opsCliReadmeSource,
  "workspace-authority-reconcile-restore",
  "OPS CLI workspace authority reconcile restore README",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "LIVE_WORKSPACE_UNREGISTERED",
  "workspace deployment preflight live registration guard",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "WORKSPACE_EXTERNAL_DRIFT",
  "workspace deployment preflight drift guard",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "PREPARED_TRANSACTION",
  "workspace deployment preflight prepared transaction guard",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "COMMITTED_BACKUP_MISSING",
  "workspace deployment preflight backup guard",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "COMPOSE_DATA_DIR_MISMATCH",
  "workspace deployment preflight shared DATA_DIR guard",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "WORKSPACE_AUTHORITY_INSTANCE_POLICY_MISSING",
  "workspace deployment single-instance declaration guard",
);
requireIncludes(
  workspaceDeployPreflightSource,
  "WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED",
  "workspace deployment replica guard",
);
requireIncludes(
  workspaceDeployPreflightTestSource,
  "deploy preflight blocks unregistered live Workspace",
  "workspace deployment preflight registration test",
);
requireIncludes(
  workspaceDeployPreflightTestSource,
  "deploy preflight passes registered clean Workspace and detects drift",
  "workspace deployment preflight drift test",
);
requireIncludes(
  workspaceDeployPreflightTestSource,
  "compose preflight rejects missing policy and agent-service replicas greater than one",
  "workspace deployment replica guard test",
);
requireIncludes(
  deploySource,
  "corepack pnpm check:workspace-authority",
  "deployment old writer static guard",
);
requireIncludes(
  deploySource,
  "corepack pnpm check:workspace-deploy-compose",
  "deployment shared DATA_DIR guard",
);
requireIncludes(
  deploySource,
  "check-workspace-deploy-preflight.mjs",
  "deployment remote Workspace Authority preflight",
);
requireIncludes(
  rootPackageSource,
  "check:workspace-deploy-preflight",
  "root workspace deployment preflight script",
);
requireIncludes(
  rootPackageSource,
  "test:workspace-deploy-preflight",
  "root workspace deployment preflight test script",
);
requireIncludes(
  rootPackageSource,
  "workspace-authority:migrate",
  "root workspace authority migration command",
);
requireIncludes(
  workspaceAuthorityMigrationSource,
  "would_bootstrap",
  "workspace authority migration dry-run",
);
requireIncludes(
  workspaceAuthorityMigrationSource,
  "would_repair_backups",
  "workspace authority migration backup repair dry-run",
);
requireIncludes(
  workspaceAuthorityMigrationSource,
  "options.projectId",
  "workspace authority migration project selector",
);
requireIncludes(
  workspaceAuthorityMigrationSource,
  "options.workspaceId",
  "workspace authority migration workspace selector",
);
requireIncludes(
  workspaceAuthorityMigrationSource,
  "options.all",
  "workspace authority migration all selector",
);
requireIncludes(
  workspaceAuthorityMigrationTestSource,
  "支持 project dry-run 且不写 Authority state",
  "workspace authority migration dry-run test",
);
requireIncludes(
  workspaceAuthorityMigrationTestSource,
  "all apply 幂等建立 state 与 committed backup",
  "workspace authority migration idempotency test",
);
requireIncludes(
  workspaceAuthoritySource,
  "async recover(projectId: string, workspaceId: string)",
  "workspace authority explicit startup recovery",
);
requireIncludes(
  workspaceAuthoritySource,
  "committed_cleanup",
  "workspace authority committed recovery cleanup",
);
requireIncludes(
  workspaceAuthoritySource,
  "removeStagedBinaries(prepared.request)",
  "workspace authority recovered staging cleanup",
);
requireIncludes(
  workspaceAuthoritySource,
  "recoveryPendingCount",
  "workspace authority health recovery count",
);
requireIncludes(
  workspaceAuthoritySource,
  "conflictCount",
  "workspace authority health durable conflict count",
);
requireIncludes(
  workspaceAuthoritySource,
  "eventSubscriberCount",
  "workspace authority health event subscriber count",
);
requireIncludes(
  workspaceAuthoritySource,
  'countJournalRecords(workspaceId, "conflicted")',
  "workspace authority durable conflict health source",
);
requireIncludes(
  workspaceAuthorityStartupRecoverySource,
  "discoverLiveWorkspaces",
  "workspace authority startup live scan",
);
requireIncludes(
  workspaceAuthorityStartupRecoverySource,
  "skippedUnregisteredCount",
  "workspace authority startup no implicit bootstrap",
);
requireIncludes(
  workspaceAuthorityStartupRecoverySource,
  "await authority.recover",
  "workspace authority startup recovery barrier",
);
requireIncludes(
  workspaceAuthorityDiagnosticsSource,
  "workspace.mutation_recovered",
  "workspace authority recovered diagnostic",
);
for (const field of [
  "projectId",
  "workspaceId",
  "sessionId",
  "mutationId",
  "baseRevision",
  "revision",
  "actor",
  "resourcePaths",
  "traceId",
  "durationMs",
]) {
  requireIncludes(
    workspaceAuthorityDiagnosticsSource,
    field,
    `workspace authority required diagnostic field ${field}`,
  );
}
for (const eventType of [
  "workspace.mutation_received",
  "workspace.mutation_prepared",
  "workspace.mutation_committed",
  "workspace.mutation_conflicted",
  "workspace.mutation_rolled_back",
  "workspace.mutation_recovered",
]) {
  requireIncludes(
    workspaceAuthorityDiagnosticsSource,
    eventType,
    `workspace authority diagnostic ${eventType}`,
  );
  requireIncludes(
    sharedDiagnosticsSource,
    `\"${eventType}\"`,
    `workspace authority diagnostic allowlist ${eventType}`,
  );
}
requireIncludes(
  sharedDiagnosticsSource,
  '"workspace.mutation_recovered"',
  "workspace recovered diagnostic payload allowlist",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "mutation 诊断从 received 串到 committed，不记录源码",
  "workspace authority mutation lifecycle diagnostics test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "apply 中途失败回滚后记录 workspace.mutation_rolled_back",
  "workspace authority mutation rollback diagnostic test",
);
requireIncludes(
  workspaceAuthorityTestSource,
  "health 持久统计 mutation 并暴露 committed event 订阅者数",
  "workspace authority health conflict and subscriber test",
);
requireIncludes(
  workspaceAuthorityStartupRecoveryTestSource,
  "监听服务前主动回滚无 receipt 的 prepared mutation 并写诊断",
  "workspace authority startup rollback test",
);
requireIncludes(
  workspaceAuthorityStartupRecoveryTestSource,
  "receipt 与 state 已提交时只清理 prepared，不回滚业务内容",
  "workspace authority startup committed cleanup test",
);
requireIncludes(
  workspaceAuthorityStartupRecoveryTestSource,
  "stale lease 使启动恢复失败并保持 failed 状态",
  "workspace authority startup lease failure test",
);
requireIncludes(
  workspaceAuthorityStartupRecoveryTestSource,
  "孤立 Authority state 没有 live Workspace 时阻止启动",
  "workspace authority orphan state startup failure test",
);
for (const eventType of [
  "workspace.projection_applied",
  "workspace.projection_gap_detected",
  "workspace.projection_failed",
]) {
  requireIncludes(
    workspaceAuthorityDiagnosticsSource,
    eventType,
    `workspace projection diagnostic ${eventType}`,
  );
  requireIncludes(
    sharedDiagnosticsSource,
    `"${eventType}"`,
    `workspace projection diagnostic allowlist ${eventType}`,
  );
}
requireIncludes(
  workspaceAuthorityTestSource,
  "projection ack 记录 applied，落后 Authority revision 时另记 gap_detected",
  "workspace projection applied and gap diagnostic test",
);
requireBefore(
  agentServiceServerSource,
  "await recoverWorkspaceAuthoritiesOnStartup",
  "await registerRoutes",
  "agent-service startup recovery barrier",
);
requireBefore(
  agentServiceServerSource,
  "await recoverWorkspaceAuthoritiesOnStartup",
  "await fastify.listen",
  "agent-service startup recovery before listen",
);
requireIncludes(
  agentServiceServerSource,
  "workspaceAuthorityRecovery: getWorkspaceAuthorityStartupRecoveryStatus()",
  "agent-service health startup recovery summary",
);
requireIncludes(
  opsCliDiagnosticsSource,
  "WORKSPACE_FLOW_GROUPS",
  "diagnostics correlated autosave collab preview groups",
);
requireIncludes(
  opsCliDiagnosticsSource,
  "mergeEvents(sqlite.events, jsonlEvents",
  "diagnostics SQLite and JSONL correlation",
);
requireIncludes(
  opsCliDiagnosticsSource,
  "buildWorkspaceFlows",
  "diagnostics mutation projection canonical flow summary",
);
requireIncludes(
  opsCliDiagnosticsSource,
  "summarizeDiagnosticPerformance",
  "diagnostics performance percentile summary",
);
for (const metric of [
  "autosaveDebounceWait",
  "queueWait",
  "commitLatency",
  "remoteUpdateLatency",
  "draftPreviewLatency",
  "projectionLatency",
  "reconnectConvergence",
  "canonicalLag",
]) {
  requireIncludes(
    opsCliDiagnosticsSource,
    metric,
    `diagnostics WMA performance metric ${metric}`,
  );
}
requireIncludes(
  opsCliDiagnosticsTestSource,
  "export merges SQLite canonical events with agent-service JSONL mutation spool",
  "diagnostics cross-store flow test",
);
requireIncludes(
  opsCliDiagnosticsTestSource,
  "performance summary emits stable p50 p95 p99 fields for every WMA metric",
  "diagnostics percentile test",
);

const projectCoreSource = read("packages/project-core/src/service.ts");
const projectCoreTestSource = read(
  "packages/project-core/src/__tests__/service.test.ts",
);
const projectCoreTypesSource = read("packages/project-core/src/types.ts");
requireIncludes(
  projectCoreSource,
  "assertTransactionWorkspaceWriteAllowed",
  "project-core live Workspace guard",
);
requireIncludes(
  projectCoreSource,
  "assertWorkspaceWriteAllowed",
  "project-core live Workspace guard",
);
requireIncludes(
  projectCoreSource,
  "WORKSPACE_AUTHORITY_REQUIRED",
  "project-core live Workspace guard",
);
requireIncludes(
  projectCoreSource,
  'metadata?.scope === "live"',
  "project-core live Workspace guard",
);
requireIncludes(
  projectCoreTestSource,
  "拒绝 Project Core 直接写入 live Workspace",
  "project-core live Workspace guard test",
);
requireIncludes(
  projectCoreTestSource,
  'workspaceScope: "live"',
  "project-core live Workspace guard test",
);
requireIncludes(
  projectCoreTestSource,
  "WORKSPACE_AUTHORITY_REQUIRED",
  "project-core live Workspace guard test",
);
requireIncludes(
  projectCoreSource,
  "canonicalSyncedRevision",
  "project-core canonical revision preservation",
);
requireIncludes(
  projectCoreSource,
  "canonicalSyncedRootHash",
  "project-core canonical root hash preservation",
);
requireIncludes(
  projectCoreSource,
  "requireCanonicalWorkspaceProof",
  "project-core canonical proof helper",
);
requireIncludes(
  projectCoreSource,
  "不能${action}",
  "project-core canonical proof guard",
);
requireIncludes(
  projectCoreSource,
  'this.requireCanonicalWorkspaceProof(project, "导出项目包")',
  "project-core export package canonical proof guard",
);
requireIncludes(
  projectCoreSource,
  'this.requireCanonicalWorkspaceProof(project, "保存为模板")',
  "project-core template canonical proof guard",
);
requireIncludes(
  projectCoreSource,
  "workspaceRevision: project.canonicalSyncedRevision",
  "project-core canonical revision binding",
);
requireIncludes(
  projectCoreSource,
  "workspaceRootHash: project.canonicalSyncedRootHash",
  "project-core canonical root hash binding",
);
requireIncludes(
  projectCoreTypesSource,
  "workspaceRevision?: WorkspaceRevision",
  "project-core export package canonical revision contract",
);
requireIncludes(
  projectCoreTypesSource,
  "workspaceRootHash?: string",
  "project-core export package canonical root hash contract",
);
requireIncludes(
  projectCoreTestSource,
  "current-root-hash",
  "project-core canonical root hash preservation test",
);
requireIncludes(
  projectCoreTestSource,
  "导出项目包时要求 active workspace 已同步并返回 workspace revision/rootHash",
  "project-core export package canonical proof test",
);
requireIncludes(
  projectCoreTestSource,
  "保存项目为模板时要求 active workspace 已同步并记录来源 workspace proof",
  "project-core template canonical proof test",
);
const sharedIndexSource = read("packages/shared/src/index.ts");
requireIncludes(
  sharedIndexSource,
  "sourceWorkspaceRevision?: WorkspaceRevision",
  "template canonical revision contract",
);
requireIncludes(
  sharedIndexSource,
  "sourceWorkspaceRootHash?: string",
  "template canonical root hash contract",
);

const projectCoreGuardedOperations = [
  "page_create",
  "page_update",
  "page_update_prototype",
  "page_switch_runtime",
  "page_delete_execute",
  "page_reorder",
  "folder_create",
  "folder_update",
  "folder_delete_execute",
  "config_set_project_schema",
  "config_delete_project_schema",
  "asset_upload",
  "asset_delete_execute",
  "asset_replace",
];
for (const operation of projectCoreGuardedOperations) {
  // Use regex to allow whitespace/newlines between arguments (multi-line calls)
  const escapedOp = operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `assertTransactionWorkspaceWriteAllowed\\s*\\(\\s*transaction\\.data\\s*,\\s*"${escapedOp}"`,
  );
  if (!pattern.test(projectCoreSource)) {
    errors.push(
      `project-core guarded operation ${operation} must include assertTransactionWorkspaceWriteAllowed(transaction.data, "${operation}")`,
    );
  }
}

const projectCliSource = read("packages/project-cli/src/index.ts");
const projectCliTestSource = read("packages/project-cli/src/cli.test.ts");
requireIncludes(
  projectCliSource,
  "new ProjectAdminService(config)",
  "project-cli service boundary",
);
requireIncludes(
  projectCliTestSource,
  "WORKSPACE_AUTHORITY_REQUIRED",
  "project-cli live Workspace guard test",
);
requireIncludes(
  projectCliTestSource,
  "live-blocked",
  "project-cli live Workspace guard test",
);
requireNotMatches(
  projectCliSource,
  /\bfs\.(?:writeFileSync|writeFile|appendFileSync|appendFile|rmSync|rm|renameSync|rename|copyFileSync|copyFile|cpSync|cp)\b/,
  "project-cli source",
  "CLI commands must write project workspaces through ProjectAdminService/project-core guards",
);

const scaffoldSource = read("packages/project-scaffold/src/index.ts");
const scaffoldTestSource = read(
  "packages/project-scaffold/src/scaffold.test.ts",
);
requireIncludes(
  scaffoldSource,
  "service.beginEdit",
  "project-scaffold submit boundary",
);
requireIncludes(
  scaffoldSource,
  "service.commitEdit",
  "project-scaffold submit boundary",
);
requireIncludes(
  scaffoldSource,
  "discardAndFail",
  "project-scaffold submit boundary",
);
requireIncludes(
  scaffoldSource,
  "workspaceRevision: projectPackage.data.workspaceRevision",
  "project-scaffold export canonical revision manifest binding",
);
requireIncludes(
  scaffoldSource,
  "workspaceRootHash: projectPackage.data.workspaceRootHash",
  "project-scaffold export canonical root hash manifest binding",
);
requireIncludes(
  scaffoldSource,
  "workspaceRevision: manifest.workspaceRevision",
  "project-scaffold sync-state canonical revision binding",
);
requireIncludes(
  scaffoldSource,
  "workspaceRootHash: manifest.workspaceRootHash",
  "project-scaffold sync-state canonical root hash binding",
);
requireIncludes(
  scaffoldTestSource,
  "scaffold-root-hash",
  "project-scaffold export canonical proof test",
);
requireIncludes(
  scaffoldTestSource,
  "sourceWorkspaceRootHash",
  "project-scaffold template canonical proof test",
);

const sessionManagerSource = read(
  "packages/author-site/src/lib/session-manager.ts",
);
const sessionManagerTestSource = read(
  "packages/author-site/src/lib/__tests__/session-manager.test.ts",
);
requireMatchCountAtLeast(
  sessionManagerSource,
  /meta\.workspaceId && !isLiveWorkspace\(meta\.workspaceId\)/g,
  3,
  "session-manager live Workspace cleanup guard",
  "session archive/expiration cleanup must never delete live Workspace directories",
);
requireIncludes(
  sessionManagerTestSource,
  "归档 Session 不删除项目级 live workspace",
  "session-manager live Workspace cleanup guard test",
);
requireIncludes(
  sessionManagerTestSource,
  "过期 live workspace 不能同步覆盖项目基准工作区",
  "session-manager live Workspace stale sync guard test",
);

const workspaceFlushSource = read(
  "packages/author-site/src/lib/workspace-flush.ts",
);
const workspaceFlushTestSource = read(
  "packages/author-site/src/lib/__tests__/workspace-flush.test.ts",
);
const workspaceManagerSource = read(
  "packages/author-site/src/lib/workspace-manager.ts",
);
const workspaceManagerTestSource = read(
  "packages/author-site/src/lib/__tests__/workspace-manager.test.ts",
);
const canonicalMaterializerSource = read(
  "packages/author-site/src/lib/canonical-materializer.ts",
);
const sharedWorkspaceSource = read("packages/shared/src/workspace.ts");
const fsUtilsSource = read("packages/author-site/src/lib/fs-utils.ts");
requireIncludes(
  sharedWorkspaceSource,
  "workspaceRevision?: WorkspaceRevision",
  "version history workspace revision binding",
);
requireIncludes(
  sharedWorkspaceSource,
  "workspaceRootHash?: string",
  "version history workspace root hash binding",
);
requireIncludes(
  sharedWorkspaceSource,
  "workspaceRevision?: WorkspaceRevision;",
  "resource version workspace revision binding",
);
requireIncludes(
  sharedWorkspaceSource,
  "workspaceRootHash?: string;",
  "resource version workspace root hash binding",
);
requireIncludes(
  fsUtilsSource,
  "workspaceRevision: consumedWorkspaceRevision",
  "version history workspace revision persistence",
);
requireIncludes(
  fsUtilsSource,
  "workspaceRootHash: consumedWorkspaceRootHash",
  "version history workspace root hash persistence",
);
requireIncludes(
  workspaceFlushSource,
  "getWorkspaceAuthoritySnapshot",
  "workspace-flush canonical drift guard",
);
requireIncludes(
  workspaceFlushSource,
  "isLiveWorkspace(options.workspaceId)",
  "workspace-flush canonical drift guard",
);
requireIncludes(
  workspaceFlushSource,
  "WORKSPACE_EXTERNAL_DRIFT",
  "workspace-flush canonical drift guard",
);
requireIncludes(
  workspaceFlushSource,
  "ensureCanonicalRevision",
  "workspace-flush canonical revision ensure boundary",
);
requireIncludes(
  workspaceFlushSource,
  "materializeCanonicalWorkspace",
  "workspace-flush canonical materializer boundary",
);
requireIncludes(
  workspaceFlushSource,
  "flushResult.revision",
  "workspace-flush canonical target revision boundary",
);
requireIncludes(
  workspaceFlushSource,
  "canonicalRevision: syncMetadata.revision",
  "workspace-flush canonical revision return",
);
requireIncludes(
  workspaceFlushSource,
  "canonicalRootHash: syncMetadata.rootHash",
  "workspace-flush canonical root hash return",
);
requireIncludes(
  workspaceFlushSource,
  "snapshot.state.revision",
  "workspace-flush canonical revision guard",
);
requireIncludes(
  workspaceFlushSource,
  "snapshot.state.rootHash",
  "workspace-flush canonical root hash guard",
);
requireIncludes(
  workspaceFlushSource,
  "ensureCanonicalRevisionUnchanged",
  "workspace-flush post-materialize revision guard",
);
requireIncludes(
  workspaceFlushSource,
  "WORKSPACE_CANONICAL_REVISION_CHANGED_DURING_MATERIALIZE",
  "workspace-flush post-materialize stale guard",
);
requireIncludes(
  workspaceFlushSource,
  "clearCanonicalSyncProofIfMatches",
  "workspace-flush post-materialize stale proof cleanup",
);
requireIncludes(
  workspaceFlushTestSource,
  "blocks canonical sync when Authority detects external drift",
  "workspace-flush canonical drift guard test",
);
requireIncludes(
  workspaceFlushTestSource,
  "does not call Authority snapshot for non-live workspaces",
  "workspace-flush non-live compatibility test",
);
requireIncludes(
  workspaceFlushTestSource,
  "passes Authority revision and root hash into canonical sync",
  "workspace-flush canonical revision guard test",
);
requireIncludes(
  workspaceFlushTestSource,
  "ensureCanonicalRevision rejects a snapshot behind the target revision",
  "workspace-flush canonical target revision guard test",
);
requireIncludes(
  workspaceFlushTestSource,
  "ensureCanonicalRevision rejects same-revision root hash mismatch",
  "workspace-flush canonical target root hash guard test",
);
requireIncludes(
  workspaceFlushTestSource,
  "blocks critical action and clears stale canonical proof when Authority revision changes during canonical materialization",
  "workspace-flush post-materialize stale guard test",
);
requireIncludes(
  workspaceFlushTestSource,
  "clearCanonicalSyncProofIfMatches",
  "workspace-flush post-materialize stale proof cleanup test",
);
requireIncludes(
  workspaceManagerSource,
  "clearCanonicalSyncProofIfMatches",
  "workspace-manager stale canonical proof cleanup helper",
);
requireIncludes(
  workspaceManagerSource,
  "canonicalSyncedWorkspaceId: undefined",
  "workspace-manager stale canonical pointer guard",
);
requireIncludes(
  workspaceManagerSource,
  "canonicalSyncedRevision: metadata?.revision",
  "workspace-manager canonical revision guard",
);
requireIncludes(
  workspaceManagerSource,
  "canonicalSyncedRootHash: metadata?.rootHash",
  "workspace-manager canonical root hash guard",
);
requireIncludes(
  workspaceManagerSource,
  "canonicalSyncedAt: undefined",
  "workspace-manager stale canonical pointer guard",
);
requireIncludes(
  workspaceManagerTestSource,
  "active workspace 过期后创建新 live workspace 时清理旧 canonical sync 指针",
  "workspace-manager stale canonical pointer guard test",
);
requireIncludes(
  workspaceManagerTestSource,
  "canonical 同步成功时记录 Authority revision 和 root hash",
  "workspace-manager canonical revision guard test",
);
for (const eventType of [
  "workspace.canonical_materialization_started",
  "workspace.canonical_materialization_succeeded",
  "workspace.canonical_materialization_failed",
]) {
  requireIncludes(
    workspaceManagerSource,
    eventType,
    `workspace canonical materialization diagnostic ${eventType}`,
  );
  requireIncludes(
    sharedDiagnosticsSource,
    `"${eventType}"`,
    `workspace canonical materialization allowlist ${eventType}`,
  );
}
requireIncludes(
  workspaceManagerTestSource,
  "post-materialize 失败时按匹配 revision/rootHash 清理 stale canonical proof",
  "workspace-manager stale canonical proof cleanup test",
);
requireIncludes(
  workspaceManagerTestSource,
  "post-materialize 失败时不清理已被并发更新的 canonical proof",
  "workspace-manager stale canonical proof concurrency test",
);
requireIncludes(
  canonicalMaterializerSource,
  "materializeCanonicalWorkspace",
  "canonical materializer boundary",
);
requireIncludes(
  canonicalMaterializerSource,
  "syncActiveWorkspaceToCanonical",
  "canonical materializer low-level sync boundary",
);

for (const sourceFile of listSourceFiles("packages/author-site/src")) {
  if (
    sourceFile === "packages/author-site/src/lib/workspace-manager.ts" ||
    sourceFile === "packages/author-site/src/lib/canonical-materializer.ts"
  ) {
    continue;
  }
  const source = read(sourceFile);
  requireNotMatches(
    source,
    /syncActiveWorkspaceToCanonical/,
    sourceFile,
    "business code must use materializeCanonicalWorkspace instead of the low-level canonical sync implementation",
  );
}

const publishRouteSource = read(
  "packages/author-site/src/app/api/projects/[projectId]/publish/route.ts",
);
const publishRouteTestSource = read(
  "packages/author-site/src/app/api/projects/[projectId]/publish/route.test.ts",
);
const publishManagerSource = read(
  "packages/author-site/src/lib/publish-manager.ts",
);
const publishManagerTestSource = read(
  "packages/author-site/src/lib/__tests__/publish-manager-status.test.ts",
);
requireIncludes(
  publishRouteSource,
  "hasCanonicalRevisionMetadata",
  "publish canonical revision precondition",
);
requireIncludes(
  publishRouteSource,
  "canonicalSyncedRootHash",
  "publish canonical root hash precondition",
);
requireIncludes(
  publishRouteSource,
  "workspaceRevision: synced.canonicalRevision",
  "publish route canonical revision binding",
);
requireIncludes(
  publishRouteSource,
  "workspaceRootHash: synced.canonicalRootHash",
  "publish route canonical root hash binding",
);
requireIncludes(
  publishRouteTestSource,
  "无 Session 发布项目工作区时必须已有 canonical revision 和 root hash",
  "publish canonical revision precondition test",
);
requireIncludes(
  publishRouteTestSource,
  "发布前 canonical revision/rootHash 缺失时不会创建发布快照",
  "publish route canonical proof required test",
);
requireIncludes(
  publishManagerSource,
  "workspaceRevision: options?.workspaceRevision",
  "publish snapshot canonical revision persistence",
);
requireIncludes(
  publishManagerSource,
  "workspaceRootHash: options?.workspaceRootHash",
  "publish snapshot canonical root hash persistence",
);
requireIncludes(
  publishManagerTestSource,
  "workspaceRevision: 11",
  "publish snapshot canonical revision persistence test",
);

const checkpointRouteSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/checkpoint/route.ts",
);
const checkpointRouteTestSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/checkpoint/route.test.ts",
);
requireIncludes(
  checkpointRouteSource,
  "synced.canonicalRevision === undefined",
  "checkpoint canonical revision required",
);
requireIncludes(
  checkpointRouteSource,
  "workspaceRevision: synced.canonicalRevision",
  "checkpoint canonical revision binding",
);
requireIncludes(
  checkpointRouteSource,
  "workspaceRootHash: synced.canonicalRootHash",
  "checkpoint canonical root hash binding",
);
requireIncludes(
  checkpointRouteTestSource,
  "canonical revision/rootHash 缺失时不会创建自动检查点版本",
  "checkpoint canonical revision binding test",
);

const sessionSaveRouteSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/save/route.ts",
);
const sessionMergeRouteSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/merge/route.ts",
);
requireIncludes(
  sessionSaveRouteSource,
  "flushAndSyncProjectWorkspace",
  "session save canonical revision binding",
);
requireIncludes(
  sessionSaveRouteSource,
  "revision: synced.canonicalRevision",
  "session save canonical revision binding",
);
requireIncludes(
  sessionSaveRouteSource,
  "rootHash: synced.canonicalRootHash",
  "session save canonical root hash binding",
);
requireIncludes(
  sessionSaveRouteSource,
  "syncedWorkspace",
  "session save canonical proof forwarding",
);
requireIncludes(
  sessionMergeRouteSource,
  "flushAndSyncProjectWorkspace",
  "session merge canonical revision binding",
);
requireIncludes(
  sessionMergeRouteSource,
  "revision: synced.canonicalRevision",
  "session merge canonical revision binding",
);
requireIncludes(
  sessionMergeRouteSource,
  "rootHash: synced.canonicalRootHash",
  "session merge canonical root hash binding",
);
requireIncludes(
  sessionMergeRouteSource,
  "syncedWorkspace",
  "session merge canonical proof forwarding",
);
requireIncludes(
  sessionManagerSource,
  "options?.syncedWorkspace?.workspaceId",
  "session-manager canonical proof forwarding",
);
requireIncludes(
  sessionManagerSource,
  "workspaceRevision: options?.syncedWorkspace?.revision",
  "session-manager canonical revision persistence",
);
requireIncludes(
  sessionManagerSource,
  "workspaceRootHash: options?.syncedWorkspace?.rootHash",
  "session-manager canonical root hash persistence",
);

const resourceVersionCreateRouteSource = read(
  "packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/route.ts",
);
const resourceVersionCreateRouteTestSource = read(
  "packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/route.test.ts",
);
requireIncludes(
  resourceVersionCreateRouteSource,
  "flushAndSyncProjectWorkspace",
  "resource version create canonical proof boundary",
);
requireIncludes(
  resourceVersionCreateRouteSource,
  "workspaceRevision: synced.canonicalRevision",
  "resource version create canonical revision forwarding",
);
requireIncludes(
  resourceVersionCreateRouteSource,
  "workspaceRootHash: synced.canonicalRootHash",
  "resource version create canonical root hash forwarding",
);
requireIncludes(
  resourceVersionCreateRouteTestSource,
  "创建 live 页面资源版本时先同步 canonical proof 并写入版本",
  "resource version create canonical proof test",
);
requireIncludes(
  projectCoreSource,
  "workspaceRevision: input.workspaceRevision",
  "project-core resource version canonical revision persistence",
);
requireIncludes(
  projectCoreSource,
  "workspaceRootHash: input.workspaceRootHash",
  "project-core resource version canonical root hash persistence",
);
requireIncludes(
  projectCoreTestSource,
  "创建页面资源版本时记录 workspace revision/rootHash 并写入 commit audit",
  "project-core resource version canonical proof test",
);
requireIncludes(
  projectCoreTestSource,
  "恢复页面资源版本时记录 restore snapshot 和 commit 的 workspace proof",
  "project-core resource restore canonical proof test",
);

const resourceVersionRestoreRouteSource = read(
  "packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/[versionId]/route.ts",
);
const resourceVersionRestoreRouteTestSource = read(
  "packages/author-site/src/app/api/projects/[projectId]/resources/[kind]/[resourceId]/versions/[versionId]/route.test.ts",
);
requireNotMatches(
  resourceVersionRestoreRouteSource,
  /syncActiveWorkspaceToCanonical/,
  "resource version restore route",
  "resource restore must not reintroduce duplicate canonical sync after restore",
);
requireIncludes(
  resourceVersionRestoreRouteTestSource,
  "非 live Workspace 恢复页面版本时不重复同步 canonical",
  "resource restore duplicate canonical sync guard test",
);
requireIncludes(
  resourceVersionRestoreRouteSource,
  "workspaceRevision: restoreWorkspaceProof?.workspaceRevision",
  "resource restore canonical revision forwarding",
);
requireIncludes(
  resourceVersionRestoreRouteSource,
  "workspaceRootHash: restoreWorkspaceProof?.workspaceRootHash",
  "resource restore canonical root hash forwarding",
);

const canvasLayoutRouteSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.ts",
);
const canvasLayoutRouteTestSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/canvas-layout/route.test.ts",
);
requireIncludes(
  canvasLayoutRouteSource,
  "isLiveWorkspace(access.workspaceId)",
  "canvas-layout live Workspace authority guard",
);
// Yjs-First: canvas-layout POST writes through collab room, not commitWorkspaceMutation
requireIncludes(
  canvasLayoutRouteSource,
  "collab",
  "canvas-layout Yjs-First collab room write guard",
);
requireIncludes(
  canvasLayoutRouteTestSource,
  "保存画布布局时通过 Yjs room 写入 live Workspace",
  "canvas-layout Yjs-First collab room write test",
);
requireIncludes(
  canvasLayoutRouteTestSource,
  "保存非 live 画布布局时写入 workspace 文件且不调用 Authority",
  "canvas-layout non-live compatibility test",
);

const workspaceFileContentRouteSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/workspace/files/[...filePath]/route.ts",
);
const workspaceFileContentRouteTestSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/workspace/files/[...filePath]/route.test.ts",
);
requireIncludes(
  workspaceFileContentRouteSource,
  "isLiveWorkspace(meta.workspaceId)",
  "workspace file content read repair guard",
);
requireIncludes(
  workspaceFileContentRouteSource,
  'relativePath === "memory.md" && !isLiveWorkspace(meta.workspaceId)',
  "workspace file content read repair guard",
);
requireIncludes(
  workspaceFileContentRouteSource,
  "resolveWorkspaceFilePath",
  "workspace file content path traversal guard",
);
requireIncludes(
  workspaceFileContentRouteSource,
  "normalizedRelativePath !== requestedPath",
  "workspace file content path traversal guard",
);
requireIncludes(
  workspaceFileContentRouteSource,
  "author_workspace_file_edit",
  "workspace file content Authority write guard",
);
requireIncludes(
  workspaceFileContentRouteSource,
  "commitWorkspaceMutation",
  "workspace file content Authority write guard",
);
requireIncludes(
  workspaceFileContentRouteTestSource,
  "live Workspace 读取缺失 memory.md 不执行读路径修补写入",
  "workspace file content read repair guard test",
);
requireIncludes(
  workspaceFileContentRouteTestSource,
  "GET 拒绝包含路径回退片段的工作区文件路径",
  "workspace file content path traversal guard test",
);
requireIncludes(
  workspaceFileContentRouteTestSource,
  "PUT 拒绝包含路径回退片段的可编辑文件路径且不提交 Authority",
  "workspace file content path traversal guard test",
);
requireIncludes(
  workspaceFileContentRouteTestSource,
  "PUT 通过 Authority 提交文件修改且不直接写入 workspace 文件",
  "workspace file content Authority write guard test",
);

const assetLocalizeRouteSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/assets/localize/route.ts",
);
const assetLocalizeRouteTestSource = read(
  "packages/author-site/src/app/api/sessions/[sessionId]/assets/localize/route.test.ts",
);
requireIncludes(
  assetLocalizeRouteSource,
  "stageWorkspaceBinary",
  "asset localize Authority binary staging guard",
);
requireIncludes(
  assetLocalizeRouteSource,
  "commitWorkspaceMutation",
  "asset localize Authority mutation guard",
);
requireIncludes(
  assetLocalizeRouteSource,
  "localize_selected_asset",
  "asset localize Authority mutation reason guard",
);
requireIncludes(
  assetLocalizeRouteTestSource,
  "使用浏览器 Blob 通过 Authority 提交 workspace asset 并登记项目图片",
  "asset localize Authority mutation test",
);
requireIncludes(
  assetLocalizeRouteTestSource,
  "expect(fs.writeFileSync).not.toHaveBeenCalled()",
  "asset localize no direct workspace write test",
);

const projectApiSource = read("packages/author-site/src/lib/project-api.ts");
const chatStreamServiceSource = read(
  "packages/author-site/src/components/ai-elements/chat/services/stream-service.ts",
);
const chatStreamHookSource = read(
  "packages/author-site/src/components/ai-elements/chat/hooks/use-chat-stream.ts",
);
const agentClientSource = read("packages/agent-client/src/client.ts");
const agentProjectsRouteSource = read(
  "packages/agent-service/src/routes/projects.ts",
);
const projectWorkspaceManagerSource = read(
  "packages/agent-service/src/workspace/project-workspace-manager.ts",
);
const wsEventRouterSource = read(
  "packages/agent-service/src/routes/ws-event-router.ts",
);
const runLogStoreSource = read(
  "packages/agent-service/src/session/run-log-store.ts",
);
const opsCliTypesSource = read("OPS/CLI/src/types.ts");
const opsCliWebsocketStreamSource = read(
  "OPS/CLI/src/commands/websocket-stream.ts",
);
const contractCheckSource = read("scripts/check-contracts.mjs");
const routeDesignDocSource = read(
  "docs/项目文档/创作端/06-基础设施/技术/01_路由设计.md",
);
const previewMechanismDocSource = read(
  "docs/项目文档/创作端/04-配置与预览/技术/02_实时预览机制.md",
);
const workspaceMigrationDocSource = read(
  "docs/项目文档/创作端/03-项目管理/技术/06_项目工作空间迁移方案.md",
);
const workspaceSessionDocSource = read(
  "docs/项目文档/创作端/03-项目管理/技术/07_工作空间对话解耦.md",
);
requireNotMatches(
  projectApiSource,
  /\/api\/projects\/\$\{projectId\}\/restore/,
  "project-api source",
  "deprecated whole-project restore endpoint no longer exists and bypasses live Workspace Authority",
);
requireNotMatches(
  fsUtilsSource,
  /\bexport function restoreVersion\b/,
  "fs-utils source",
  "deprecated whole-project restore copied snapshots directly into canonical/live Workspace",
);
requireNotMatches(
  agentProjectsRouteSource,
  /\/api\/projects\/:id\/restore/,
  "agent-service project routes",
  "deprecated whole-project restore route bypassed live Workspace Authority",
);
requireNotMatches(
  projectWorkspaceManagerSource,
  /\brestoreVersion\(/,
  "agent-service project workspace manager",
  "deprecated whole-project restore copied snapshots directly into project workspace",
);
requireNotMatches(
  routeDesignDocSource,
  /\/api\/projects\/:id\/restore/,
  "route design doc",
  "project docs must not describe the deprecated whole-project restore route as current",
);
requireNotMatches(
  workspaceMigrationDocSource,
  /fs-utils\.ts:restoreVersion|\bexport function restoreVersion\b|POST \/api\/projects\/\{projectId\}\/versions\/restore/,
  "workspace migration doc",
  "project docs must not preserve the deprecated whole-project restore implementation as current",
);
requireNotMatches(
  previewMechanismDocSource,
  /WebSocket 推送 file_operation 事件|ai-chat\.tsx 接收事件，触发 onFileChange 回调/,
  "preview mechanism doc",
  "project docs must not describe legacy file_operation as the current AI preview refresh path",
);
requireNotMatches(
  workspaceSessionDocSource,
  /\| `syncActiveWorkspaceToCanonical\(projectId, workspaceId\)` \|/,
  "workspace session decoupling doc",
  "project docs must describe the business materializer boundary instead of the low-level canonical sync implementation",
);
requireNotMatches(
  chatStreamServiceSource,
  /["']file_operation["']/,
  "author chat stream service",
  "legacy file_operation events must not drive frontend realtime refresh",
);
requireNotMatches(
  chatStreamServiceSource,
  /\bonFileOperation\b/,
  "author chat stream service",
  "frontend stream handlers must not expose legacy file_operation callbacks",
);
requireNotMatches(
  chatStreamHookSource,
  /\bonFileOperation\b|realtimeFilesRef|processRealtimeFiles|fileUpdateTimer/,
  "author chat stream hook",
  "frontend AI refresh must rely on finish.files or HTTP fallback instead of legacy file_operation buffering",
);
for (const [label, source] of [
  ["agent-client stream contract", agentClientSource],
  ["agent-service websocket event router", wsEventRouterSource],
  ["agent-service run log store", runLogStoreSource],
  ["OPS CLI stream types", opsCliTypesSource],
  ["OPS CLI websocket stream command", opsCliWebsocketStreamSource],
  ["contract check script", contractCheckSource],
]) {
  requireNotMatches(
    source,
    /file_operation|fileOperation/,
    label,
    "legacy file_operation must not remain in public stream contracts, routing, run logs, or CLI output",
  );
}

const workspaceWriteAllowlist = new Map([
  [
    "packages/project-scaffold/src/index.ts",
    "local project package pull/upgrade/submit staging; remote writes go through ProjectAdminService branch edit",
  ],
  [
    "packages/project-scaffold/src/local-preview-dev-server.ts",
    "local preview report output only",
  ],
  [
    "OPS/CLI/src/commands/diagnostics.ts",
    "diagnostics snapshot/export output only",
  ],
  [
    "scripts/build-preview-runtime.mjs",
    "preview runtime build artifacts and temp dir only",
  ],
  ["scripts/dev-restart.mjs", "local dev cache cleanup only"],
  [
    "scripts/local-production-preview.mjs",
    "local standalone preview asset copy only",
  ],
  [
    "scripts/check-workspace-deploy-preflight.test.mjs",
    "isolated temporary deployment-preflight fixtures only",
  ],
  [
    "scripts/development/configure-prototype-canvas-mvp-project.mjs",
    "development fixture input/temp output only",
  ],
  [
    "scripts/development/create-prototype-canvas-mvp-project.mjs",
    "development fixture input/temp output only",
  ],
  [
    "scripts/development/create-prototype-canvas-performance-fixtures.mjs",
    "development fixture input/temp output only",
  ],
  [
    "scripts/development/detect-sync-status-flap.mjs",
    "development report output only",
  ],
  [
    "scripts/development/enhance-prototype-canvas-mvp-project.mjs",
    "development fixture input/temp output only",
  ],
  [
    "scripts/development/knowledge-validation-suite.mjs",
    "development validation fixture output only",
  ],
  [
    "scripts/development/measure-prototype-canvas-performance.mjs",
    "development report output only",
  ],
  [
    "scripts/development/test-ai-workspace-refresh.mjs",
    "development report output only",
  ],
]);

const scannedWriteFiles = [
  ...listSourceFiles("packages/project-scaffold/src"),
  ...listSourceFiles("OPS/CLI/src"),
  ...listSourceFiles("scripts"),
].filter((relativePath) => WRITE_API_PATTERN.test(read(relativePath)));

for (const relativePath of scannedWriteFiles) {
  if (!workspaceWriteAllowlist.has(relativePath)) {
    errors.push(
      `${relativePath} uses local write APIs but is not in workspace write allowlist`,
    );
  }
}

for (const relativePath of workspaceWriteAllowlist.keys()) {
  const source = read(relativePath);
  if (source && !WRITE_API_PATTERN.test(source)) {
    errors.push(
      `${relativePath} is in workspace write allowlist but no longer uses local write APIs`,
    );
  }
}

const bashToolSource = read(
  "packages/agent-service/src/backends/pi-tools/bash-tool.ts",
);
const permissionsSource = read(
  "packages/agent-service/src/backends/pi-tools/permissions.ts",
);
const bashToolTestSource = read(
  "packages/agent-service/tests/unit/bash-tool-live-workspace.test.ts",
);
const piAgentSource = read("packages/agent-service/src/backends/pi-agent.ts");
const piAgentTestSource = read(
  "packages/agent-service/tests/unit/pi-agent.test.ts",
);
const subagentToolSource = read(
  "packages/agent-service/src/backends/pi-tools/subagent-tool.ts",
);
const subagentToolTestSource = read(
  "packages/agent-service/tests/unit/subagent-tool-live-workspace.test.ts",
);
requireIncludes(
  bashToolSource,
  "resolveLiveWorkspaceMutationContext",
  "agent-service live bash guard",
);
requireIncludes(
  bashToolSource,
  "isLiveWorkspaceReadOnlyCommandAllowed",
  "agent-service live bash guard",
);
requireIncludes(
  bashToolSource,
  "WORKSPACE_AUTHORITY_REQUIRED",
  "agent-service live bash guard",
);
requireIncludes(
  permissionsSource,
  "isLiveWorkspaceReadOnlyCommandAllowed",
  "agent-service live bash guard",
);
requireIncludes(
  permissionsSource,
  "hasShellWriteOrCompositionSyntax",
  "agent-service live bash guard",
);
requireIncludes(
  bashToolTestSource,
  "拒绝 live Workspace 下通过 echo 重定向写入",
  "agent-service live bash guard test",
);
requireIncludes(
  bashToolTestSource,
  "拒绝 live Workspace 下执行 node 脚本",
  "agent-service live bash guard test",
);
requireIncludes(
  bashToolTestSource,
  "WORKSPACE_AUTHORITY_REQUIRED",
  "agent-service live bash guard test",
);
requireIncludes(
  subagentToolSource,
  "createDelegateTaskTool",
  "agent-service live subagent guard",
);
requireIncludes(
  piAgentSource,
  "createWorkbenchTools(",
  "agent-service sub-agent uses Authority-managed tools",
);
requireIncludes(
  subagentToolTestSource,
  "live Workspace 下子 Agent 使用 Authority 受管工具委派任务",
  "agent-service live subagent managed tools test",
);
requireNotMatches(
  piAgentSource,
  /emitFileOperations/,
  "pi-agent source",
  "legacy file operation emission switch must not exist in Pi Agent",
);
requireNotMatches(
  piAgentTestSource,
  /file_operation/,
  "pi-agent tests",
  "Pi Agent tests must assert file summaries without retaining legacy file_operation event dependencies",
);

if (errors.length > 0) {
  console.error("Workspace Authority guard check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Workspace Authority guard check passed (${guardedRoutes.length} guarded route entries + project-core live guard + live bash guard + live subagent guard).`,
);
