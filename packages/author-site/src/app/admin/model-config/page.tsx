/**
 * 模型配置管理页
 *
 * 管理白名单、黑名单、默认模型、名称过滤器和多模态模型
 */

"use client";

import { useState, useEffect } from "react";
import { Save, Plus, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModelConfig {
  frontend: {
    allowedPrefixes: string[];
    blacklist: string[];
    defaultModelIds: string[];
    nameFilters: string[];
  };
  multimodalModels: string[];
}

export default function ModelConfigPage() {
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // 加载配置
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
      setConfig(data);
    } catch (err: any) {
      setError(err.message || "加载配置失败");
    } finally {
      setLoading(false);
    }
  }

  // 保存配置
  async function handleSave() {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const res = await fetch("/api/admin/model-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const { error: apiError } = await res.json();
        throw new Error(apiError?.message || "保存失败");
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || "保存失败");
    } finally {
      setSaving(false);
    }
  }

  // 标签输入组件辅助函数
  function addTag(field: keyof ModelConfig["frontend"], value: string) {
    if (!config || !value.trim()) return;
    setConfig({
      ...config,
      frontend: {
        ...config.frontend,
        [field]: [...config.frontend[field], value.trim()],
      },
    });
  }

  function removeTag(field: keyof ModelConfig["frontend"], index: number) {
    if (!config) return;
    setConfig({
      ...config,
      frontend: {
        ...config.frontend,
        [field]: config.frontend[field].filter((_, i) => i !== index),
      },
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!config) {
    return <div className="text-center py-12 text-gray-500">无法加载配置</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">模型配置</h2>
          <p className="text-gray-600 mt-1">
            管理模型白名单、黑名单、默认模型和多模态设置
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              保存配置
            </>
          )}
        </Button>
      </div>

      {/* 成功/错误提示 */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          ✓ 配置已保存成功
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {/* 白名单配置 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">模型白名单</h3>
        <p className="text-sm text-gray-600 mb-4">
          允许在前端显示的模型分组前缀(如{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded">xjjj/</code>)
        </p>
        <TagInput
          tags={config.frontend.allowedPrefixes}
          onAdd={(tag) => addTag("allowedPrefixes", tag)}
          onRemove={(index) => removeTag("allowedPrefixes", index)}
          placeholder="输入分组前缀,按回车添加"
        />
      </div>

      {/* 黑名单配置 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">模型黑名单</h3>
        <p className="text-sm text-gray-600 mb-4">
          禁止在前端显示的完整模型 ID(即使通过了白名单过滤)
        </p>
        <TagInput
          tags={config.frontend.blacklist}
          onAdd={(tag) => addTag("blacklist", tag)}
          onRemove={(index) => removeTag("blacklist", index)}
          placeholder="输入完整模型 ID,按回车添加"
        />
      </div>

      {/* 默认模型配置 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          默认模型列表
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          按优先级排列的默认选中模型(从上到下优先级递减)
        </p>
        <TagInput
          tags={config.frontend.defaultModelIds}
          onAdd={(tag) => addTag("defaultModelIds", tag)}
          onRemove={(index) => removeTag("defaultModelIds", index)}
          placeholder="输入完整模型 ID,按回车添加"
        />
      </div>

      {/* 名称过滤器配置 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">名称过滤器</h3>
        <p className="text-sm text-gray-600 mb-4">
          分组级别的模型名称关键词过滤(格式:{" "}
          <code className="bg-gray-100 px-1 py-0.5 rounded">分组:关键词</code>)
        </p>
        <TagInput
          tags={config.frontend.nameFilters}
          onAdd={(tag) => addTag("nameFilters", tag)}
          onRemove={(index) => removeTag("nameFilters", index)}
          placeholder="如 opencode:Free,按回车添加"
        />
      </div>

      {/* 多模态模型配置 */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">多模态模型</h3>
        <p className="text-sm text-gray-600 mb-4">
          标记支持图片输入的模型(启用后用户可上传图片)
        </p>
        <TagInput
          tags={config.multimodalModels}
          onAdd={(tag) => {
            if (!tag.trim()) return;
            setConfig({
              ...config,
              multimodalModels: [...config.multimodalModels, tag.trim()],
            });
          }}
          onRemove={(index) => {
            setConfig({
              ...config,
              multimodalModels: config.multimodalModels.filter(
                (_, i) => i !== index,
              ),
            });
          }}
          placeholder="输入完整模型 ID,按回车添加"
        />
      </div>
    </div>
  );
}

/**
 * 标签输入组件
 */
function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
}: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (index: number) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      onAdd(input);
      setInput("");
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm"
            >
              {tag}
              <button
                onClick={() => onRemove(index)}
                className="hover:bg-primary/20 rounded-full p-0.5 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
