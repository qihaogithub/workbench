export type KnowledgeSource = "system" | "user";

export type KnowledgeSummaryStatus = "ready" | "stale" | "failed";

export interface SystemKnowledgeDocument {
  id: string;
  title: string;
  description: string;
  fileName: string;
  content: string;
  category: string;
  tags: string[];
  enabled: boolean;
  sortOrder: number;
  version: number;
  contentHash: string;
  aiSummary: string;
  aiKeywords: string[];
  summaryStatus: KnowledgeSummaryStatus;
  summaryError?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  sizeBytes: number;
}

export interface KnowledgeIndexItem {
  id: string;
  title: string;
  source: KnowledgeSource;
  description: string;
  fileName: string;
  addedAt: string;
  updatedAt: string;
  sizeBytes?: number;
  category?: string;
  tags?: string[];
  aiSummary?: string;
  aiKeywords?: string[];
  summaryStatus?: KnowledgeSummaryStatus;
  readonly?: boolean;
}

export interface SystemKnowledgeSnapshot {
  version: number;
  updatedAt: string;
  documents: SystemKnowledgeDocument[];
}
