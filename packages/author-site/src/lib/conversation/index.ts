import path from "path";
import { getDataDir } from "@/lib/paths";
import { ConversationService } from "./service";
import { SqliteConversationRepository } from "./sqlite-repository";
import { ConversationAnalyticsStore, projectConversationOutbox } from "./analytics-outbox";
import { backupConversationLedger, runConversationRetention } from "./maintenance";
import { deleteConversationChatAttachments } from "@/lib/ai-attachments";

let service: ConversationService | null = null;
let maintenanceInterval: ReturnType<typeof setInterval> | null = null;
let analyticsInterval: ReturnType<typeof setInterval> | null = null;
let analyticsStore: ConversationAnalyticsStore | null = null;

const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_INTERVAL_MS = 30 * 1000;

function startWorkers(conversationService: ConversationService): void {
  const dataDir = getDataDir();
  const configuredBackupKeep = Number(process.env.CONVERSATION_BACKUP_KEEP ?? 7);
  const backupKeep = Number.isFinite(configuredBackupKeep) ? configuredBackupKeep : 7;
  const maintain = async () => {
    try {
      const expired = runConversationRetention({ repository: conversationService.repository });
      for (const scope of expired) {
        try {
          deleteConversationChatAttachments(
            scope.projectId,
            scope.ownerUserId,
            scope.conversationId,
          );
        } catch (error) {
          console.warn("[ConversationLedger] expired attachment cleanup deferred", {
            conversationId: scope.conversationId,
            error,
          });
        }
      }
      await backupConversationLedger({
        repository: conversationService.repository,
        backupDirectory: path.join(dataDir, "conversations", "backups"),
        keep: backupKeep,
      });
    } catch (error) {
      console.warn("[ConversationLedger] maintenance failed", error);
    }
  };
  void maintain();
  maintenanceInterval = setInterval(() => void maintain(), MAINTENANCE_INTERVAL_MS);
  maintenanceInterval.unref?.();

  if (process.env.CONVERSATION_ANALYTICS_ENABLED === "true") {
    analyticsStore = new ConversationAnalyticsStore(
      path.join(dataDir, "conversations", "analytics.db"),
    );
    const project = () => {
      try {
        projectConversationOutbox({
          repository: conversationService.repository,
          analyticsStore: analyticsStore!,
          enabled: true,
        });
      } catch (error) {
        console.warn("[ConversationLedger] analytics projection failed", error);
      }
    };
    project();
    analyticsInterval = setInterval(project, ANALYTICS_INTERVAL_MS);
    analyticsInterval.unref?.();
  }
}

export function getConversationService(): ConversationService {
  if (!service) {
    service = new ConversationService(
      new SqliteConversationRepository(
        path.join(getDataDir(), "conversations", "conversation.db"),
      ),
    );
    startWorkers(service);
  }
  return service;
}

export function closeConversationStoreForTests(): void {
  if (maintenanceInterval) clearInterval(maintenanceInterval);
  if (analyticsInterval) clearInterval(analyticsInterval);
  maintenanceInterval = null;
  analyticsInterval = null;
  analyticsStore?.close();
  analyticsStore = null;
  service?.repository.close();
  service = null;
}

export * from "./domain";
export * from "./analytics-outbox";
export * from "./maintenance";
export * from "./repository";
export * from "./service";
export * from "./sqlite-repository";
