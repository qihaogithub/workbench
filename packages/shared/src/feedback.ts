/**
 * 意见反馈功能共享类型定义
 *
 * 反馈 = 用户或 AI 提交的系统问题/建议/疑问报告。
 * 存储于 data/feedback/feedback.json，author-site 与 agent-service 共享读写。
 */

export type FeedbackCategory = "bug" | "suggestion" | "question" | "other";
export type FeedbackSeverity = "high" | "medium" | "low";
export type FeedbackStatus = "open" | "in_progress" | "done";

export interface FeedbackAuthor {
  id: string;
  name: string;
  isAnonymous: boolean;
  isAgent?: boolean;
  contact?: string;
}

export interface FeedbackReport {
  background: string;
  symptom: string;
  expected?: string;
  stepsToReproduce?: string;
  aiAssessment: string;
  diagnosticClues?: string[];
}

export interface FeedbackStatusChange {
  from: FeedbackStatus;
  to: FeedbackStatus;
  actor: FeedbackAuthor;
  at: number;
}

export interface FeedbackItem {
  id: string;
  category: FeedbackCategory;
  severity: FeedbackSeverity;
  tags?: string[];
  title?: string;
  content: string;
  report?: FeedbackReport;
  author: FeedbackAuthor;
  channel: "chat" | "manual";
  source: "author-site" | "viewer-site" | "agent";
  status: FeedbackStatus;
  context?: {
    projectId?: string;
    projectName?: string;
    pageId?: string;
    sessionId?: string;
  };
  createdAt: number;
  updatedAt: number;
  history: FeedbackStatusChange[];
}

export interface FeedbackStoreData {
  items: FeedbackItem[];
}

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  "bug",
  "suggestion",
  "question",
  "other",
];

export const FEEDBACK_SEVERITIES: FeedbackSeverity[] = ["high", "medium", "low"];

export const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "open",
  "in_progress",
  "done",
];
