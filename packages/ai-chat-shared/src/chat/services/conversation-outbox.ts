import type { AgentClient, MessageAcceptedAck } from "@workbench/agent-client";
import { ConversationHttpError } from "@workbench/agent-client";

export interface PendingConversationCommand {
  conversationId: string;
  clientMessageId: string;
  content: string;
  displayParts?: unknown[];
  attachmentIds?: string[];
  kind?: string;
  createdAt: number;
}

const DATABASE = "workbench-conversation-outbox";
const STORE = "commands";

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "clientMessageId" });
        store.createIndex("conversation_created", ["conversationId", "createdAt"]);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open conversation outbox"));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (
    store: IDBObjectStore,
    capture: (value: T) => void,
    reject: (reason?: unknown) => void,
  ) => void,
): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    let hasResult = false;
    let result: T;
    const capture = (value: T) => {
      result = value;
      hasResult = true;
    };
    const fail = (reason?: unknown) => {
      db.close();
      reject(reason);
    };
    operation(transaction.objectStore(STORE), capture, fail);
    transaction.oncomplete = () => {
      db.close();
      if (hasResult) resolve(result);
      else reject(new Error("Conversation outbox transaction completed without a result"));
    };
    transaction.onerror = () => fail(transaction.error);
    transaction.onabort = () => fail(transaction.error ?? new Error("Conversation outbox transaction aborted"));
  });
}

export async function enqueueConversationCommand(command: PendingConversationCommand): Promise<void> {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(command);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function removeConversationCommand(clientMessageId: string): Promise<void> {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(clientMessageId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function listConversationCommands(conversationId: string): Promise<PendingConversationCommand[]> {
  return (await transact<PendingConversationCommand[]>("readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(
      (request.result as PendingConversationCommand[])
        .filter((command) => command.conversationId === conversationId)
        .sort((left, right) => left.createdAt - right.createdAt),
    );
    request.onerror = () => reject(request.error);
  })) ?? [];
}

export interface ConversationCommandStore {
  put(command: PendingConversationCommand): Promise<void>;
  remove(clientMessageId: string): Promise<void>;
  list(conversationId: string): Promise<PendingConversationCommand[]>;
}

const indexedDbCommandStore: ConversationCommandStore = {
  put: enqueueConversationCommand,
  remove: removeConversationCommand,
  list: listConversationCommands,
};

export interface SubmitConversationCommandOptions {
  store?: ConversationCommandStore;
  maxAttempts?: number;
  retryDelay?: (delayMs: number) => Promise<void>;
  retainAfterAck?: boolean;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function retryConversationRequest<T>(
  request: () => Promise<T>,
  options: SubmitConversationCommandOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5));
  const retryDelay = options.retryDelay ?? wait;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      const retryable =
        error instanceof ConversationHttpError && error.retryable;
      if (!retryable || attempt === maxAttempts) throw error;
      await retryDelay(250 * 2 ** (attempt - 1));
    }
  }
  throw new Error("Conversation request retry loop exhausted unexpectedly");
}

export async function cancelConversationRun(
  client: AgentClient,
  conversationId: string,
  runId: string,
  options: SubmitConversationCommandOptions = {},
): Promise<unknown> {
  return retryConversationRequest(
    () => client.cancelRun(conversationId, runId),
    options,
  );
}

export async function submitConversationCommand(
  client: AgentClient,
  command: PendingConversationCommand,
  options: SubmitConversationCommandOptions = {},
): Promise<MessageAcceptedAck> {
  const store = options.store ?? indexedDbCommandStore;
  await store.put(command);
  try {
    const ack = await retryConversationRequest(
      () => client.submitMessageCommand(command),
      options,
    );
    if (!options.retainAfterAck) {
      await store.remove(command.clientMessageId);
    }
    return ack;
  } catch (error) {
    const retryable =
      error instanceof ConversationHttpError && error.retryable;
    if (!retryable) {
      await store.remove(command.clientMessageId);
    }
    throw error;
  }
}

export async function flushConversationOutbox(
  client: AgentClient,
  conversationId: string,
  options: SubmitConversationCommandOptions = {},
): Promise<number> {
  const store = options.store ?? indexedDbCommandStore;
  const commands = await store.list(conversationId);
  for (const command of commands) {
    const ack = await submitConversationCommand(client, command, {
      ...options,
      store,
      retainAfterAck: true,
    });
    await cancelConversationRun(client, ack.conversationId, ack.runId, options);
    await store.remove(command.clientMessageId);
  }
  return commands.length;
}
