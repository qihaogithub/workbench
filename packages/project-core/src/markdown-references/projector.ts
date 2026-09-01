import type { MarkdownReferenceSourceDocument, MarkdownReferenceSource } from "./types.js";
import type { MarkdownLinkIndexSnapshot } from "./types.js";
import { SqliteMarkdownReferenceIndex, type IncrementalMarkdownReferenceIndexInput } from "./sqlite-index.js";
import type { ResourceDirectory } from "./resource-directory.js";

/** Minimal durable receipt shape emitted by WorkspaceMutationAuthority. */
export interface MarkdownReferenceCommittedReceipt {
  workspaceId: string;
  mutationId: string;
  revision: number;
  rootHash: string;
}

export interface MarkdownReferenceProjectionInput {
  projectId: string;
  receipt: MarkdownReferenceCommittedReceipt;
  directory: ResourceDirectory;
  documents: readonly MarkdownReferenceSourceDocument[];
  replaceSources?: readonly MarkdownReferenceSource[];
  parse?: IncrementalMarkdownReferenceIndexInput["parse"];
}

export interface MarkdownReferenceCommitSource {
  onCommitted(listener: (event: { type: "workspace_mutation_committed"; receipt: MarkdownReferenceCommittedReceipt & { projectId?: string } }) => void): () => void;
}

export type MarkdownReferenceProjectionLoader = (
  receipt: MarkdownReferenceCommittedReceipt & { projectId?: string },
) => MarkdownReferenceProjectionInput | Promise<MarkdownReferenceProjectionInput | null> | null;

/**
 * Single projector entry point for committed Workspace mutations.  Business
 * save handlers only publish a receipt; this class updates the derived graph
 * with CAS-like revision ordering and can safely be retried.
 */
export class MarkdownReferenceProjector {
  constructor(private readonly index: SqliteMarkdownReferenceIndex) {}

  /**
   * Attach the projector to the Authority committed-event bus. The Authority
   * receipt stream is the durable outbox; the loader reads one consistent
   * snapshot and may return null for mutations that do not touch Markdown
   * sources. Events are serialized so a slow rebuild cannot reorder receipts.
   */
  attach(source: MarkdownReferenceCommitSource, load: MarkdownReferenceProjectionLoader): () => void {
    let chain = Promise.resolve();
    return source.onCommitted((event) => {
      chain = chain.then(async () => {
        const projection = await load(event.receipt);
        if (projection) this.project(projection);
      }).catch(() => {
        // A failed projection remains recoverable from the Authority receipt
        // stream and the explicit rebuild endpoint.
      });
    });
  }

  project(input: MarkdownReferenceProjectionInput): MarkdownLinkIndexSnapshot {
    if (input.receipt.workspaceId !== input.documents[0]?.source.workspaceId && input.documents.length > 0) {
      throw new Error("MARKDOWN_REFERENCE_WORKSPACE_MISMATCH");
    }
    return this.index.updateSources({
      projectId: input.projectId,
      workspaceId: input.receipt.workspaceId,
      authorityMutationId: input.receipt.mutationId,
      authorityRevision: input.receipt.revision,
      authorityRootHash: input.receipt.rootHash,
      directory: input.directory,
      documents: input.documents,
      replaceSources: input.replaceSources,
      parse: input.parse,
    });
  }
}
