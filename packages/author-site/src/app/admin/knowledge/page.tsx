"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  FilePlus,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import type { SystemKnowledgeDocument } from "@opencode-workbench/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface ApiResult<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
  summaryResult?: { ok: boolean; message: string };
}

interface FormState {
  id?: string;
  title: string;
  description: string;
  fileName: string;
  category: string;
  tagsText: string;
  content: string;
  enabled: boolean;
  sortOrder: number;
  aiSummary: string;
  aiKeywordsText: string;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  fileName: "",
  category: "通用",
  tagsText: "",
  content: "",
  enabled: true,
  sortOrder: 0,
  aiSummary: "",
  aiKeywordsText: "",
};

function formFromDocument(doc: SystemKnowledgeDocument): FormState {
  return {
    id: doc.id,
    title: doc.title,
    description: doc.description,
    fileName: doc.fileName,
    category: doc.category,
    tagsText: doc.tags.join(", "),
    content: doc.content,
    enabled: doc.enabled,
    sortOrder: doc.sortOrder,
    aiSummary: doc.aiSummary,
    aiKeywordsText: doc.aiKeywords.join(", "),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function AdminKnowledgePage() {
  const [documents, setDocuments] = useState<SystemKnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selected = documents.find((doc) => doc.id === selectedId) || null;

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/knowledge");
      const json = (await res.json()) as ApiResult<SystemKnowledgeDocument[]>;
      if (json.success && json.data) {
        setDocuments(json.data);
        if (!selectedId && json.data[0]) {
          setSelectedId(json.data[0].id);
          setForm(formFromDocument(json.data[0]));
        }
      } else {
        setMessage(json.error?.message || "读取内置知识库失败");
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const filteredDocuments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return documents;
    return documents.filter((doc) =>
      [doc.title, doc.description, doc.category, doc.fileName, ...doc.tags]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [documents, query]);

  const selectDocument = (doc: SystemKnowledgeDocument) => {
    setSelectedId(doc.id);
    setForm(formFromDocument(doc));
    setMessage(null);
  };

  const createNew = () => {
    setSelectedId(null);
    setForm({ ...emptyForm, sortOrder: documents.length });
    setMessage(null);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage("标题和正文必填");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        fileName: form.fileName || undefined,
        content: form.content,
        category: form.category,
        tags: splitList(form.tagsText),
        enabled: form.enabled,
        sortOrder: Number(form.sortOrder) || 0,
        aiSummary: form.aiSummary,
        aiKeywords: splitList(form.aiKeywordsText),
      };
      const res = await fetch(
        selectedId
          ? `/api/admin/knowledge/${encodeURIComponent(selectedId)}`
          : "/api/admin/knowledge",
        {
          method: selectedId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await res.json()) as ApiResult<SystemKnowledgeDocument>;
      if (!json.success || !json.data) {
        setMessage(json.error?.message || "保存失败");
        return;
      }
      setSelectedId(json.data.id);
      setForm(formFromDocument(json.data));
      setMessage(
        json.summaryResult
          ? `保存成功；摘要状态：${json.summaryResult.ok ? "已生成" : json.summaryResult.message}`
          : "保存成功",
      );
      await fetchDocuments();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selectedId || !selected) return;
    if (!confirm(`确定删除「${selected.title}」吗？`)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/knowledge/${encodeURIComponent(selectedId)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as ApiResult<null>;
      if (!json.success) {
        setMessage(json.error?.message || "删除失败");
        return;
      }
      setSelectedId(null);
      setForm(emptyForm);
      setMessage("删除成功");
      await fetchDocuments();
    } finally {
      setSaving(false);
    }
  };

  const regenerateSummary = async () => {
    if (!selectedId) return;
    setRegenerating(true);
    setMessage(null);
    try {
      const res = await fetch(
        `/api/admin/knowledge/${encodeURIComponent(selectedId)}/summary`,
        { method: "POST" },
      );
      const json = (await res.json()) as ApiResult<SystemKnowledgeDocument>;
      if (!json.success || !json.data) {
        setMessage(json.error?.message || "摘要生成失败");
        return;
      }
      setForm(formFromDocument(json.data));
      setMessage(json.summaryResult?.message || "摘要已更新");
      await fetchDocuments();
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-5 text-neutral-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">内置知识库</h2>
          <p className="mt-1 text-sm text-neutral-400">
            管理所有工作空间共享的系统知识与 AI 摘要索引。
          </p>
        </div>
        <Button onClick={createNew} className="gap-2">
          <FilePlus className="h-4 w-4" />
          新建文档
        </Button>
      </div>

      {message && (
        <div className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">
          {message}
        </div>
      )}

      <div className="grid min-h-[720px] grid-cols-[320px_minmax(0,1fr)] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
        <aside className="border-r border-neutral-800">
          <div className="border-b border-neutral-800 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-neutral-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、分类、标签"
                className="h-9 border-neutral-700 bg-neutral-950 pl-8 text-neutral-100"
              />
            </div>
          </div>
          <ScrollArea className="h-[666px]">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-neutral-500" />
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {filteredDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => selectDocument(doc)}
                    className={`block w-full px-3 py-3 text-left transition ${
                      selectedId === doc.id
                        ? "bg-neutral-800"
                        : "hover:bg-neutral-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 shrink-0 text-amber-400" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {doc.title}
                      </span>
                      {!doc.enabled && <Badge variant="outline">停用</Badge>}
                    </div>
                    <div className="mt-1 truncate text-xs text-neutral-500">
                      {doc.fileName}
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Badge variant="secondary">{doc.category}</Badge>
                      <Badge variant="outline">{doc.summaryStatus}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </aside>

        <main className="grid min-w-0 grid-cols-2">
          <section className="space-y-4 border-r border-neutral-800 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>标题</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div>
                <Label>文件名</Label>
                <Input
                  value={form.fileName}
                  onChange={(event) => setForm({ ...form, fileName: event.target.value })}
                  placeholder="保存时自动生成"
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div>
                <Label>分类</Label>
                <Input
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div className="col-span-2">
                <Label>描述</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div>
                <Label>标签</Label>
                <Input
                  value={form.tagsText}
                  onChange={(event) => setForm({ ...form, tagsText: event.target.value })}
                  placeholder="逗号分隔"
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div>
                <Label>关键词</Label>
                <Input
                  value={form.aiKeywordsText}
                  onChange={(event) => setForm({ ...form, aiKeywordsText: event.target.value })}
                  placeholder="AI 生成，可手动修正"
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div>
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })}
                  className="mt-1 border-neutral-700 bg-neutral-950 text-neutral-100"
                />
              </div>
              <div className="flex items-end justify-between rounded-md border border-neutral-800 px-3 py-2">
                <div>
                  <Label>启用</Label>
                  <div className="text-xs text-neutral-500">停用后不进入 AI 索引</div>
                </div>
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <Label>AI 摘要</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={regenerateSummary}
                  disabled={!selectedId || regenerating}
                  className="h-8 gap-2"
                >
                  {regenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  重新生成
                </Button>
              </div>
              <Textarea
                value={form.aiSummary}
                onChange={(event) => setForm({ ...form, aiSummary: event.target.value })}
                placeholder="保存后会自动尝试生成，可手动编辑"
                className="h-24 border-neutral-700 bg-neutral-950 text-neutral-100"
              />
            </div>

            <div>
              <Label>正文 Markdown</Label>
              <Textarea
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
                className="mt-1 h-64 border-neutral-700 bg-neutral-950 font-mono text-sm text-neutral-100"
              />
            </div>

            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={remove}
                disabled={!selectedId || saving}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存
              </Button>
            </div>
          </section>

          <section className="min-w-0 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Markdown 预览</div>
                <div className="text-xs text-neutral-500">
                  索引用摘要字段，正文仅在 AI 按需读取时进入上下文。
                </div>
              </div>
              {selected && <Badge variant="outline">v{selected.version}</Badge>}
            </div>
            <ScrollArea className="h-[640px] rounded-md border border-neutral-800 bg-neutral-950 p-4">
              <div className="markdown-editor-content text-sm text-neutral-100">
                <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
                  {form.content || "（无内容）"}
                </Streamdown>
              </div>
            </ScrollArea>
          </section>
        </main>
      </div>
    </div>
  );
}
