"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bug,
  Lightbulb,
  HelpCircle,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  X,
  Loader2,
  User,
  Bot,
  Globe,
  Pencil,
  Clock,
  AlertTriangle,
  AlertCircle,
  Info,
  Tag,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import {
  listFeedback,
  createFeedback as createFeedbackApi,
} from "@/lib/feedback-api";
import type { FeedbackItem } from "@workbench/shared";
import { getAuthToken, login, setAuthToken } from "@/lib/api";
import { getAnonymousDisplayName, getAnonymousId, setAnonymousDisplayName } from "@/lib/comment-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  bug: <Bug className="h-4 w-4" />,
  suggestion: <Lightbulb className="h-4 w-4" />,
  question: <HelpCircle className="h-4 w-4" />,
  other: <MoreHorizontal className="h-4 w-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "Bug",
  suggestion: "建议",
  question: "疑问",
  other: "其他",
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "text-red-500 bg-red-50",
  medium: "text-amber-500 bg-amber-50",
  low: "text-blue-500 bg-blue-50",
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  high: <AlertTriangle className="h-3 w-3" />,
  medium: <AlertCircle className="h-3 w-3" />,
  low: <Info className="h-3 w-3" />,
};

const SEVERITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const STATUS_LABELS: Record<string, string> = {
  open: "待处理",
  in_progress: "处理中",
  done: "已完成",
};

const STATUS_COLORS: Record<string, string> = {
  open: "text-blue-600 bg-blue-50",
  in_progress: "text-amber-600 bg-amber-50",
  done: "text-green-600 bg-green-50",
};

function FeedbackReportView({ item }: { item: FeedbackItem }) {
  if (!item.report) return null;
  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <div>
        <span className="font-medium text-muted-foreground">背景：</span>
        {item.report.background}
      </div>
      <div>
        <span className="font-medium text-muted-foreground">现象：</span>
        {item.report.symptom}
      </div>
      {item.report.expected && (
        <div>
          <span className="font-medium text-muted-foreground">期望：</span>
          {item.report.expected}
        </div>
      )}
      {item.report.stepsToReproduce && (
        <div>
          <span className="font-medium text-muted-foreground">复现：</span>
          {item.report.stepsToReproduce}
        </div>
      )}
      <div>
        <span className="font-medium text-muted-foreground">AI 判断：</span>
        {item.report.aiAssessment}
      </div>
      {item.report.diagnosticClues && item.report.diagnosticClues.length > 0 && (
        <div>
          <span className="font-medium text-muted-foreground">排查线索：</span>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {item.report.diagnosticClues.map((clue, i) => (
              <li key={i} className="text-muted-foreground">{clue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const isAgent = item.author.isAgent;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {item.title && (
              <h3 className="font-semibold text-sm">{item.title}</h3>
            )}
            <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-border/30">
              {CATEGORY_ICONS[item.category]}
              {CATEGORY_LABELS[item.category] || item.category}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
                SEVERITY_COLORS[item.severity] || "text-muted-foreground bg-muted",
              )}
            >
              {SEVERITY_ICONS[item.severity]}
              {SEVERITY_LABELS[item.severity] || item.severity}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
                STATUS_COLORS[item.status] || "text-muted-foreground bg-muted",
              )}
            >
              {STATUS_LABELS[item.status] || item.status}
            </span>
            {isAgent && (
              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-600">
                <Bot className="h-3 w-3" />
                AI 上报
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              {item.source === "viewer-site" ? (
                <Globe className="h-3 w-3" />
              ) : (
                <Pencil className="h-3 w-3" />
              )}
              {item.source === "viewer-site" ? "浏览端" : "创作端"}
            </span>
          </div>
          <p className="mt-2 text-sm whitespace-pre-wrap">{item.content}</p>
          {item.tags && item.tags.length > 0 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              <Tag className="h-3 w-3 text-muted-foreground" />
              {item.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <FeedbackReportView item={item} />
          {item.context?.projectName && (
            <div className="mt-2 text-xs text-muted-foreground">
              项目：{item.context.projectName}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {isAgent ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
          {item.author.name}
        </span>
        {item.author.contact && (
          <span>联系方式：{item.author.contact}</span>
        )}
        <Clock className="h-3 w-3" />
        <span>{new Date(item.createdAt).toLocaleString("zh-CN")}</span>
      </div>
    </div>
  );
}

function SubmitFeedbackDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [category, setCategory] = useState("bug");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await createFeedbackApi({
        category,
        severity,
        title: title.trim() || undefined,
        content: content.trim(),
        tags: tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean),
        contact: contact.trim() || undefined,
      });
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategory("bug");
    setSeverity("medium");
    setTitle("");
    setContent("");
    setTags("");
    setContact("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>提交反馈</DialogTitle>
          <DialogDescription>
            描述你遇到的问题或建议，我们会尽快处理。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">类别</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="suggestion">建议</SelectItem>
                  <SelectItem value="question">疑问</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">严重程度</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">高</SelectItem>
                  <SelectItem value="medium">中</SelectItem>
                  <SelectItem value="low">低</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">标题（可选）</label>
            <Input
              placeholder="简短概括问题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              内容 <span className="text-destructive">*</span>
            </label>
            <textarea
              placeholder="详细描述问题..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">标签（可选，逗号分隔）</label>
            <Input
              placeholder="如：预览, 保存, 对话"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">姓名（可选）</label>
            <Input
              placeholder="你的姓名，方便后续联系"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !content.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            提交
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackPage() {
  const router = useRouter();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  const fetchData = () => {
    setIsLoading(true);
    listFeedback({
      status: statusFilter !== "all" ? (statusFilter as FeedbackItem["status"]) : undefined,
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      severity: severityFilter !== "all" ? severityFilter : undefined,
    })
      .then(setItems)
      .catch(setError)
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, categoryFilter, severityFilter]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.content.toLowerCase().includes(q) ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        item.author.name.toLowerCase().includes(q) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(q))),
    );
  }, [items, searchQuery]);

  const activeFilters =
    statusFilter !== "all" || categoryFilter !== "all" || severityFilter !== "all";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background">
        <div className="flex h-14 items-center gap-4 px-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-lg font-semibold">意见反馈</h1>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索反馈..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-48 pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                className={cn("h-9 w-28", statusFilter !== "all" && "border-primary")}
              >
                <Filter className="mr-1 h-3.5 w-3.5" />
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="open">待处理</SelectItem>
                <SelectItem value="in_progress">处理中</SelectItem>
                <SelectItem value="done">已完成</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger
                className={cn("h-9 w-24", categoryFilter !== "all" && "border-primary")}
              >
                <SelectValue placeholder="类别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类别</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="suggestion">建议</SelectItem>
                <SelectItem value="question">疑问</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger
                className={cn("h-9 w-28", severityFilter !== "all" && "border-primary")}
              >
                <SelectValue placeholder="严重程度" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部程度</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="low">低</SelectItem>
              </SelectContent>
            </Select>
            {activeFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setCategoryFilter("all");
                  setSeverityFilter("all");
                }}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                清除
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 py-6 max-w-4xl mx-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-20">
            <div className="text-destructive">加载失败：{error.message}</div>
          </div>
        )}

        {!isLoading && !error && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Bug className="mb-4 h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">暂无反馈</p>
          </div>
        )}

        {!isLoading && !error && filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <FeedbackCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6 z-40">
        <Button
          size="icon"
          className="h-12 w-12 rounded-full shadow-lg"
          onClick={() => setShowSubmitDialog(true)}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <SubmitFeedbackDialog
        open={showSubmitDialog}
        onOpenChange={setShowSubmitDialog}
        onSuccess={() => {
          setShowSubmitDialog(false);
          fetchData();
        }}
      />
    </div>
  );
}
