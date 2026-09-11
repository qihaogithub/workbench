import type {
  AppendUserMessageCommand,
  CommitRunTerminalCommand,
  StartRunCommand,
} from "./domain";
import type { ConversationRepository, EnsureConversationInput } from "./repository";

export class ConversationService {
  constructor(readonly repository: ConversationRepository) {}

  ensureConversation(input: EnsureConversationInput) {
    return this.repository.ensureConversation(input);
  }

  list(ownerUserId: string, projectId: string) {
    return this.repository.listConversations(ownerUserId, projectId);
  }

  get(ownerUserId: string, conversationId: string) {
    return this.repository.getProjection(ownerUserId, conversationId);
  }

  listForAdmin(filter: Parameters<ConversationRepository["listAdminConversations"]>[0]) {
    return this.repository.listAdminConversations(filter);
  }

  getForAdmin(conversationId: string) {
    return this.repository.getAdminProjection(conversationId);
  }

  listAdminProjectIds() {
    return this.repository.listAdminProjectIds();
  }

  getRunArtifact(ownerUserId: string, conversationId: string, artifactId: string) {
    return this.repository.getRunArtifact(ownerUserId, conversationId, artifactId);
  }

  getReliabilitySnapshot(now?: number, staleRunThresholdMs?: number) {
    return this.repository.getReliabilitySnapshot(now, staleRunThresholdMs);
  }

  appendUserMessage(command: AppendUserMessageCommand) {
    return this.repository.appendUserMessage(command);
  }

  startRun(command: StartRunCommand) {
    return this.repository.startRun(command);
  }

  commitRunTerminal(command: CommitRunTerminalCommand) {
    return this.repository.commitRunTerminal(command);
  }

  requestRunCancellation(input: {
    ownerUserId: string;
    conversationId: string;
    runId: string;
    now?: number;
  }) {
    return this.repository.requestRunCancellation(input);
  }

  retryRun(input: {
    ownerUserId: string;
    conversationId: string;
    userMessageId: string;
    now?: number;
  }) {
    return this.repository.retryRun(input);
  }

  supersede(input: {
    ownerUserId: string;
    conversationId: string;
    afterMessageId: string | null;
    expectedRevision: number;
    now?: number;
  }) {
    return this.repository.supersede(input);
  }

  markAttachmentDeleted(input: {
    ownerUserId: string;
    conversationId: string;
    storageRefs: string[];
    now?: number;
  }) {
    return this.repository.markAttachmentDeleted(input);
  }

  updateTitle(input: {
    ownerUserId: string;
    conversationId: string;
    title: string;
    now?: number;
  }) {
    return this.repository.updateTitle(input);
  }

  delete(ownerUserId: string, conversationId: string) {
    return this.repository.deleteConversation(ownerUserId, conversationId);
  }

  deleteExpired(now?: number) {
    return this.repository.deleteExpired(now);
  }

  reconcileInterrupted(startedBefore: number, now?: number) {
    return this.repository.reconcileInterrupted(startedBefore, now);
  }

  listPendingOutbox(limit?: number) {
    return this.repository.listPendingOutbox(limit);
  }

  markOutboxPublished(eventId: string, publishedAt?: number) {
    this.repository.markOutboxPublished(eventId, publishedAt);
  }

  markOutboxFailed(eventId: string, error: string) {
    this.repository.markOutboxFailed(eventId, error);
  }
}
