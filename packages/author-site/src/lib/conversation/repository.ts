import type {
  AppendUserMessageCommand,
  CancelRunAck,
  CommitRunTerminalCommand,
  ConversationDeletionScope,
  AdminConversationFilter,
  AdminConversationListResult,
  AdminConversationProjection,
  ConversationProjection,
  ConversationReliabilitySnapshot,
  ConversationRecord,
  ConversationRunArtifactRecord,
  MessageAcceptedAck,
  RunStartAck,
  RunTerminalAck,
  StartRunCommand,
} from "./domain";

export interface EnsureConversationInput {
  id: string;
  ownerUserId: string;
  projectId: string;
  workspaceId?: string | null;
  title?: string | null;
  now?: number;
}

export interface ConversationOutboxEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: number;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
}

export interface ConversationRepository {
  ensureConversation(input: EnsureConversationInput): ConversationRecord;
  listConversations(ownerUserId: string, projectId: string): ConversationRecord[];
  getProjection(ownerUserId: string, conversationId: string): ConversationProjection;
  listAdminConversations(filter: AdminConversationFilter): AdminConversationListResult;
  getAdminProjection(conversationId: string): AdminConversationProjection;
  listAdminProjectIds(): string[];
  getRunArtifact(
    ownerUserId: string,
    conversationId: string,
    artifactId: string,
    now?: number,
  ): ConversationRunArtifactRecord;
  getReliabilitySnapshot(now?: number, staleRunThresholdMs?: number): ConversationReliabilitySnapshot;
  appendUserMessage(command: AppendUserMessageCommand): MessageAcceptedAck;
  startRun(command: StartRunCommand): RunStartAck;
  commitRunTerminal(command: CommitRunTerminalCommand): RunTerminalAck;
  requestRunCancellation(input: {
    ownerUserId: string;
    conversationId: string;
    runId: string;
    now?: number;
  }): CancelRunAck;
  retryRun(input: {
    ownerUserId: string;
    conversationId: string;
    userMessageId: string;
    now?: number;
  }): MessageAcceptedAck;
  supersede(input: {
    ownerUserId: string;
    conversationId: string;
    afterMessageId: string | null;
    expectedRevision: number;
    now?: number;
  }): ConversationProjection;
  markAttachmentDeleted(input: {
    ownerUserId: string;
    conversationId: string;
    storageRefs: string[];
    now?: number;
  }): number;
  updateTitle(input: {
    ownerUserId: string;
    conversationId: string;
    title: string;
    now?: number;
  }): ConversationRecord;
  deleteConversation(
    ownerUserId: string,
    conversationId: string,
    now?: number,
  ): ConversationDeletionScope;
  deleteExpired(now?: number): ConversationDeletionScope[];
  reconcileInterrupted(startedBefore: number, now?: number): number;
  listPendingOutbox(limit?: number): ConversationOutboxEvent[];
  markOutboxPublished(eventId: string, publishedAt?: number): void;
  markOutboxFailed(eventId: string, error: string): void;
  quickCheck(): boolean;
  backup(destinationPath: string): Promise<void>;
  close(): void;
}
