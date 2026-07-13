export interface WorkspaceAuthorityInstancePolicy {
  mode: "single";
  replicaCount: 1;
}

/**
 * WMA-129 intentionally ships in single-instance mode. Per-Workspace leases
 * fail closed when an accidental second process reaches the same DATA_DIR,
 * while this startup assertion rejects any deployment that declares more than
 * one writer. Multi-instance mode requires a durable fencing-token lease and
 * must not be enabled by changing an environment value alone.
 */
export function assertWorkspaceAuthorityInstancePolicy(
  environment: NodeJS.ProcessEnv = process.env,
): WorkspaceAuthorityInstancePolicy {
  const mode = environment.WORKSPACE_AUTHORITY_INSTANCE_MODE ?? "single";
  const replicaSource = environment.WORKSPACE_AUTHORITY_REPLICA_COUNT
    ?? environment.WEB_CONCURRENCY
    ?? "1";
  const replicaCount = Number(replicaSource);

  if (mode !== "single" || !Number.isInteger(replicaCount) || replicaCount !== 1) {
    throw new Error(
      "WORKSPACE_AUTHORITY_MULTI_INSTANCE_UNSUPPORTED: agent-service must run with "
      + "WORKSPACE_AUTHORITY_INSTANCE_MODE=single and WORKSPACE_AUTHORITY_REPLICA_COUNT=1; "
      + "multi-instance writers require a durable fencing-token lease",
    );
  }

  return { mode: "single", replicaCount: 1 };
}
