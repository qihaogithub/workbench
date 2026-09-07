import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { getConversationService } from "@/lib/conversation";
import { queryEditorDiagnosticEvents } from "@/lib/editor-diagnostics/store";
import { createApiError, createApiSuccess } from "@/lib/fs-utils";

const WINDOW_MS = 24 * 60 * 60 * 1000;

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
}

async function diagnosticMetric(successType: string, failureType: string, since: string) {
  const [succeeded, failed] = await Promise.all([
    queryEditorDiagnosticEvents({ eventType: successType, since, limit: 1000 }),
    queryEditorDiagnosticEvents({ eventType: failureType, since, limit: 1000 }),
  ]);
  const successCount = succeeded.events.length;
  const failureCount = failed.events.length;
  const total = successCount + failureCount;
  const durationMs = [...succeeded.events, ...failed.events]
    .map((event) => event.payload.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    successCount,
    failureCount,
    successRate: total > 0 ? successCount / total : null,
    latencyMs: {
      p50: percentile(durationMs, 0.5),
      p95: percentile(durationMs, 0.95),
      p99: percentile(durationMs, 0.99),
    },
    diagnostics: [succeeded.diagnostics, failed.diagnostics],
  };
}

export async function GET(request: Request) {
  if (!(await verifyAdminRequest(request))) {
    return NextResponse.json(createApiError("UNAUTHORIZED", "未授权访问"), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  try {
    const now = Date.now();
    const since = new Date(now - WINDOW_MS).toISOString();
    const [persistence, contextRestore, completeness] = await Promise.all([
      diagnosticMetric("ai.message_persist_succeeded", "ai.message_persist_failed", since),
      diagnosticMetric("ai.context_restore_succeeded", "ai.context_restore_failed", since),
      queryEditorDiagnosticEvents({ since, limit: 1 }),
    ]);
    const diagnosticStates = [
      completeness.diagnostics,
      ...persistence.diagnostics,
      ...contextRestore.diagnostics,
    ];
    const warnings = [...new Set(diagnosticStates.flatMap((item) => item.warnings))];
    return NextResponse.json(createApiSuccess({
      window: { since, until: new Date(now).toISOString(), durationMs: WINDOW_MS },
      ledger: getConversationService().getReliabilitySnapshot(now),
      persistence: {
        successCount: persistence.successCount,
        failureCount: persistence.failureCount,
        successRate: persistence.successRate,
        latencyMs: persistence.latencyMs,
      },
      contextRestore: {
        successCount: contextRestore.successCount,
        failureCount: contextRestore.failureCount,
        successRate: contextRestore.successRate,
        latencyMs: contextRestore.latencyMs,
      },
      diagnostics: {
        sqliteUsed: diagnosticStates.some((item) => item.sqliteUsed),
        jsonlFallbackUsed: diagnosticStates.some((item) => item.jsonlFallbackUsed),
        dbUnavailable: diagnosticStates.some((item) => item.dbUnavailable),
        eventGapDetected: diagnosticStates.some((item) => item.eventGapDetected),
        warnings,
      },
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      createApiError(
        "INTERNAL_ERROR",
        error instanceof Error ? error.message : "可靠性指标不可用",
      ),
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
