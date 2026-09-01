"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Proposal = {
  proposalId: string; proposalVersion: number; status: string;
  summary: { additions: number; deletions: number };
  targets: Array<{ resourcePath: string; diff: { unified: string } }>;
};

export function DocumentProposalReviewDialog({ projectId, sessionId, proposalId, open, onOpenChange, onApplied, beforeApprove }: {
  projectId?: string; sessionId?: string; proposalId: string | null; open: boolean;
  onOpenChange: (open: boolean) => void; onApplied: () => void; beforeApprove?: () => Promise<void>;
}) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approvalKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !projectId || !sessionId || !proposalId) return;
    setLoading(true); setError(null);
    fetch(`/api/projects/${encodeURIComponent(projectId)}/document-proposals/${encodeURIComponent(proposalId)}?sessionId=${encodeURIComponent(sessionId)}`)
      .then(async (response) => ({ response, body: await response.json() }))
      .then(({ response, body }) => { if (!response.ok || !body.success) throw new Error(body.error?.code ?? "加载提案失败"); setProposal(body.data); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "加载提案失败"))
      .finally(() => setLoading(false));
  }, [open, projectId, sessionId, proposalId]);
  useEffect(() => { approvalKeyRef.current = null; }, [proposalId]);
  const submit = async (action: "approve" | "reject") => {
    if (!proposal || !projectId || !sessionId) return;
    setSubmitting(action); setError(null);
    try {
      if (action === "approve") await beforeApprove?.();
      const idempotencyKey = action === "approve"
        ? (approvalKeyRef.current ??= crypto.randomUUID())
        : crypto.randomUUID();
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/document-proposals/${encodeURIComponent(proposal.proposalId)}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, proposalVersion: proposal.proposalVersion, idempotencyKey }) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error?.code ?? "提交失败");
      setProposal(body.data);
      if (action === "approve") { onApplied(); onOpenChange(false); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "提交失败"); }
    finally { setSubmitting(null); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>审核 AI 文档修改</DialogTitle></DialogHeader>{loading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div> : error ? <p className="text-sm text-destructive">{error}</p> : proposal ? <div className="space-y-4"><p className="text-sm text-muted-foreground">{proposal.targets.length} 个文件，<span className="text-emerald-700">+{proposal.summary.additions}</span> / <span className="text-rose-700">-{proposal.summary.deletions}</span></p>{proposal.targets.map((target) => <section key={target.resourcePath} className="overflow-hidden rounded-md border"><div className="border-b bg-muted/40 px-3 py-2 font-mono text-xs">{target.resourcePath}</div><pre className="max-h-72 overflow-auto bg-zinc-950 p-3 text-xs leading-5 text-zinc-100 whitespace-pre-wrap">{target.diff.unified}</pre></section>)}<div className="flex justify-end gap-2"><Button variant="outline" disabled={submitting !== null || proposal.status !== "awaiting_approval"} onClick={() => void submit("reject")}><X className="mr-1 h-4 w-4" />拒绝</Button><Button disabled={submitting !== null || proposal.status !== "awaiting_approval"} onClick={() => void submit("approve")}>{submitting === "approve" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />}批准并应用</Button></div></div> : null}</DialogContent></Dialog>;
}
