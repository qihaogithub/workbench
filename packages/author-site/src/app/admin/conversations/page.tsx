"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ConversationItem = {
  conversation: {
    id: string;
    projectId: string;
    userId: string;
    status: string;
    updatedAt: number;
    createdAt: number;
  };
  messageCount: number;
  runCount: number;
  lastRunStatus: string | null;
  lastModelId: string | null;
};

type Options = {
  users: Array<{ id: string; username: string; displayName: string }>;
  projects: Array<{ id: string; name: string }>;
};

function inputDate(timestamp: number): string {
  const local = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultRange() {
  const now = Date.now();
  return { from: inputDate(now - 30 * 24 * 60 * 60 * 1000), to: inputDate(now) };
}

export default function AdminConversationsPage() {
  const [initialRange] = useState(() => defaultRange());
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [options, setOptions] = useState<Options>({ users: [], projects: [] });
  const [items, setItems] = useState<ConversationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const userNames = useMemo(
    () => new Map(options.users.map((user) => [user.id, user.displayName || user.username])),
    [options.users],
  );
  const projectNames = useMemo(
    () => new Map(options.projects.map((project) => [project.id, project.name])),
    [options.projects],
  );

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (projectId) query.set("projectId", projectId);
      if (userId) query.set("userId", userId);
      if (from) query.set("from", new Date(from).toISOString());
      if (to) query.set("to", new Date(to).toISOString());
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/admin/conversations?${query}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "加载失败");
      setItems((current) => cursor ? [...current, ...payload.data.items] : payload.data.items);
      setNextCursor(payload.data.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "对话列表不可用");
    } finally {
      setLoading(false);
    }
  }, [from, projectId, to, userId]);

  useEffect(() => {
    void fetch("/api/admin/conversations/options", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload.success) setOptions(payload.data);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    const range = defaultRange();
    setProjectId("");
    setUserId("");
    setFrom(range.from);
    setTo(range.to);
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-neutral-50">用户—Agent 对话记录</h2>
        <p className="mt-2 text-sm text-neutral-400">只读查看最近活动后 30 天内的消息与脱敏运行轨迹。</p>
      </div>

      <div className="grid gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-5 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm text-neutral-300">项目
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2">
            <option value="">全部项目</option>
            {options.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="text-sm text-neutral-300">人员
          <select value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2">
            <option value="">全部人员</option>
            {options.users.map((user) => <option key={user.id} value={user.id}>{user.displayName || user.username}</option>)}
          </select>
        </label>
        <label className="text-sm text-neutral-300">开始时间（含）
          <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" />
        </label>
        <label className="text-sm text-neutral-300">结束时间（不含）
          <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2" />
        </label>
        <div className="flex gap-3 md:col-span-2 xl:col-span-4">
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">应用筛选</button>
          <button type="button" onClick={reset} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300">重置</button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">{error}</div> : null}
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-950 text-neutral-400"><tr><th className="px-4 py-3">最近活动</th><th className="px-4 py-3">项目 / 人员</th><th className="px-4 py-3">消息 / 运行</th><th className="px-4 py-3">最近状态</th><th className="px-4 py-3"><span className="sr-only">操作</span></th></tr></thead>
          <tbody className="divide-y divide-neutral-800">
            {items.map((item) => (
              <tr key={item.conversation.id} className="text-neutral-200">
                <td className="px-4 py-4">{new Date(item.conversation.updatedAt).toLocaleString()}</td>
                <td className="px-4 py-4"><div>{projectNames.get(item.conversation.projectId) ?? item.conversation.projectId}</div><div className="mt-1 text-xs text-neutral-500">{userNames.get(item.conversation.userId) ?? item.conversation.userId}</div></td>
                <td className="px-4 py-4">{item.messageCount} / {item.runCount}</td>
                <td className="px-4 py-4"><span className="rounded-full bg-neutral-800 px-2 py-1 text-xs">{item.lastRunStatus ?? "无运行"}</span></td>
                <td className="px-4 py-4 text-right"><Link className="text-indigo-300 hover:text-indigo-200" href={`/admin/conversations/${encodeURIComponent(item.conversation.id)}`}>查看详情</Link></td>
              </tr>
            ))}
            {!loading && items.length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-neutral-500">当前筛选条件下没有对话</td></tr> : null}
          </tbody>
        </table>
        {loading ? <div className="border-t border-neutral-800 px-4 py-4 text-center text-sm text-neutral-500">正在加载…</div> : null}
      </div>
      {nextCursor ? <button type="button" onClick={() => void load(nextCursor)} disabled={loading} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 disabled:opacity-50">加载下一页</button> : null}
    </section>
  );
}
