"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  GripVertical,
  Star,
  Image as ImageIcon,
  Eye,
  Plus,
  X,
  Sparkles,
  Search,
  Server,
  Key,
  Link2,
  Database,
  Edit3,
  Power,
  Trash2,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type ImageDescriptionConfig,
} from "@/lib/agent-providers";
import type { BackendProvider, BackendProvidersConfig } from "@workbench/shared";

/* ============================================================
   类型定义
   ============================================================ */

interface ProviderFormState {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  modelsText: string;
  defaultModel: string;
  enabled: boolean;
}

interface AvailableModel {
  id: string;
  label: string;
  group: string;
  supportsImages: boolean;
  supportsThinkingDepth: boolean;
}

interface AutoEnableRule {
  type: "prefix" | "nameFilter";
  value: string;
}

interface ModelConfigState {
  enabledModels: string[];
  autoEnableRules: AutoEnableRule[];
  blacklist: string[];
  multimodalModels: string[];
}

interface BackendProvidersSyncStatus {
  dbConfig: {
    exists: boolean;
    updatedAt?: number;
    providerCount: number;
    activeProviderId?: string;
    activeModelId?: string;
  };
  syncState: {
    inProgress: boolean;
    attemptCount: number;
    lastAttemptAt?: number;
    lastSuccessAt?: number;
    lastFailureAt?: number;
    nextRetryAt?: number;
    lastResult?: {
      ok: boolean;
      message: string;
    };
  };
  agentConfig: {
    reachable: boolean;
    providerCount: number;
    activeProviderId?: string;
    activeModelId?: string;
    message?: string;
  };
}

/* ============================================================
   辅助函数
   ============================================================ */

function extractGroup(id: string): string {
  const idx = id.indexOf("/");
  return idx >= 0 ? id.slice(0, idx) : "";
}

function matchesAutoRule(modelId: string, rule: AutoEnableRule): boolean {
  if (rule.type === "prefix") {
    return modelId.startsWith(rule.value);
  }
  const idx = rule.value.indexOf(":");
  if (idx < 0) return false;
  const group = rule.value.slice(0, idx).trim();
  const keyword = rule.value.slice(idx + 1).trim().toLowerCase();
  if (!keyword) return false;
  const modelGroup = extractGroup(modelId);
  if (modelGroup !== group) return false;
  return modelId.toLowerCase().includes(keyword);
}

function providerToForm(p: BackendProvider): ProviderFormState {
  return {
    id: p.id,
    name: p.name,
    baseURL: p.baseURL,
    apiKey: p.apiKey,
    modelsText: p.models.join("\n"),
    defaultModel: p.defaultModel || "",
    enabled: p.enabled !== false,
  };
}

function formToProvider(f: ProviderFormState): BackendProvider {
  return {
    id: f.id.trim(),
    name: f.name.trim() || f.id.trim(),
    baseURL: f.baseURL.trim(),
    apiKey: f.apiKey.trim(),
    models: f.modelsText.split("\n").map((s) => s.trim()).filter(Boolean),
    defaultModel: f.defaultModel.trim() || undefined,
    enabled: f.enabled,
  };
}

const EMPTY_FORM: ProviderFormState = {
  id: "",
  name: "",
  baseURL: "",
  apiKey: "",
  modelsText: "",
  defaultModel: "",
  enabled: true,
};

const EMPTY_CONFIG: ModelConfigState = {
  enabledModels: [],
  autoEnableRules: [],
  blacklist: [],
  multimodalModels: [],
};

const GROUP_COLORS: Record<string, string> = {};
const GROUP_COLOR_LIST = [
  "bg-indigo-600 text-white",
  "bg-emerald-600 text-white",
  "bg-amber-600 text-white",
  "bg-sky-600 text-white",
  "bg-rose-600 text-white",
  "bg-violet-600 text-white",
  "bg-teal-600 text-white",
  "bg-orange-600 text-white",
];
function getGroupColor(group: string): string {
  if (!GROUP_COLORS[group]) {
    const keys = Object.keys(GROUP_COLORS);
    GROUP_COLORS[group] = GROUP_COLOR_LIST[keys.length % GROUP_COLOR_LIST.length];
  }
  return GROUP_COLORS[group];
}

function formatTimestamp(value: number | undefined): string {
  if (!value) return "未记录";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

async function readApiErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message || body?.message || fallback;
  } catch {
    return fallback;
  }
}

/* ============================================================
   主页面
   ============================================================ */

export default function ModelsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "providers");

  const handleTabChange = useCallback(
    (value: string) => {
      setActiveTab(value);
      router.replace(`/admin/models?tab=${value}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-neutral-50">AI 模型管理</h2>
          <p className="text-neutral-400 mt-1 text-sm">
            管理后端供应商和前端模型白名单
          </p>
        </div>
      </div>

      {/* 标签栏 */}
      <div className="flex items-center gap-1 bg-neutral-800 border border-neutral-700 rounded-lg p-1 w-fit">
        <button
          onClick={() => handleTabChange("providers")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "providers"
              ? "bg-neutral-700 text-neutral-50"
              : "text-neutral-400 hover:text-neutral-200",
          )}
        >
          <Server className="h-4 w-4" />
          后端供应商
        </button>
        <button
          onClick={() => handleTabChange("config")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "config"
              ? "bg-neutral-700 text-neutral-50"
              : "text-neutral-400 hover:text-neutral-200",
          )}
        >
          <Sparkles className="h-4 w-4" />
           模型白名单
        </button>
        <button
          onClick={() => handleTabChange("image-desc")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            activeTab === "image-desc"
              ? "bg-neutral-700 text-neutral-50"
              : "text-neutral-400 hover:text-neutral-200",
          )}
        >
          <Eye className="h-4 w-4" />
          识图配置
        </button>
      </div>

      {activeTab === "providers" ? <SuppliersTab /> : activeTab === "image-desc" ? <ImageDescriberTab /> : <ModelConfigTab />}
    </div>
  );
}

/* ============================================================
   供应商管理 Tab
   ============================================================ */

function SuppliersTab() {
  const [providers, setProviders] = useState<BackendProvider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>("");
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<BackendProvidersSyncStatus | null>(null);
  const [pushResult, setPushResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormState>(EMPTY_FORM);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadConfig();
    loadSyncStatus();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/model-config");
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "加载配置失败"));
      }
      const { data } = await res.json();
      setProviders(data.backendProviders?.providers || []);
      setActiveProviderId(data.backendProviders?.activeProviderId || "");
      setActiveModelId(data.backendProviders?.activeModelId || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载配置失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncStatus() {
    try {
      const res = await fetch("/api/admin/backend-providers/sync");
      const body = await res.json();
      if (res.ok && body.success) {
        setSyncStatus(body.data);
      }
    } catch {
      // 状态读取失败不阻塞配置编辑。
    }
  }

  async function handleRetrySync() {
    try {
      setSyncing(true);
      setError(null);
      setSuccess(null);
      setPushResult(null);

      const res = await fetch("/api/admin/backend-providers/sync", {
        method: "POST",
      });
      const body = await res.json();
      const result = {
        ok: Boolean(body.success),
        message: body.message || (body.success ? "已同步" : "同步失败"),
      };
      setPushResult(result);
      if (body.syncStatus) {
        setSyncStatus(body.syncStatus);
      } else {
        await loadSyncStatus();
      }
      if (result.ok) {
        setSuccess("已同步已保存的供应商配置到 agent-service");
      }
    } catch (err) {
      setPushResult({
        ok: false,
        message: err instanceof Error ? err.message : "同步失败",
      });
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveAndPush() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      setPushResult(null);

      const payload = {
        backendProviders: {
          providers,
          activeProviderId: activeProviderId || undefined,
          activeModelId: activeModelId || undefined,
        } satisfies BackendProvidersConfig,
      };

      const res = await fetch("/api/admin/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || "保存失败");
      }

      if (body.agentPushResult) {
        setPushResult(body.agentPushResult);
        if (body.agentPushResult.ok) {
          setSuccess("配置已保存并同步到 agent-service");
        } else {
          setSuccess("配置已保存，运行时同步失败，系统会自动重试");
        }
      } else {
        // fallback 调用 sync
        try {
          const r = await fetch("/api/admin/backend-providers/sync", {
            method: "POST",
          });
          const j = await r.json();
          setPushResult({
            ok: j.success,
            message: j.message || (j.success ? "已推送" : "推送失败"),
          });
          if (j.success) {
            setSuccess("配置已保存并同步到 agent-service");
          }
        } catch {
          setPushResult({
            ok: false,
            message: "推送失败：无法连接到 agent-service",
          });
        }
      }
      await loadSyncStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const handleAdd = useCallback(() => {
    setIsAdding(true);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleEdit = useCallback((p: BackendProvider) => {
    setIsAdding(false);
    setEditingId(p.id);
    setForm(providerToForm(p));
    setError(null);
    setSuccess(null);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm(`确定删除供应商「${id}」？`)) return;
      setProviders((prev) => prev.filter((p) => p.id !== id));
      if (activeProviderId === id) setActiveProviderId("");
      setPushResult(null);
    },
    [activeProviderId],
  );

  const handleSubmitForm = useCallback(() => {
    if (!form.id.trim()) {
      setError("供应商 ID 必填");
      return;
    }
    if (!form.baseURL.trim()) {
      setError("baseURL 必填");
      return;
    }
    const models = form.modelsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (models.length === 0) {
      setError("至少填写一个模型");
      return;
    }
    if (form.defaultModel && !models.includes(form.defaultModel)) {
      setError("默认模型必须在模型列表中");
      return;
    }

    setError(null);
    const newProvider = formToProvider(form);

    if (isAdding) {
      if (providers.some((p) => p.id === newProvider.id)) {
        setError(`供应商 ID「${newProvider.id}」已存在`);
        return;
      }
      setProviders((prev) => [...prev, newProvider]);
    } else {
      setProviders((prev) =>
        prev.map((p) => (p.id === editingId ? newProvider : p)),
      );
    }

    setIsAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPushResult(null);
  }, [form, isAdding, editingId, providers]);

  const handleCancelForm = useCallback(() => {
    setIsAdding(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }, []);

  const isFormOpen = isAdding || editingId !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        <span className="ml-2 text-neutral-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {syncStatus && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-neutral-50">配置保存与运行时同步</h3>
              <p className="text-sm text-neutral-400 mt-1">
                数据库是配置源，agent-service 使用同步后的运行时配置。
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSyncStatus}
              className="gap-1 bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700"
            >
              <RefreshCw className="h-4 w-4" />
              刷新状态
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="text-xs text-neutral-500 mb-1">数据库保存</div>
              <div className="text-sm font-medium text-neutral-100">
                {syncStatus.dbConfig.exists
                  ? `${syncStatus.dbConfig.providerCount} 个供应商`
                  : "尚未保存供应商"}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {formatTimestamp(syncStatus.dbConfig.updatedAt)}
              </div>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="text-xs text-neutral-500 mb-1">最近同步</div>
              <div
                className={cn(
                  "text-sm font-medium",
                  syncStatus.syncState.lastResult?.ok
                    ? "text-emerald-300"
                    : syncStatus.syncState.lastResult
                      ? "text-amber-300"
                      : "text-neutral-100",
                )}
              >
                {syncStatus.syncState.inProgress
                  ? "同步中"
                  : syncStatus.syncState.lastResult?.message || "未记录"}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {syncStatus.syncState.lastSuccessAt
                  ? `成功: ${formatTimestamp(syncStatus.syncState.lastSuccessAt)}`
                  : syncStatus.syncState.lastFailureAt
                    ? `失败: ${formatTimestamp(syncStatus.syncState.lastFailureAt)}`
                    : "等待首次同步"}
              </div>
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-950/60 p-3">
              <div className="text-xs text-neutral-500 mb-1">agent-service</div>
              <div
                className={cn(
                  "text-sm font-medium",
                  syncStatus.agentConfig.reachable
                    ? "text-emerald-300"
                    : "text-amber-300",
                )}
              >
                {syncStatus.agentConfig.reachable
                  ? `${syncStatus.agentConfig.providerCount} 个运行时供应商`
                  : "不可达"}
              </div>
              <div className="text-xs text-neutral-500 mt-1 truncate">
                {syncStatus.agentConfig.reachable
                  ? syncStatus.agentConfig.activeProviderId || "未设置激活供应商"
                  : syncStatus.agentConfig.message}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 推送结果 */}
      {pushResult && (
        <div
          className={cn(
            "flex items-start gap-3 p-4 border rounded-lg text-sm",
            pushResult.ok
              ? "bg-emerald-900/40 border-emerald-800 text-emerald-200"
              : "bg-amber-900/40 border-amber-800 text-amber-200",
          )}
        >
          {pushResult.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <strong>agent-service 推送:</strong> {pushResult.message}
            {!pushResult.ok && (
              <button
                onClick={handleRetrySync}
                disabled={syncing}
                className="ml-2 underline hover:no-underline font-medium"
              >
                {syncing ? "同步中..." : "重试同步已保存配置"}
              </button>
            )}
          </div>
          <button
            onClick={() => setPushResult(null)}
            className="shrink-0 text-current opacity-60 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 错误/成功 */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-900/40 border border-red-800 rounded-lg text-sm text-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-900/40 border border-emerald-800 rounded-lg text-sm text-emerald-200">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 全局激活配置 */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-3">
        <h3 className="font-semibold text-neutral-50">默认供应商和模型</h3>
        <p className="text-sm text-neutral-400">
          新建会话时使用此配置，已存在的会话保持原模型直到下次切换。
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">
              激活的供应商
            </label>
            <select
              value={activeProviderId}
              onChange={(e) => setActiveProviderId(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-md text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">（未设置）</option>
              {providers
                .filter((p) => p.enabled !== false)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.id})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">
              激活的模型 (provider/model)
            </label>
            <Input
              value={activeModelId}
              onChange={(e) => setActiveModelId(e.target.value)}
              placeholder="如: jojo/deepseek-v4-flash"
              className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500 focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* 供应商列表 */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h3 className="font-semibold text-neutral-50">
            供应商列表 ({providers.length})
          </h3>
          <Button
            onClick={handleAdd}
            disabled={isFormOpen}
            size="sm"
            className="gap-1 bg-indigo-600 hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            新增供应商
          </Button>
        </div>

        {isFormOpen && (
          <div className="px-5 py-4 bg-neutral-800/50 border-b border-neutral-700 space-y-3">
            <h4 className="font-medium text-neutral-50">
              {isAdding ? "新增供应商" : `编辑供应商: ${editingId}`}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  供应商 ID *
                </label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="如: jojo"
                  disabled={!isAdding}
                  className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
                />
                <p className="text-xs text-neutral-500 mt-1">用作模型 ID 前缀，不可修改</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  展示名
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如: xjjj 中转"
                  className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  baseURL * (OpenAI 兼容格式)
                </label>
                <Input
                  value={form.baseURL}
                  onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                  placeholder="如: https://token.xjjj.co/v1"
                  className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  API Key (留空则使用环境变量)
                </label>
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  模型列表 * (每行一个)
                </label>
                <Textarea
                  value={form.modelsText}
                  onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
                  placeholder="deepseek-v4-flash\ngpt-4\nclaude-3-5-sonnet"
                  rows={5}
                  className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">
                  默认模型 (选填)
                </label>
                <Input
                  value={form.defaultModel}
                  onChange={(e) => setForm({ ...form, defaultModel: e.target.value })}
                  placeholder="留空则取列表第一个"
                  className="bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, enabled: checked })
                    }
                    className="data-[state=checked]:bg-indigo-600"
                  />
                  <span className="text-neutral-300">启用</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={handleCancelForm}
                className="bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700">
                取消
              </Button>
              <Button size="sm" onClick={handleSubmitForm}
                className="bg-indigo-600 hover:bg-indigo-500">
                {isAdding ? "添加到列表" : "保存修改"}
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y divide-neutral-800">
          {providers.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-neutral-500">
              <Server className="h-10 w-10 mx-auto mb-3 text-neutral-600" />
              <p>暂无供应商</p>
              <p className="mt-1">点击「新增供应商」开始配置 AI 后端</p>
            </div>
          ) : (
            providers.map((p) => (
              <SupplierCard
                key={p.id}
                provider={p}
                isActive={activeProviderId === p.id}
                onEdit={() => handleEdit(p)}
                onDelete={() => handleDelete(p.id)}
                disabled={isFormOpen}
              />
            ))
          )}
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center justify-end">
        <Button
          onClick={handleSaveAndPush}
          disabled={saving}
          size="lg"
          className="gap-2 bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          {saving ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Power className="h-5 w-5" />
          )}
          保存并同步到 agent-service
        </Button>
      </div>

      {/* 帮助提示 */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 text-sm text-neutral-400">
        <strong className="text-neutral-300">使用提示:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>点击「保存并同步」后先写入数据库，再推送到 agent-service</li>
          <li>agent-service 暂时不可达时配置仍会保存，后台会自动重试同步</li>
          <li>供应商 ID 决定模型 ID 前缀（如 jojo/deepseek-v4-flash）</li>
          <li>同步成功后，切换到「模型白名单」标签页即可看到新模型</li>
        </ul>
      </div>
    </div>
  );
}

/* ============================================================
   供应商卡片
   ============================================================ */

function SupplierCard({
  provider,
  isActive,
  onEdit,
  onDelete,
  disabled,
}: {
  provider: BackendProvider;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Server className="h-4 w-4 text-neutral-400 shrink-0" />
            <span className="font-medium text-neutral-50">{provider.name}</span>
            <Badge className="text-[10px] h-5 bg-neutral-800 text-neutral-300 border-neutral-700">
              {provider.id}
            </Badge>
            {provider.enabled === false && (
              <Badge className="text-[10px] h-5 bg-neutral-800 text-neutral-500 border-neutral-700">
                已禁用
              </Badge>
            )}
            {isActive && (
              <Badge className="text-[10px] h-5 bg-emerald-600 text-white hover:bg-emerald-500">
                当前激活
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
            <Link2 className="h-3 w-3 shrink-0" />
            <code className="truncate">{provider.baseURL}</code>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 mt-1.5">
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              <Database className="h-3 w-3" />
              <span>{provider.models.length} 个模型</span>
              {provider.defaultModel && (
                <span className="text-neutral-500">
                  · 默认 {provider.defaultModel}
                </span>
              )}
              <span className="text-neutral-600 text-[10px] ml-0.5">
                {expanded ? "▲" : "▼"}
              </span>
            </button>
          </div>
          {expanded && provider.models.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {provider.models.map((m) => (
                <code
                  key={m}
                  className="text-[11px] px-1.5 py-0.5 bg-neutral-800 text-neutral-300 rounded border border-neutral-700"
                >
                  {provider.id}/{m}
                </code>
              ))}
            </div>
          )}
          {provider.apiKey && (
            <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1">
              <Key className="h-3 w-3 shrink-0" />
              <code className="truncate">
                {provider.apiKey.slice(0, 4)}...({provider.apiKey.length})
              </code>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            disabled={disabled}
            className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
          >
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={disabled}
            className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   模型配置 Tab
   ============================================================ */

function ModelConfigTab() {
  const [config, setConfig] = useState<ModelConfigState>(EMPTY_CONFIG);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [newNameFilter, setNewNameFilter] = useState("");

  // 打开标签自动拉取
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    await Promise.all([loadConfig(), fetchAvailableModels()]);
  }

  async function loadConfig() {
    try {
      setLoadingConfig(true);
      setError(null);
      const res = await fetch("/api/admin/model-config");
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "加载配置失败"));
      }
      const { data } = await res.json();
      setConfig({
        enabledModels: data.frontend?.enabledModels || [],
        autoEnableRules: data.frontend?.autoEnableRules || [],
        blacklist: data.frontend?.blacklist || [],
        multimodalModels: data.multimodalModels || [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载配置失败");
    } finally {
      setLoadingConfig(false);
    }
  }

  async function fetchAvailableModels() {
    try {
      setLoadingModels(true);
      setError(null);
      const res = await fetch("/api/admin/available-models");
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || "获取模型列表失败");
      }
      const models: AvailableModel[] = (body.data?.models || []).map(
        (m: {
          id: string;
          label?: string;
          group?: string;
          supportsImages?: boolean;
          supportsThinkingDepth?: boolean;
        }) => ({
          id: m.id,
          label: m.label || m.id,
          group: m.group || extractGroup(m.id),
          supportsImages: m.supportsImages ?? false,
          supportsThinkingDepth: m.supportsThinkingDepth ?? false,
        }),
      );
      setAvailableModels(models);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取模型列表失败");
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const res = await fetch("/api/admin/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontend: {
            enabledModels: config.enabledModels,
            autoEnableRules: config.autoEnableRules,
            blacklist: config.blacklist,
          },
          multimodalModels: config.multimodalModels,
        }),
      });

      if (!res.ok) {
        const { error: apiError } = await res.json();
        throw new Error(apiError?.message || "保存失败");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // 计算已启用 / 未启用列表
  const enabledSet = useMemo(
    () => new Set(config.enabledModels),
    [config.enabledModels],
  );
  const multimodalSet = useMemo(
    () => new Set(config.multimodalModels),
    [config.multimodalModels],
  );

  const modelMap = useMemo(
    () => new Map(availableModels.map((m) => [m.id, m])),
    [availableModels],
  );

  const enabledList = useMemo(() => {
    return config.enabledModels
      .filter((id) => modelMap.has(id))
      .map((id) => modelMap.get(id)!);
  }, [config.enabledModels, modelMap]);

  const disabledList = useMemo(() => {
    const lower = search.toLowerCase();
    return availableModels
      .filter((m) => !enabledSet.has(m.id))
      .filter((m) => {
        if (!lower) return true;
        return (
          m.id.toLowerCase().includes(lower) ||
          m.label.toLowerCase().includes(lower)
        );
      });
  }, [availableModels, enabledSet, search]);

  const multimodalCount = useMemo(() => {
    const autoSet = new Set(
      availableModels.filter((m) => m.supportsImages).map((m) => m.id),
    );
    return config.enabledModels.filter(
      (id) => autoSet.has(id) || multimodalSet.has(id),
    ).length;
  }, [config.enabledModels, multimodalSet, availableModels]);

  const toggleModel = useCallback(
    (id: string, enable: boolean) => {
      setConfig((prev) => {
        if (enable) {
          if (prev.enabledModels.includes(id)) return prev;
          const model = modelMap.get(id);
          const autoMultimodal = model?.supportsImages ?? false;
          const newMultimodal = autoMultimodal
            ? prev.multimodalModels.includes(id)
              ? prev.multimodalModels
              : [...prev.multimodalModels, id]
            : prev.multimodalModels;
          return {
            ...prev,
            enabledModels: [...prev.enabledModels, id],
            multimodalModels: newMultimodal,
          };
        }
        return {
          ...prev,
          enabledModels: prev.enabledModels.filter((m) => m !== id),
          multimodalModels: prev.multimodalModels.filter((m) => m !== id),
        };
      });
    },
    [modelMap],
  );

  const toggleMultimodal = useCallback((id: string, value: boolean) => {
    setConfig((prev) => {
      if (value) {
        if (prev.multimodalModels.includes(id)) return prev;
        return { ...prev, multimodalModels: [...prev.multimodalModels, id] };
      }
      return {
        ...prev,
        multimodalModels: prev.multimodalModels.filter((m) => m !== id),
      };
    });
  }, []);

  const addAutoRule = useCallback(
    (type: "prefix" | "nameFilter", value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setConfig((prev) => ({
        ...prev,
        autoEnableRules: [...prev.autoEnableRules, { type, value: trimmed }],
      }));
    },
    [],
  );

  const removeAutoRule = useCallback((index: number) => {
    setConfig((prev) => ({
      ...prev,
      autoEnableRules: prev.autoEnableRules.filter((_, i) => i !== index),
    }));
  }, []);

  const enableByRule = useCallback(
    (rule: AutoEnableRule) => {
      const toEnable = availableModels.filter(
        (m) => !enabledSet.has(m.id) && matchesAutoRule(m.id, rule),
      );
      if (toEnable.length === 0) return;
      setConfig((prev) => ({
        ...prev,
        enabledModels: [...prev.enabledModels, ...toEnable.map((m) => m.id)],
      }));
    },
    [availableModels, enabledSet],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setConfig((prev) => {
      const oldIndex = prev.enabledModels.indexOf(String(active.id));
      const newIndex = prev.enabledModels.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return {
        ...prev,
        enabledModels: arrayMove(prev.enabledModels, oldIndex, newIndex),
      };
    });
  }, []);

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-neutral-50">模型白名单</h3>
          <p className="text-neutral-400 mt-1 text-sm">
            打开开关启用模型，拖拽已启用的模型排序。第一个启用项即为默认模型。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={fetchAvailableModels}
            disabled={loadingModels}
            size="icon"
            className="bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700"
            title="刷新模型列表"
          >
            <RefreshCw
              className={cn("h-4 w-4", loadingModels && "animate-spin")}
            />
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            保存配置
          </Button>
        </div>
      </div>

      {/* 统计条 */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-400">
        <Badge className="bg-neutral-800 text-neutral-300 border-neutral-700">
          后端可用 {availableModels.length} 个模型
        </Badge>
        <Badge className="bg-indigo-600 text-white hover:bg-indigo-500">
          已启用 {enabledList.length} 个
        </Badge>
        <Badge className="border-neutral-700 text-neutral-400">
          多模态 {multimodalCount} 个
        </Badge>
        <Badge className="border-neutral-700 text-neutral-400">
          自动规则 {config.autoEnableRules.length} 条
        </Badge>
      </div>

      {success && (
        <div className="bg-emerald-900/40 border border-emerald-800 text-emerald-200 px-4 py-3 rounded-lg text-sm">
          配置已保存成功
        </div>
      )}
      {error && (
        <div className="bg-red-900/40 border border-red-800 text-red-200 px-4 py-3 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* 自动启用规则区 */}
      <section className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
        <header className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-400" />
          <div>
            <h3 className="text-lg font-semibold text-neutral-50">自动启用规则</h3>
            <p className="text-sm text-neutral-400 mt-1">
              匹配规则的模型会在后端新增时自动启用。
            </p>
          </div>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          <RuleInput
            label="分组前缀"
            placeholder="如 xjjj/"
            value={newPrefix}
            onChange={setNewPrefix}
            onAdd={() => {
              addAutoRule("prefix", newPrefix);
              setNewPrefix("");
            }}
          />
          <RuleInput
            label="名称过滤器 (分组:关键词)"
            placeholder="如 workbench:Free"
            value={newNameFilter}
            onChange={setNewNameFilter}
            onAdd={() => {
              addAutoRule("nameFilter", newNameFilter);
              setNewNameFilter("");
            }}
          />
        </div>

        {config.autoEnableRules.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {config.autoEnableRules.map((rule, i) => {
              const matchCount = availableModels.filter((m) =>
                matchesAutoRule(m.id, rule),
              ).length;
              return (
                <li
                  key={i}
                  className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-amber-900/30 border border-amber-700/50 text-amber-200 rounded-full text-xs"
                >
                  <span className="font-medium">
                    {rule.type === "prefix" ? "前缀" : "名称"}
                  </span>
                  <code className="bg-amber-800/40 px-1.5 py-0.5 rounded">
                    {rule.value}
                  </code>
                  <span className="text-amber-400">({matchCount})</span>
                  <button
                    onClick={() => enableByRule(rule)}
                    className="px-1.5 py-0.5 text-amber-300 hover:bg-amber-800/50 rounded text-[10px]"
                    title="启用所有匹配模型"
                  >
                    批量启用
                  </button>
                  <button
                    onClick={() => removeAutoRule(i)}
                    className="p-0.5 text-amber-300 hover:bg-amber-800/50 rounded"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 模型列表 */}
      <section className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-50">模型列表</h3>
            <p className="text-sm text-neutral-400 mt-1">
              开关启用模型，已启用的可拖拽排序。第一个启用项为默认模型。
            </p>
          </div>
          <div className="relative w-64">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <Input
              placeholder="搜索模型..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500 focus:border-indigo-500 focus:ring-indigo-500/20"
            />
          </div>
        </header>

        {availableModels.length === 0 ? (
          <div className="text-sm text-neutral-500 py-8 text-center border border-dashed border-neutral-700 rounded-lg">
            {loadingModels ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在拉取模型列表...
              </span>
            ) : (
              <>
                <p className="mb-2">暂无可用模型</p>
                <p>
                  请先在「后端供应商」标签页配置供应商并保存推送，然后点击
                  <RefreshCw className="h-3.5 w-3.5 inline mx-0.5" />
                  刷新按钮获取模型列表
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-lg overflow-hidden max-h-[700px] overflow-y-auto">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={enabledList.map((m) => m.id)}
                strategy={verticalListSortingStrategy}
              >
                {enabledList.map((model, index) => {
                  const isFiltered =
                    search &&
                    !model.id.toLowerCase().includes(search.toLowerCase()) &&
                    !model.label.toLowerCase().includes(search.toLowerCase());
                  if (isFiltered) return null;
                  return (
                    <ModelRow
                      key={model.id}
                      model={model}
                      enabled
                      index={index}
                      isDefault={index === 0}
                      isMultimodal={
                        multimodalSet.has(model.id) || model.supportsImages
                      }
                      autoMultimodal={model.supportsImages}
                      onToggle={(v) => toggleModel(model.id, v)}
                      onToggleMultimodal={(v) => toggleMultimodal(model.id, v)}
                    />
                  );
                })}
              </SortableContext>
            </DndContext>

            {enabledList.length > 0 && disabledList.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-neutral-950/50 border-y border-neutral-800">
                <div className="h-px flex-1 bg-neutral-700" />
                <span className="text-xs text-neutral-500 shrink-0">
                  未启用 ({disabledList.length})
                </span>
                <div className="h-px flex-1 bg-neutral-700" />
              </div>
            )}

            {disabledList.map((model) => {
              const matchedRule = config.autoEnableRules.find((r) =>
                matchesAutoRule(model.id, r),
              );
              return (
                <ModelRow
                  key={model.id}
                  model={model}
                  enabled={false}
                  matchedRule={matchedRule}
                  autoMultimodal={model.supportsImages}
                  onToggle={(v) => toggleModel(model.id, v)}
                  onToggleMultimodal={() => {}}
                />
              );
            })}

            {enabledList.length === 0 && disabledList.length === 0 && (
              <div className="text-sm text-neutral-500 py-8 text-center">
                没有匹配搜索的模型
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   模型行
   ============================================================ */

function ModelRow({
  model,
  enabled,
  index,
  isDefault,
  isMultimodal,
  autoMultimodal,
  matchedRule,
  onToggle,
  onToggleMultimodal,
}: {
  model: AvailableModel;
  enabled: boolean;
  index?: number;
  isDefault?: boolean;
  isMultimodal?: boolean;
  autoMultimodal?: boolean;
  matchedRule?: AutoEnableRule;
  onToggle: (v: boolean) => void;
  onToggleMultimodal: (v: boolean) => void;
}) {
  const sortable = useSortable({
    id: model.id,
    disabled: !enabled,
  });

  const group = extractGroup(model.id);
  const label = model.label.replace(/^[^/]+\//, "");
  const groupColor = group ? getGroupColor(group) : "";

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        enabled ? "bg-neutral-900" : "bg-neutral-950/50",
        sortable.isDragging && "opacity-50",
      )}
    >
      {enabled ? (
        <button
          className="shrink-0 text-neutral-500 hover:text-neutral-300 cursor-grab active:cursor-grabbing"
          {...sortable.attributes}
          {...sortable.listeners}
          aria-label="拖拽排序"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span className="shrink-0 w-4" />
      )}

      <span className="shrink-0 w-6 text-center text-xs font-medium text-neutral-500">
        {enabled && index != null ? index + 1 : ""}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {isDefault && (
            <Star className="h-4 w-4 fill-amber-400 text-amber-400 shrink-0" />
          )}
          <span
            className={cn(
              "font-medium truncate",
              enabled ? "text-neutral-100" : "text-neutral-500",
            )}
          >
            {label}
          </span>
          {group && (
            <Badge className={`text-[10px] h-5 shrink-0 ${groupColor}`}>
              {group}
            </Badge>
          )}
          {isDefault && (
            <Badge className="text-[10px] h-5 bg-amber-500 hover:bg-amber-600 shrink-0">
              默认
            </Badge>
          )}
          {matchedRule && (
            <Badge className="text-[10px] h-5 border-amber-700/50 text-amber-300 bg-amber-900/30 shrink-0">
              <Sparkles className="h-3 w-3 mr-0.5" />
              自动启用
            </Badge>
          )}
          {model.supportsImages && (
            <Badge className="text-[10px] h-5 border-sky-700/50 text-sky-300 bg-sky-900/30 shrink-0">
              <ImageIcon className="h-3 w-3 mr-0.5" />
              多模态
            </Badge>
          )}
          {model.supportsThinkingDepth && (
            <Badge className="text-[10px] h-5 border-violet-700/50 text-violet-300 bg-violet-900/30 shrink-0">
              深度思考
            </Badge>
          )}
        </div>
        <div className="text-xs text-neutral-500 truncate mt-0.5" title={model.id}>
          {model.id}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {enabled && (
          <label
            className={cn(
              "inline-flex items-center gap-1.5 text-xs cursor-pointer select-none",
              autoMultimodal ? "text-sky-400" : "text-neutral-400",
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span>多模态{autoMultimodal ? "(自动)" : ""}</span>
            <Switch
              checked={isMultimodal}
              onCheckedChange={onToggleMultimodal}
              className="data-[state=checked]:bg-sky-600 data-[state=unchecked]:bg-neutral-700"
            />
          </label>
        )}
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="data-[state=checked]:bg-indigo-600 data-[state=unchecked]:bg-neutral-700"
        />
      </div>
    </div>
  );
}

/* ============================================================
   规则输入
   ============================================================ */

function RuleInput({
  label,
  placeholder,
  value,
  onChange,
  onAdd,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-400 mb-1.5">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-neutral-800 border-neutral-700 text-neutral-200 placeholder:text-neutral-500 focus:border-indigo-500 focus:ring-indigo-500/20"
        />
        <Button
          variant="outline"
          onClick={onAdd}
          disabled={!value.trim()}
          className="shrink-0 bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 disabled:opacity-40"
        >
          <Plus className="h-4 w-4 mr-1" />
          添加
        </Button>
      </div>
    </div>
  );
}

/* ============================================================
   识图配置 Tab
   ============================================================ */

function ImageDescriberTab() {
  const [config, setConfig] = useState<ImageDescriptionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [visionModelId, setVisionModelId] = useState("");
  const [timeout, setTimeout_] = useState(60000);
  const [maxCacheSize, setMaxCacheSize] = useState(500);

  const fetchAvailableModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const res = await fetch("/api/admin/available-models");
      const body = await res.json();
      if (res.ok && body.success) {
        const models: AvailableModel[] = (body.data?.models || []).map(
          (m: { id: string; label?: string; group?: string }) => ({
            id: m.id,
            label: m.label || m.id,
            group: m.group || extractGroup(m.id),
            supportsImages: true,
            supportsThinkingDepth: false,
          }),
        );
        setAvailableModels(models);
      }
    } catch {
      // non-critical, dropdown may be empty
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchAvailableModels();

    const res = await fetch("/api/admin/model-config", {
      headers: { "x-admin-token": localStorage.getItem("admin_token") || "" },
    });
    const body = await res.json();

    if (body.success && body.data?.imageDescription) {
      const c = body.data.imageDescription;
      setConfig(c);
      setEnabled(c.enabled ?? true);
      setVisionModelId(c.visionModelId || "");
      setTimeout_(c.timeout || 10000);
      setMaxCacheSize(c.maxCacheSize || 500);
    }
    setLoading(false);
  }, [fetchAvailableModels]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/admin/model-config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": localStorage.getItem("admin_token") || "",
      },
      body: JSON.stringify({
        imageDescription: { enabled, visionModelId, timeout, maxCacheSize },
      }),
    });
    const body = await res.json();

    if (body.success) {
      const imgMsg = body.imagePushResult?.ok
        ? "，已同步至 agent-service"
        : body.imagePushResult
          ? ` (agent-service 同步: ${body.imagePushResult.message})`
          : "";
      setSuccess("配置已保存" + imgMsg);
    } else {
      setError(body?.error?.message || "保存失败");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-neutral-400 py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-neutral-50 mb-1">识图代理配置</h3>
          <p className="text-sm text-neutral-400">
            当用户使用的模型不支持图片输入时，通过识图模型将图片转为文字描述再发送给主模型。
            默认已启用，留空识图模型则自动使用当前主模型进行识图。
          </p>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-neutral-200">启用识图代理</p>
            <p className="text-xs text-neutral-500">关闭后非多模态模型将无法处理图片</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">识图模型</label>
          <select
            value={visionModelId}
            onChange={(e) => setVisionModelId(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
          >
            <option value="">留空 — 自动使用当前主模型</option>
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
            {visionModelId && !availableModels.find((m) => m.id === visionModelId) && (
              <option value={visionModelId}>{visionModelId} (自定义)</option>
            )}
          </select>
          {loadingModels && (
            <p className="text-xs text-neutral-500 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              加载模型列表...
            </p>
          )}
          <p className="text-xs text-neutral-500">
            选择用于将图片转为文字描述的模型。留空则自动回退到当前主模型。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">超时 (毫秒)</label>
            <Input
              type="number"
              value={timeout}
              onChange={(e) => setTimeout_(Number(e.target.value) || 10000)}
              className="bg-neutral-900 border-neutral-700 text-neutral-200"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">缓存条目数</label>
            <Input
              type="number"
              value={maxCacheSize}
              onChange={(e) => setMaxCacheSize(Number(e.target.value) || 500)}
              className="bg-neutral-900 border-neutral-700 text-neutral-200"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white"
        >
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-2" />
          保存
        </Button>
      </div>
    </div>
  );
}
