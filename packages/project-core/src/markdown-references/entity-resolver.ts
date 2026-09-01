import { ResourceDirectory } from "./resource-directory.js";
import type { MarkdownReferenceTarget, ReferencePolicy, ResolvedMarkdownReference } from "./types.js";

export class EntityResolver {
  constructor(private readonly directory: ResourceDirectory, private readonly projectId?: string) {}

  resolve(target: MarkdownReferenceTarget, labelSnapshot = "", policy: ReferencePolicy = {}): ResolvedMarkdownReference {
    const crossProject = this.projectId !== undefined && target.projectId !== this.projectId;
    const allowed = !crossProject && (!policy.allowedTargetKinds || policy.allowedTargetKinds.includes(target.kind));
    const entry = this.directory.resolve(target);
    const targetState = !allowed ? "forbidden" : entry.state ?? "active";
    return { target, labelSnapshot, currentLabel: entry.label || undefined, targetState, clientState: targetState === "active" ? "resolved" : "unavailable" };
  }

  candidates(policy?: ReferencePolicy, query?: string) { return this.directory.list({ sameProjectOnly: true, ...policy }, query); }
}

export function createEntityResolver(directory: ResourceDirectory, projectId?: string): EntityResolver { return new EntityResolver(directory, projectId); }
