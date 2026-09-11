"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type TraceEvent = { id: string; runId: string; sequence: number; occurredAt: number; source: string; eventType: string; title: string; status?: string; toolName?: string; durationMs?: number; errorCode?: string; summary?: string; metrics?: Record<string, unknown>; files?: Array<{ path: string; action: string }> };
type Projection = {
  conversation: { id: string; projectId: string; userId: string; createdAt: number; updatedAt: number; expiresAt: number };
  messages: Array<{ id: string; role: "user" | "assistant"; content: string; createdAt: number; metadata: Record<string, unknown> }>;
  runs: Array<{ id: string; userMessageId: string; assistantMessageId: string; status: string; modelId: string | null; startedAt: number | null; finishedAt: number | null; errorCode: string | null }>;
  traceEvents: TraceEvent[];
};

const PROBLEM_STATUSES = new Set(["failed", "cancelled", "interrupted", "truncated"]);

export default function AdminConversationDetailPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const [projection, setProjection] = useState<Projection | null>(null);
  const [error, setError] = useState("");
  const tracesByRun = useMemo(() => {
    const grouped = new Map<string, TraceEvent[]>();
    for (const event of projection?.traceEvents ?? []) {
      grouped.set(event.runId, [...(grouped.get(event.runId) ?? []), event]);
    }
    return grouped;
  }, [projection]);
  const runsByUserMessage = useMemo(
    () => new Map((projection?.runs ?? []).map((run) => [run.userMessageId, run])),
    [projection],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/conversations/${encodeURIComponent(conversationId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error?.message || "加载失败");
        setProjection(payload.data);
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "对话详情不可用");
      });
    return () => controller.abort();
  }, [conversationId]);

  if (error) return <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-5 text-red-300">{error}</div>;
  if (!projection) return <div className="text-sm text-neutral-500">正在加载对话详情…</div>;

  const { conversation, messages } = projection;
  return (
    <section className="space-y-6">
      <div><Link href="/admin/conversations" className="text-sm text-indigo-300">← 返回对话列表</Link><h2 className="mt-3 text-2xl font-semibold text-neutral-50">对话详情</h2><p className="mt-2 break-all text-xs text-neutral-500">{conversation.id}</p></div>
      <dl className="grid gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 text-sm md:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-neutral-500">项目</dt><dd className="mt-1 break-all text-neutral-200">{conversation.projectId}</dd></div>
        <div><dt className="text-neutral-500">人员</dt><dd className="mt-1 break-all text-neutral-200">{conversation.userId}</dd></div>
        <div><dt className="text-neutral-500">最近活动</dt><dd className="mt-1 text-neutral-200">{new Date(conversation.updatedAt).toLocaleString()}</dd></div>
        <div><dt className="text-neutral-500">到期时间</dt><dd className="mt-1 text-neutral-200">{new Date(conversation.expiresAt).toLocaleString()}</dd></div>
      </dl>

      <div className="space-y-5">
        {messages.map((message) => {
          const relatedRun = message.role === "user" ? runsByUserMessage.get(message.id) : undefined;
          const trace = relatedRun ? tracesByRun.get(relatedRun.id) ?? [] : [];
          return (
            <article key={message.id} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex items-center justify-between"><span className={message.role === "user" ? "text-sky-300" : "text-emerald-300"}>{message.role === "user" ? "用户" : "Agent"}</span><time className="text-xs text-neutral-500">{new Date(message.createdAt).toLocaleString()}</time></div>
              <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-200">{message.content}</div>
              {relatedRun ? <RunTimeline run={relatedRun} events={trace} /> : null}
            </article>
          );
        })}
        {messages.length === 0 ? <div className="rounded-xl border border-neutral-800 p-10 text-center text-neutral-500">该对话没有可展示消息</div> : null}
      </div>
    </section>
  );
}

function RunTimeline({ run, events }: { run: Projection["runs"][number]; events: TraceEvent[] }) {
  const incomplete = run.status === "interrupted";
  return (
    <div className="mt-5 border-t border-neutral-800 pt-4">
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-neutral-400">运行 {run.modelId ?? "未知模型"}</span><span className={PROBLEM_STATUSES.has(run.status) ? "rounded-full bg-red-950 px-2 py-1 text-red-300" : "rounded-full bg-neutral-800 px-2 py-1 text-neutral-300"}>{run.status}</span>{run.errorCode ? <span className="text-red-300">{run.errorCode}</span> : null}</div>
      {incomplete ? <p className="mt-3 text-sm text-amber-300">运行中断，部分轨迹不可恢复。</p> : null}
      {events.length === 0 ? <p className="mt-3 text-sm text-neutral-500">该运行没有结构化轨迹（可能来自旧版本或进程中断）。</p> : (
        <ol className="mt-4 space-y-2">
          {events.map((event) => {
            const collapsible = event.source === "tool" || event.source === "subagent";
            const content = <TraceContent event={event} />;
            return <li key={event.id}>{collapsible ? <details className="rounded-lg bg-neutral-950 p-3"><summary className="cursor-pointer text-sm text-neutral-300">{event.title} · {event.status ?? event.eventType}</summary><div className="mt-3">{content}</div></details> : <div className={event.eventType === "trace_truncated" ? "rounded-lg border border-amber-800 bg-amber-950/30 p-3" : "rounded-lg bg-neutral-950 p-3"}>{content}</div>}</li>;
          })}
        </ol>
      )}
    </div>
  );
}

function TraceContent({ event }: { event: TraceEvent }) {
  return <div className="text-xs text-neutral-400"><div className="flex flex-wrap gap-2"><span>{new Date(event.occurredAt).toLocaleTimeString()}</span><strong className="font-medium text-neutral-200">{event.title}</strong>{event.status ? <span>{event.status}</span> : null}{event.durationMs !== undefined ? <span>{event.durationMs} ms</span> : null}{event.errorCode ? <span className="text-red-300">{event.errorCode}</span> : null}</div>{event.summary ? <p className="mt-2">{event.summary}</p> : null}{event.metrics ? <p className="mt-2 break-all">指标：{JSON.stringify(event.metrics)}</p> : null}{event.files?.length ? <ul className="mt-2 space-y-1">{event.files.map((file) => <li key={`${file.action}:${file.path}`}><span className="text-neutral-500">{file.action}</span> {file.path}</li>)}</ul> : null}</div>;
}
