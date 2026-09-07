import crypto from "crypto";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import type { ConversationOutboxEvent, ConversationRepository } from "./repository";

const ALLOWED_EVENT_TYPES = new Set([
  "conversation.created",
  "conversation.deleted",
  "message.accepted",
  "run.started",
  "run.terminal",
  "run.retried",
  "conversation.superseded",
]);

const ALLOWED_PAYLOAD_FIELDS = new Set([
  "status",
  "reason",
  "afterSequence",
]);

export interface AnalyticsProjection {
  eventId: string;
  conversationKey: string;
  eventType: string;
  schemaVersion: number;
  occurredAt: number;
  metrics: Record<string, string | number | boolean | null>;
}

function projectEvent(event: ConversationOutboxEvent, salt: string): AnalyticsProjection {
  if (!ALLOWED_EVENT_TYPES.has(event.eventType)) {
    throw new Error(`Unsupported conversation analytics event: ${event.eventType}`);
  }
  const metrics: AnalyticsProjection["metrics"] = {};
  for (const [key, value] of Object.entries(event.payload)) {
    if (!ALLOWED_PAYLOAD_FIELDS.has(key)) continue;
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      metrics[key] = value as string | number | boolean | null;
    }
  }
  return {
    eventId: event.id,
    conversationKey: crypto.createHmac("sha256", salt).update(event.aggregateId).digest("hex"),
    eventType: event.eventType,
    schemaVersion: event.schemaVersion,
    occurredAt: event.createdAt,
    metrics,
  };
}

export class ConversationAnalyticsStore {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath, { timeout: 5_000 });
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_events (
        event_id TEXT PRIMARY KEY,
        conversation_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        occurred_at INTEGER NOT NULL,
        metrics_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversation_events_type_time
        ON conversation_events(event_type, occurred_at);
    `);
  }

  insert(projection: AnalyticsProjection): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO conversation_events
        (event_id,conversation_key,event_type,schema_version,occurred_at,metrics_json)
      VALUES (?,?,?,?,?,?)
    `).run(
      projection.eventId,
      projection.conversationKey,
      projection.eventType,
      projection.schemaVersion,
      projection.occurredAt,
      JSON.stringify(projection.metrics),
    );
  }

  close(): void {
    this.db.close();
  }
}

export function projectConversationOutbox(input: {
  repository: ConversationRepository;
  analyticsStore: ConversationAnalyticsStore;
  enabled?: boolean;
  salt?: string;
  limit?: number;
}): { processed: number; skipped: boolean } {
  const enabled = input.enabled ?? process.env.CONVERSATION_ANALYTICS_ENABLED === "true";
  if (!enabled) return { processed: 0, skipped: true };
  const salt = input.salt ?? process.env.CONVERSATION_ANALYTICS_SALT?.trim();
  if (!salt) throw new Error("CONVERSATION_ANALYTICS_SALT is required when analytics is enabled");
  let processed = 0;
  for (const event of input.repository.listPendingOutbox(input.limit)) {
    try {
      input.analyticsStore.insert(projectEvent(event, salt));
      input.repository.markOutboxPublished(event.id);
      processed += 1;
    } catch (error) {
      input.repository.markOutboxFailed(
        event.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return { processed, skipped: false };
}
