/**
 * 模型配置管理页
 *
 * 单一列表 + 开关：
 * - 开关打开 = 已启用,排在上方,可拖拽排序（第一个即默认模型）
 * - 开关关闭 = 未启用,排在下方
 * - 自动启用规则：分组前缀 / 名称关键词,匹配的新模型自动启用
 */

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Save,
  Loader2,
  AlertCircle,
  RefreshCw,
  GripVertical,
  Star,
  Image as ImageIcon,
  Plus,
  X,
  Sparkles,
  Search,
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
import { cn } from "@/lib/utils";

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

const EMPTY_CONFIG: ModelConfigState = {
  enabledModels: [],
  autoEnableRules: [],
  blacklist: [],
  multimodalModels: [],
};

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
  const keyword = rule.value
    .slice(idx + 1)
    .trim()
    .toLowerCase();
  if (!keyword) return false;
  const modelGroup = extractGroup(modelId);
  if (modelGroup !== group) return false;
  return modelId.toLowerCase().includes(keyword);
}

export default function ModelConfigPage() {
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
      if (!res.ok) throw new Error("加载配置失败");
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

  /** 已启用列表：按 enabledModels 顺序 */
  const enabledList = useMemo(() => {
    return config.enabledModels
      .filter((id) => modelMap.has(id))
      .map((id) => modelMap.get(id)!);
  }, [config.enabledModels, modelMap]);

  /** 未启用列表：按搜索过滤 */
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
    // 统计已启用中支持多模态的（后端标记 + 手动标记）
    const autoSet = new Set(
      availableModels.filter((m) => m.supportsImages).map((m) => m.id),
    );
    return config.enabledModels.filter(
      (id) => autoSet.has(id) || multimodalSet.has(id),
    ).length;
  }, [config.enabledModels, multimodalSet, availableModels]);

  // 启用 / 禁用操作（启用时自动标记多模态）
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

  // 自动启用规则管理
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

  // 拖拽
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
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-neutral-50">模型配置</h2>
          <p className="text-neutral-400 mt-1 text-sm">
            打开开关启用模型，拖拽已启用的模型排序。第一个启用项即为默认模型。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={fetchAvailableModels}
            disabled={loadingModels}
            className="bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:text-neutral-100"
          >
            {loadingModels ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            拉取模型
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
        <Badge
          variant="secondary"
          className="bg-neutral-800 text-neutral-300 border-neutral-700"
        >
          后端可用 {availableModels.length} 个模型
        </Badge>
        <Badge
          variant="default"
          className="bg-indigo-600 text-white hover:bg-indigo-500"
        >
          已启用 {enabledList.length} 个
        </Badge>
        <Badge
          variant="outline"
          className="border-neutral-700 text-neutral-400"
        >
          多模态 {multimodalCount} 个
        </Badge>
        <Badge
          variant="outline"
          className="border-neutral-700 text-neutral-400"
        >
          自动规则 {config.autoEnableRules.length} 条
        </Badge>
      </div>

      {/* 成功/错误提示 */}
      {success && (
        <div className="bg-emerald-900/40 border border-emerald-800 text-emerald-200 px-4 py-3 rounded-lg text-sm">
          ✓ 配置已保存成功
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
            <h3 className="text-lg font-semibold text-neutral-50">
              自动启用规则
            </h3>
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
            placeholder="如 opencode:Free"
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

      {/* 模型列表 (统一) */}
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
            请先点击右上角「拉取模型」获取后端可用模型
          </div>
        ) : (
          <div className="border border-neutral-800 rounded-lg overflow-hidden max-h-[700px] overflow-y-auto">
            {/* 已启用部分（可拖拽排序） */}
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

            {/* 分隔线 */}
            {enabledList.length > 0 && disabledList.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 bg-neutral-900 border-y border-neutral-800">
                <div className="h-px flex-1 bg-neutral-700" />
                <span className="text-xs text-neutral-500 shrink-0">
                  未启用 ({disabledList.length})
                </span>
                <div className="h-px flex-1 bg-neutral-700" />
              </div>
            )}

            {/* 未启用部分 */}
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

            {/* 空状态 */}
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

// ====================== 统一模型行 ======================

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
      {/* 拖拽柄 (仅已启用) */}
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

      {/* 序号 (仅已启用) */}
      <span className="shrink-0 w-6 text-center text-xs font-medium text-neutral-500">
        {enabled && index != null ? index + 1 : ""}
      </span>

      {/* 模型信息 */}
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
            <Badge
              variant="secondary"
              className="text-[10px] h-5 shrink-0 bg-neutral-800 text-neutral-300 border-neutral-700"
            >
              {group}
            </Badge>
          )}
          {isDefault && (
            <Badge
              variant="default"
              className="text-[10px] h-5 bg-amber-500 hover:bg-amber-600 shrink-0"
            >
              默认
            </Badge>
          )}
          {matchedRule && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 border-amber-700/50 text-amber-300 bg-amber-900/30 shrink-0"
            >
              <Sparkles className="h-3 w-3 mr-0.5" />
              自动启用
            </Badge>
          )}
          {model.supportsImages && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 border-sky-700/50 text-sky-300 bg-sky-900/30 shrink-0"
            >
              <ImageIcon className="h-3 w-3 mr-0.5" />
              多模态
            </Badge>
          )}
          {model.supportsThinkingDepth && (
            <Badge
              variant="outline"
              className="text-[10px] h-5 border-violet-700/50 text-violet-300 bg-violet-900/30 shrink-0"
            >
              深度思考
            </Badge>
          )}
        </div>
        <div
          className="text-xs text-neutral-500 truncate mt-0.5"
          title={model.id}
        >
          {model.id}
        </div>
      </div>

      {/* 操作区 */}
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

// ====================== 规则输入 ======================

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
