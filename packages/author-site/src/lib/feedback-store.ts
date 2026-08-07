/**
 * 意见反馈存储层
 *
 * 读写 data/feedback/feedback.json。
 */
import fs from "fs";
import path from "path";
import type {
  FeedbackItem,
  FeedbackStoreData,
  FeedbackStatus,
  FeedbackStatusChange,
  FeedbackAuthor,
  FeedbackCategory,
  FeedbackSeverity,
} from "@workbench/shared";
import { FEEDBACK_DIR } from "./paths";

const FEEDBACK_FILENAME = "feedback.json";

function getFeedbackFilePath(): string {
  return path.join(FEEDBACK_DIR, FEEDBACK_FILENAME);
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function readFeedbackStore(): FeedbackStoreData {
  const filePath = getFeedbackFilePath();
  if (!fs.existsSync(filePath)) {
    return { items: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as FeedbackStoreData;
    if (!Array.isArray(data.items)) {
      return { items: [] };
    }
    return data;
  } catch {
    return { items: [] };
  }
}

function writeFeedbackStore(data: FeedbackStoreData): void {
  const filePath = getFeedbackFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export interface ListFeedbackOptions {
  status?: FeedbackStatus;
  category?: FeedbackCategory;
  severity?: FeedbackSeverity;
}

export function listFeedback(options: ListFeedbackOptions = {}): FeedbackItem[] {
  const { items } = readFeedbackStore();
  let result = items;
  if (options.status) {
    result = result.filter((item) => item.status === options.status);
  }
  if (options.category) {
    result = result.filter((item) => item.category === options.category);
  }
  if (options.severity) {
    result = result.filter((item) => item.severity === options.severity);
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function getFeedbackItem(id: string): FeedbackItem | null {
  const { items } = readFeedbackStore();
  return items.find((item) => item.id === id) ?? null;
}

export interface CreateFeedbackInput {
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  tags?: string[];
  title?: string;
  content: string;
  author: FeedbackAuthor;
  channel: "chat" | "manual";
  source: "author-site" | "viewer-site";
  context?: FeedbackItem["context"];
}

export function createFeedback(input: CreateFeedbackInput): FeedbackItem {
  const data = readFeedbackStore();
  const now = Date.now();
  const item: FeedbackItem = {
    id: generateId("fb"),
    category: input.category,
    severity: input.severity,
    tags: input.tags,
    title: input.title,
    content: input.content,
    author: input.author,
    channel: input.channel,
    source: input.source,
    status: "open",
    context: input.context,
    createdAt: now,
    updatedAt: now,
    history: [],
  };
  data.items.push(item);
  writeFeedbackStore(data);
  return item;
}

export function updateFeedbackStatus(
  id: string,
  status: FeedbackStatus,
  actor: FeedbackAuthor,
): FeedbackItem | null {
  const data = readFeedbackStore();
  const item = data.items.find((f) => f.id === id);
  if (!item) return null;

  const change: FeedbackStatusChange = {
    from: item.status,
    to: status,
    actor,
    at: Date.now(),
  };
  item.status = status;
  item.updatedAt = Date.now();
  item.history.push(change);
  writeFeedbackStore(data);
  return item;
}

export function deleteFeedback(id: string): boolean {
  const data = readFeedbackStore();
  const index = data.items.findIndex((f) => f.id === id);
  if (index === -1) return false;
  data.items.splice(index, 1);
  writeFeedbackStore(data);
  return true;
}
