/**
 * AI 后端供应商管理页
 *
 * 用于管理 agent-service 的 LLM 后端供应商配置：
 * - 列出所有供应商
 * - 新增 / 编辑 / 删除
 * - 一键推送到 agent-service 立即生效
 * - 显示推送结果
 *
 * 数据存储：author-site 的 system_configs.model_config.backendProviders
 * 同步机制：保存后调用 agent-service /internal/backend-providers
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Server,
  Key,
  Link2,
  Database,
  RefreshCw,
  Edit3,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BackendProvider, BackendProvidersConfig } from "@opencode-workbench/shared";

interface ProviderFormState {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  modelsText: string; // 换行分隔的模型 ID
  defaultModel: string;
  enabled: boolean;
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
    models: f.modelsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
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

export default function BackendProvidersPage() {
  const [providers, setProviders] = useState<BackendProvider[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string>("");
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderFormState>(EMPTY_FORM);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/model-config");
      if (!res.ok) throw new Error("加载配置失败");
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

  async function saveAll(pushToAgent: boolean) {
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

      setSuccess(
        pushToAgent
          ? "配置已保存并推送到 agent-service，列表中的供应商可继续点击编辑"
          : "配置已保存到数据库，列表中的供应商可继续点击编辑",
      );

      if (pushToAgent) {
        if (body.agentPushResult) {
          setPushResult(body.agentPushResult);
        } else {
          // 兼容性:旧版本 API 不返回 agentPushResult
          setPushing(true);
          try {
            const r = await fetch("/api/admin/backend-providers/sync", {
              method: "POST",
            });
            const j = await r.json();
            setPushResult({
              ok: j.success,
              message: j.message || (j.success ? "已推送" : "推送失败"),
            });
          } finally {
            setPushing(false);
          }
        }
      }
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
  }, []);

  const handleDelete = useCallback((id: string) => {
    if (!confirm(`确定删除供应商「${id}」？`)) return;
    setProviders((prev) => prev.filter((p) => p.id !== id));
    if (activeProviderId === id) setActiveProviderId("");
  }, [activeProviderId]);

  const handleSaveForm = useCallback(() => {
    // 校验
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
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-600">加载中...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">AI 后端供应商</h2>
        <p className="text-gray-600 mt-1">
          管理 agent-service 使用的 LLM 后端供应商。
          每个供应商可独立配置 baseURL、API Key 和可用模型列表。
        </p>
      </div>

      {/* 状态消息 */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {pushResult && (
        <div
          className={cn(
            "flex items-start gap-2 p-3 border rounded-lg text-sm",
            pushResult.ok
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : "bg-yellow-50 border-yellow-200 text-yellow-800",
          )}
        >
          {pushResult.ok ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0" />
          )}
          <span>
            <strong>agent-service 推送:</strong> {pushResult.message}
          </span>
        </div>
      )}

      {/* 全局激活配置 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
        <h3 className="font-semibold text-gray-900">默认供应商和模型</h3>
        <p className="text-sm text-gray-600">
          新建会话时使用此配置。已存在的会话保持原模型,直到下次切换。
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              激活的供应商
            </label>
            <select
              value={activeProviderId}
              onChange={(e) => setActiveProviderId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              激活的模型 (provider/model)
            </label>
            <Input
              value={activeModelId}
              onChange={(e) => setActiveModelId(e.target.value)}
              placeholder="如:jojo/deepseek-v4-flash"
            />
          </div>
        </div>
      </div>

      {/* 供应商列表 */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">供应商列表</h3>
          <Button
            onClick={handleAdd}
            disabled={isFormOpen}
            size="sm"
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            新增供应商
          </Button>
        </div>

        {/* 表单 */}
        {isFormOpen && (
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-200 space-y-3">
            <h4 className="font-medium text-gray-900">
              {isAdding ? "新增供应商" : `编辑供应商: ${editingId}`}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  供应商 ID *
                </label>
                <Input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="如:jojo"
                  disabled={!isAdding}
                />
                <p className="text-xs text-gray-500 mt-1">用作模型 ID 前缀,不可修改</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  展示名
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="如:xjjj 中转"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  baseURL * (OpenAI 兼容格式)
                </label>
                <Input
                  value={form.baseURL}
                  onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
                  placeholder="如:https://token.xjjj.co/v1"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  API Key (留空则使用环境变量)
                </label>
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  模型列表 * (每行一个)
                </label>
                <Textarea
                  value={form.modelsText}
                  onChange={(e) => setForm({ ...form, modelsText: e.target.value })}
                  placeholder={"deepseek-v4-flash\ngpt-4\nclaude-3-5-sonnet"}
                  rows={5}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  默认模型 (选填)
                </label>
                <Input
                  value={form.defaultModel}
                  onChange={(e) =>
                    setForm({ ...form, defaultModel: e.target.value })
                  }
                  placeholder="留空则取列表第一个"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(checked) =>
                      setForm({ ...form, enabled: checked })
                    }
                  />
                  <span className="text-gray-700">启用</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={handleCancelForm}>
                取消
              </Button>
              <Button size="sm" onClick={handleSaveForm}>
                保存到列表
              </Button>
            </div>
          </div>
        )}

        {/* 列表内容 */}
        <div className="divide-y divide-gray-200">
          {providers.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-500">
              暂无供应商,点击右上角「新增供应商」开始
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{p.name}</span>
                    <code className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                      {p.id}
                    </code>
                    {p.enabled === false && (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded">
                        已禁用
                      </span>
                    )}
                    {activeProviderId === p.id && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                        当前激活
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1">
                    <Link2 className="h-3 w-3" />
                    <code className="truncate">{p.baseURL}</code>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1">
                    <Database className="h-3 w-3" />
                    <span>
                      {p.models.length} 个模型
                      {p.defaultModel && ` · 默认 ${p.defaultModel}`}
                    </span>
                  </div>
                  {p.apiKey && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-1">
                      <Key className="h-3 w-3" />
                      <code className="truncate">
                        {p.apiKey.slice(0, 4)}...({p.apiKey.length})
                      </code>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(p)}
                    disabled={isFormOpen}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(p.id)}
                    disabled={isFormOpen}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-2 justify-end pt-2">
        <Button
          variant="outline"
          onClick={() => loadConfig()}
          disabled={saving}
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          重新加载
        </Button>
        <Button
          variant="outline"
          onClick={() => saveAll(false)}
          disabled={saving || pushing}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          仅保存到数据库
        </Button>
        <Button onClick={() => saveAll(true)} disabled={saving || pushing}>
          {saving || pushing ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Power className="h-4 w-4 mr-1" />
          )}
          保存并推送到 agent-service
        </Button>
      </div>

      {/* 帮助 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>使用提示:</strong>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>点击「保存并推送」后,agent-service 立即使用新配置（无需重启）</li>
          <li>修改后,AI 对话面板的模型下拉框会自动显示新供应商的模型</li>
          <li>供应商 ID 决定模型 ID 前缀（如 jojo/deepseek-v4-flash）</li>
          <li>前端模型白名单需包含该前缀才能在 AI 对话中显示</li>
        </ul>
      </div>
    </div>
  );
}
