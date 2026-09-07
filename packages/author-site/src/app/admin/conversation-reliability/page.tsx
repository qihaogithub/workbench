"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RateMetric {
  successCount: number;
  failureCount: number;
  successRate: number | null;
  latencyMs: { p50: number | null; p95: number | null; p99: number | null };
}

interface ReliabilityData {
  window: { since: string; until: string; durationMs: number };
  ledger: {
    generatedAt: number;
    terminalCompletenessRate: number | null;
    totals: {
      conversations: number;
      messages: number;
      acceptedUserMessages: number;
      runs: number;
      terminalRuns: number;
      nonterminalRuns: number;
      staleNonterminalRuns: number;
      contextSummaries: number;
      runArtifacts: number;
    };
    runStatus: Record<string, number>;
    outbox: { pending: number; retried: number };
  };
  persistence: RateMetric;
  contextRestore: RateMetric;
  diagnostics: {
    sqliteUsed: boolean;
    jsonlFallbackUsed: boolean;
    dbUnavailable: boolean;
    eventGapDetected: boolean;
    warnings: string[];
  };
}

function rate(value: number | null): string {
  return value === null ? "暂无样本" : `${(value * 100).toFixed(2)}%`;
}

function latency(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)} ms`;
}

function MetricCard({ title, value, detail, warning = false }: {
  title: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">{title}</p>
        {warning ? <AlertTriangle className="h-4 w-4 text-amber-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">{value}</p>
      <p className="mt-2 text-xs text-neutral-500">{detail}</p>
    </section>
  );
}

export default function ConversationReliabilityPage() {
  const [data, setData] = useState<ReliabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/conversation-reliability", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "指标加载失败");
      setData(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "指标加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6 text-neutral-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-neutral-50">AI 对话可靠性</h2>
          <p className="mt-1 text-sm text-neutral-400">最近 24 小时诊断指标与当前权威账本状态，不包含对话正文。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新
        </Button>
      </div>

      {error && <div className="rounded-lg border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>}
      {loading && !data && <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-12 text-center text-neutral-500">正在读取可靠性快照…</div>}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="消息持久化成功率" value={rate(data.persistence.successRate)} detail={`${data.persistence.successCount} 成功 / ${data.persistence.failureCount} 失败`} warning={(data.persistence.failureCount > 0)} />
            <MetricCard title="Run 终态完整率" value={rate(data.ledger.terminalCompletenessRate)} detail={`${data.ledger.totals.terminalRuns} 终态 / ${data.ledger.totals.terminalRuns + data.ledger.totals.staleNonterminalRuns} 到期样本`} warning={data.ledger.totals.staleNonterminalRuns > 0} />
            <MetricCard title="上下文恢复成功率" value={rate(data.contextRestore.successRate)} detail={`${data.contextRestore.successCount} 成功 / ${data.contextRestore.failureCount} 失败`} warning={data.contextRestore.failureCount > 0} />
            <MetricCard title="诊断完整性" value={data.diagnostics.eventGapDetected ? "存在缺口" : "完整"} detail={data.diagnostics.jsonlFallbackUsed ? "已使用 JSONL fallback/spool" : "SQLite 主库"} warning={data.diagnostics.eventGapDetected || data.diagnostics.dbUnavailable} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-5">
              <h3 className="flex items-center gap-2 font-semibold text-neutral-100"><Clock3 className="h-4 w-4 text-indigo-400" />延迟与队列</h3>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-neutral-500">持久化 P50</dt><dd className="mt-1 text-neutral-100">{latency(data.persistence.latencyMs.p50)}</dd></div>
                <div><dt className="text-neutral-500">持久化 P95</dt><dd className="mt-1 text-neutral-100">{latency(data.persistence.latencyMs.p95)}</dd></div>
                <div><dt className="text-neutral-500">持久化 P99</dt><dd className="mt-1 text-neutral-100">{latency(data.persistence.latencyMs.p99)}</dd></div>
                <div><dt className="text-neutral-500">待投影 outbox</dt><dd className="mt-1 text-neutral-100">{data.ledger.outbox.pending}</dd></div>
                <div><dt className="text-neutral-500">已重试 outbox</dt><dd className="mt-1 text-neutral-100">{data.ledger.outbox.retried}</dd></div>
                <div><dt className="text-neutral-500">超时未终态</dt><dd className="mt-1 text-neutral-100">{data.ledger.totals.staleNonterminalRuns}</dd></div>
              </dl>
            </section>

            <section className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-5">
              <h3 className="flex items-center gap-2 font-semibold text-neutral-100"><Database className="h-4 w-4 text-indigo-400" />账本分布</h3>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {Object.entries(data.ledger.runStatus).map(([status, count]) => (
                  <div key={status} className="rounded-lg bg-neutral-950/70 px-3 py-2"><p className="text-neutral-500">{status}</p><p className="mt-1 text-lg font-medium text-neutral-100">{count}</p></div>
                ))}
              </div>
              <p className="mt-4 text-xs text-neutral-500">{data.ledger.totals.conversations} 个对话 · {data.ledger.totals.messages} 条消息 · {data.ledger.totals.contextSummaries} 份摘要 · {data.ledger.totals.runArtifacts} 个有效产物</p>
            </section>
          </div>

          {data.diagnostics.warnings.length > 0 && (
            <section className="rounded-xl border border-amber-900/60 bg-amber-950/20 p-5">
              <h3 className="font-semibold text-amber-200">诊断警告</h3>
              <ul className="mt-3 space-y-2 text-sm text-amber-300/80">{data.diagnostics.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
