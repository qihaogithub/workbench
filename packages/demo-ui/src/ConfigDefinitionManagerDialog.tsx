"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  applySchemaDefinitionCommand,
  readConfigDefinitionFields,
  type ConfigDefinitionDraft,
  type ConfigDefinitionKind,
  type SchemaDefinitionMutation,
  type SchemaDefinitionCommand,
} from "@workbench/shared/demo/config-schema-definition";
import { Button } from "@/components/ui/button";
import { ConfigForm } from "./ConfigForm";
import { ColorDefinitionFields } from "./ColorDefinitionFields";
import { ImageDimensionRuleEditor } from "./ImageDimensionRuleEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfigDefinitionScope = "project" | "page";

export interface ConfigDefinitionManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSchema?: string;
  pageSchema?: string;
  pageName: string;
  readonly?: boolean;
  projectBindings?: string[];
  pageBindings?: string[];
  projectReservedKeys?: string[];
  onSave: (scope: ConfigDefinitionScope, mutation: SchemaDefinitionMutation) => void;
  /** 用户显式确认后复用编辑页已有 AI 对话发送结构化同步任务。 */
  onSendToAI?: (scope: ConfigDefinitionScope, mutation: SchemaDefinitionMutation) => void;
  onAnalyze?: (scope: ConfigDefinitionScope, mutation: SchemaDefinitionMutation) => ConfigDefinitionImpactSummary;
  /** 默认值编辑复用 ConfigForm，提交的是待写入 schema 的默认值，而非运行中的表单状态。 */
  onSaveDefaults?: (scope: ConfigDefinitionScope, values: Record<string, unknown>) => void;
}

export interface ConfigDefinitionImpactSummary {
  risk: "none" | "metadata" | "ai_required";
  boundPages: Array<{ pageName: string; keys: string[] }>;
  requirementRefCount: number;
  designSpecRefCount: number;
}

const EMPTY_SCHEMA = '{\n  "type": "object",\n  "properties": {}\n}';
const KINDS: Array<[ConfigDefinitionKind, string]> = [
  ["text", "短文本"], ["textarea", "长文本"], ["richtext", "富文本"],
  ["number", "数字"], ["integer", "整数"], ["boolean", "布尔"],
  ["enum", "枚举"], ["color", "颜色"], ["image", "单图"], ["images", "多图"], ["video", "视频"],
];
const ACCEPT_OPTIONS = [
  ["image/*", "全部图片"],
  ["image/png,image/jpeg", "PNG / JPEG"],
  ["image/png", "PNG"],
  ["image/jpeg", "JPEG"],
  ["image/webp", "WebP"],
  ["image/gif", "GIF"],
] as const;

function keyFromTitle(title: string) {
  const normalized = title.trim().replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return normalized ? normalized.replace(/^([0-9])/, "field_$1") : "newField";
}

function newField(key: string): ConfigDefinitionDraft {
  return { key, title: "新配置项", kind: "text", default: "" };
}

function nextFieldKey(title: string, existingKeys: string[]) {
  const base = keyFromTitle(title);
  if (!existingKeys.includes(base)) return base;
  let index = 2;
  while (existingKeys.includes(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function buildStagedMutation(sourceSchema: string, stagedSchema: string): SchemaDefinitionMutation {
  const before = new Map(readConfigDefinitionFields(sourceSchema).map((field) => [field.key, field]));
  const after = new Map(readConfigDefinitionFields(stagedSchema).map((field) => [field.key, field]));
  const diff = { added: [] as string[], updated: [] as string[], deleted: [] as string[], typeChanged: [] as string[] };
  const valuePlan = { setDefaults: {} as Record<string, unknown>, removeKeys: [] as string[] };
  for (const [key, field] of after) {
    const previous = before.get(key);
    if (!previous) { diff.added.push(key); valuePlan.setDefaults[key] = field.default; continue; }
    if (JSON.stringify(previous) === JSON.stringify(field)) continue;
    diff.updated.push(key);
    if (previous.kind !== field.kind) diff.typeChanged.push(key);
    if (!Object.is(previous.default, field.default)) valuePlan.setDefaults[key] = field.default;
  }
  for (const key of before.keys()) if (!after.has(key)) { diff.deleted.push(key); valuePlan.removeKeys.push(key); }
  return { schema: stagedSchema, valuePlan, diff };
}

export function ConfigDefinitionManagerDialog({
  open, onOpenChange, projectSchema, pageSchema, pageName, readonly,
  projectBindings = [], pageBindings = [], projectReservedKeys = [], onSave, onSendToAI, onAnalyze, onSaveDefaults,
}: ConfigDefinitionManagerDialogProps) {
  const [scope, setScope] = useState<ConfigDefinitionScope>("page");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConfigDefinitionDraft | null>(null);
  const [error, setError] = useState("");
  const [connectWithAi, setConnectWithAi] = useState(false);
  const [lastImpact, setLastImpact] = useState<ConfigDefinitionImpactSummary | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [aiSyncSent, setAiSyncSent] = useState(false);
  const [defaultEditorOpen, setDefaultEditorOpen] = useState(false);
  const [defaultValues, setDefaultValues] = useState<Record<string, unknown>>({});
  const [pendingSave, setPendingSave] = useState<{ mutation: SchemaDefinitionMutation; needsAi: boolean; impact: ConfigDefinitionImpactSummary | null } | null>(null);
  const [workingSchema, setWorkingSchema] = useState(EMPTY_SCHEMA);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [dimensionValidity, setDimensionValidity] = useState({ width: true, height: true });
  const schema = scope === "project" ? projectSchema || EMPTY_SCHEMA : pageSchema || EMPTY_SCHEMA;
  const bindings = scope === "project" ? projectBindings : pageBindings;
  const fields = useMemo(() => {
    try { return readConfigDefinitionFields(workingSchema); } catch { return []; }
  }, [workingSchema]);
  const groupedFields = useMemo(() => {
    const buckets = new Map<string, ConfigDefinitionDraft[]>();
    for (const field of fields) {
      const group = field.group?.trim() || "未分组";
      buckets.set(group, [...(buckets.get(group) ?? []), field]);
    }
    return Array.from(buckets.entries()).sort(([left], [right]) => left === "未分组" ? 1 : right === "未分组" ? -1 : left.localeCompare(right));
  }, [fields]);

  useEffect(() => {
    if (!open) return;
    setScope(pageSchema ? "page" : "project");
    setWorkingSchema(pageSchema ? pageSchema : projectSchema || EMPTY_SCHEMA);
    setSelectedKey(null); setDraft(null); setError(""); setConnectWithAi(false); setDraftDirty(false); setHasPendingChanges(false); setAiSyncSent(false); setDefaultEditorOpen(false); setDimensionValidity({ width: true, height: true });
  }, [open, pageSchema]);

  useEffect(() => {
    setWorkingSchema(schema);
    const next = fields.find((field) => field.key === selectedKey) ?? null;
    setDraft(next); setSelectedKey(next?.key ?? null); setError("");
  }, [scope, schema]); // schema changes only after a successful host save

  const stageDraft = () => {
    if (!draft) return workingSchema;
    if (selectedKey && !draftDirty) return workingSchema;
    const existing = fields.some((field) => field.key === selectedKey);
    const crossScopeKeys = scope === "project"
      ? projectReservedKeys
      : readConfigDefinitionFields(projectSchema || EMPTY_SCHEMA).map((field) => field.key);
    if (!existing && crossScopeKeys.includes(draft.key.trim())) throw new Error(`字段 key “${draft.key.trim()}” 已被另一作用域使用`);
    const mutation = applySchemaDefinitionCommand(workingSchema, existing
      ? { type: "field.update", key: selectedKey!, patch: draft }
      : { type: "field.add", field: draft });
    setWorkingSchema(mutation.schema);
    setHasPendingChanges(true);
    setDraftDirty(false);
    return mutation.schema;
  };
  const choose = (field: ConfigDefinitionDraft) => {
    try { stageDraft(); setSelectedKey(field.key); setDraft(field); setError(""); setConnectWithAi(false); setDraftDirty(false); setDimensionValidity({ width: true, height: true }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "无法暂存字段修改"); }
  };
  const change = (patch: Partial<ConfigDefinitionDraft>) => { setDraftDirty(true); setDraft((current) => current ? { ...current, ...patch } : current); };
  const save = () => {
    try {
      if (!dimensionValidity.width || !dimensionValidity.height) {
        setError("请先补全并修正尺寸区间");
        return;
      }
      const stagedSchema = stageDraft();
      const mutation = buildStagedMutation(schema, stagedSchema);
      if (!mutation.diff.added.length && !mutation.diff.updated.length && !mutation.diff.deleted.length) return;
      const impact = onAnalyze?.(scope, mutation) ?? null;
      setLastImpact(impact);
      const needsAi = connectWithAi || impact?.risk === "ai_required" || mutation.diff.deleted.some((key) => bindings.includes(key)) || mutation.diff.typeChanged.some((key) => bindings.includes(key));
      setPendingSave({ mutation, needsAi, impact });
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存配置定义"); }
  };
  const confirmSave = () => {
    if (!pendingSave) return;
    onSave(scope, pendingSave.mutation);
    if (pendingSave.needsAi) { onSendToAI?.(scope, pendingSave.mutation); setAiSyncSent(true); }
    setLastImpact(pendingSave.impact);
    setDraftDirty(false);
    setHasPendingChanges(false);
    setPendingSave(null);
  };
  const remove = () => {
    if (!selectedKey || !window.confirm(`删除配置项“${selectedKey}”吗？`)) return;
    try {
      const stagedSchema = stageDraft();
      const mutation = applySchemaDefinitionCommand(stagedSchema, { type: "field.delete", key: selectedKey });
      setWorkingSchema(mutation.schema); setHasPendingChanges(true);
      setSelectedKey(null); setDraft(null); setError(""); setDraftDirty(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法删除配置项"); }
  };
  const applyCommand = (command: SchemaDefinitionCommand) => {
    try {
      const stagedSchema = stageDraft();
      const mutation = applySchemaDefinitionCommand(stagedSchema, command);
      setWorkingSchema(mutation.schema); setHasPendingChanges(true);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法更新分组"); }
  };
  const deleteGroup = (group: string) => {
    const affected = fields.filter((field) => field.group === group).length;
    if (affected === 0) return;
    const destination = window.prompt(`删除“${group}”会影响 ${affected} 个字段。输入目标分组名称以移动字段；留空则移入未分组。`, "");
    if (destination === null) return;
    applyCommand(destination.trim()
      ? { type: "group.delete", group, disposition: "move", targetGroup: destination }
      : { type: "group.delete", group, disposition: "ungroup" });
  };
  const isImage = draft?.kind === "image" || draft?.kind === "images";
  const updateDimensionValidity = useCallback((axis: "width" | "height", valid: boolean) => {
    setDimensionValidity((current) => current[axis] === valid ? current : { ...current, [axis]: valid });
  }, []);
  const switchScope = (nextScope: ConfigDefinitionScope) => {
    if (nextScope === scope) return;
    if ((draftDirty || hasPendingChanges) && !window.confirm("切换作用域会放弃当前暂存修改，确定继续吗？")) return;
    setSelectedKey(null);
    setDraft(null);
    setDimensionValidity({ width: true, height: true });
    setScope(nextScope);
  };
  const openDefaultEditor = () => {
    setDefaultValues(Object.fromEntries(fields
      .filter((field) => field.default !== undefined)
      .map((field) => [field.key, field.default])));
    setDefaultEditorOpen(true);
  };
  const requestClose = (nextOpen: boolean) => {
    if (!nextOpen && (draftDirty || hasPendingChanges) && !window.confirm("当前配置定义尚未保存，确定放弃所有修改吗？")) return;
    onOpenChange(nextOpen);
  };
  return <Dialog open={open} onOpenChange={requestClose}>
    <DialogContent className="flex h-[min(90vh,820px)] max-w-4xl flex-col overflow-hidden p-0 sm:max-w-4xl">
      <DialogHeader className="shrink-0 border-b px-6 pb-4 pt-6"><DialogTitle>管理配置项</DialogTitle><DialogDescription>字段按分组组织；字段说明在设计规范中维护。</DialogDescription></DialogHeader>
      <div className="flex shrink-0 gap-1 border-b px-6">
        <button type="button" onClick={() => switchScope("page")} className={`px-3 py-2 text-sm ${scope === "page" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>本页配置：{pageName}</button>
        <button type="button" onClick={() => switchScope("project")} className={`px-3 py-2 text-sm ${scope === "project" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>项目级共享配置</button>
      </div>
      <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[260px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-r px-4 pb-4">
          <div className="sticky top-0 z-10 -mx-4 border-b bg-background px-4 py-3">
            <Button type="button" size="sm" className="w-full gap-1" disabled={readonly} onClick={() => { const field = newField(nextFieldKey("新配置项", fields.map((item) => item.key))); setSelectedKey(null); setDraft(field); setDraftDirty(false); setDimensionValidity({ width: true, height: true }); }}><Plus className="h-3.5 w-3.5" />添加配置项</Button>
            <p className="mt-2 text-xs text-muted-foreground">共 {fields.length} 项，分组用于整理字段，不单独保存为空目录。</p>
          </div>
          {groupedFields.length === 0 ? <p className="px-1 py-4 text-xs text-muted-foreground">暂无配置项。点击上方按钮创建第一个字段。</p> : <div className="pt-3">{groupedFields.map(([group, groupFields]) => <section key={group} className="mb-4"><div className="flex items-center gap-1 px-1 pb-1"><p className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">{group} · {groupFields.length}</p>{group !== "未分组" && !readonly && <><button type="button" className="rounded px-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { const next = window.prompt("重命名分组", group); if (next?.trim() && next.trim() !== group) applyCommand({ type: "group.rename", from: group, to: next }); }}>重命名</button><button type="button" className="rounded px-1 text-xs text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => deleteGroup(group)}>删除</button></>}</div><div className="space-y-1">{groupFields.map((field) => <button key={field.key} type="button" onClick={() => choose(field)} className={`block w-full rounded-md border border-transparent px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedKey === field.key ? "border-primary/30 bg-primary/10" : "hover:bg-muted/60"}`}><span className="block truncate font-medium">{field.title}</span><span className="text-xs text-muted-foreground">{KINDS.find(([kind]) => kind === field.kind)?.[1]} · {bindings.includes(field.key) ? "已绑定" : "未绑定"}</span></button>)}</div></section>)}</div>}
        </aside>
        {draft ? <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="space-y-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">名称<Input value={draft.title} onChange={(event) => change({ title: event.target.value, ...(selectedKey ? {} : { key: nextFieldKey(event.target.value, fields.map((item) => item.key)) }) })} disabled={readonly} /></label>
            <label className="space-y-1 text-sm">类型<select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.kind} onChange={(event) => { const kind = event.target.value as ConfigDefinitionKind; change({ kind, ...(kind === "color" ? { colorFormat: draft.colorFormat ?? "color", default: null } : {}) }); }} disabled={readonly}>{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="space-y-1 text-sm">分组<Input value={draft.group ?? ""} onChange={(event) => change({ group: event.target.value || undefined })} disabled={readonly} placeholder="未分组" /></label>
            <label className="space-y-1 text-sm">分类<Input value={draft.category ?? ""} onChange={(event) => change({ category: event.target.value || undefined })} disabled={readonly} placeholder="可选，用于面板筛选" /></label>
          </div>
          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">字段说明不在此处维护；请在「设计规范」中为已绑定字段补充描述与使用说明。</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.required} onChange={(event) => change({ required: event.target.checked })} disabled={readonly} />必填</label>
          {draft.kind === "enum" && <label className="block space-y-1 text-sm">枚举选项（每行一个）<Textarea value={(draft.enum ?? []).join("\n")} onChange={(event) => change({ enum: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) })} disabled={readonly} /></label>}
          {draft.kind === "color" && <ColorDefinitionFields draft={draft} onChange={change} readOnly={readonly} />}
          {isImage && <fieldset className="space-y-3 rounded-md border p-3"><legend className="px-1 text-sm font-medium">图片限制</legend><label className="block space-y-1 text-sm">接受的文件类型<select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.accept || "image/*"} onChange={(event) => change({ accept: event.target.value })} disabled={readonly}>{ACCEPT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="block space-y-1 text-sm">文件大小上限（bytes）<Input type="number" min="0" value={draft.maxSize ?? ""} onChange={(event) => change({ maxSize: event.target.value === "" ? undefined : Number(event.target.value) })} disabled={readonly} /></label><div className="grid gap-3 sm:grid-cols-2"><ImageDimensionRuleEditor axis="W" rule={draft.widthRule} onChange={(widthRule) => change({ widthRule })} onValidityChange={(valid) => updateDimensionValidity("width", valid)} readOnly={readonly} /><ImageDimensionRuleEditor axis="H" rule={draft.heightRule} onChange={(heightRule) => change({ heightRule })} onValidityChange={(valid) => updateDimensionValidity("height", valid)} readOnly={readonly} /></div></fieldset>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {lastImpact && <div className="rounded-md border bg-muted/40 p-3 text-xs"><p className="font-medium">影响分析：{lastImpact.risk === "ai_required" ? "需要 AI 同步页面" : lastImpact.risk === "metadata" ? "存在引用，请确认展示与说明" : "未发现页面绑定"}</p>{lastImpact.boundPages.map((page) => <p key={page.pageName} className="mt-1 text-muted-foreground">{page.pageName}：{page.keys.join("、")}</p>)}{lastImpact.requirementRefCount > 0 && <p className="mt-1 text-muted-foreground">配置要求引用：{lastImpact.requirementRefCount} 处</p>}{lastImpact.designSpecRefCount > 0 && <p className="mt-1 text-muted-foreground">设计规范引用：{lastImpact.designSpecRefCount} 处</p>}</div>}
          {aiSyncSent && <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">定义已保存，AI 页面同步任务已发送。请在 AI 对话中查看运行状态、mutation receipt 与 run summary。</p>}
          {!readonly && selectedKey && <div className="sticky bottom-0 -mx-5 border-t bg-background px-5 py-3 shadow-[0_-8px_16px_-16px_rgba(0,0,0,0.7)]"><Button type="button" variant="ghost" size="sm" className="gap-1 text-destructive" onClick={remove}><Trash2 className="h-3.5 w-3.5" />删除此字段</Button></div>}
          </div>
        </div> : <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">选择一个配置项，或添加配置项。</div>}
      </div>
      <DialogFooter className="shrink-0 justify-between gap-2 border-t px-6 py-4 sm:justify-between"><Button type="button" variant="outline" disabled={readonly || fields.length === 0} onClick={openDefaultEditor}>设置默认值</Button><div className="flex items-center gap-2"><Button type="button" variant="outline" onClick={() => requestClose(false)}>关闭</Button>{!readonly && <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm"><input type="checkbox" checked={connectWithAi} onChange={(event) => setConnectWithAi(event.target.checked)} />同步页面</label>}{!readonly && <Button type="button" disabled={!hasPendingChanges && !draftDirty} onClick={save}>{connectWithAi ? "保存并同步" : "保存全部修改"}</Button>}</div></DialogFooter>
      <Dialog open={defaultEditorOpen} onOpenChange={setDefaultEditorOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden sm:max-w-2xl"><DialogHeader><DialogTitle>设置默认值</DialogTitle><DialogDescription>使用与配置面板相同的控件设置初始值：文字输入、颜色选择、图片上传等均按字段类型呈现。</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto pr-1"><ConfigForm key={`${scope}-${workingSchema}`} schema={workingSchema} initialData={defaultValues} onChange={setDefaultValues} /></div><DialogFooter><Button type="button" variant="outline" onClick={() => setDefaultEditorOpen(false)}>取消</Button><Button type="button" onClick={() => { onSaveDefaults?.(scope, defaultValues); setDefaultEditorOpen(false); }}>保存默认值</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={pendingSave !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingSave(null); }}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{pendingSave?.needsAi ? "确认保存并发送 AI 任务" : "确认保存配置定义"}</DialogTitle><DialogDescription>{pendingSave?.needsAi ? "定义会先保存，随后向当前 AI 对话发送页面同步任务。页面代码在 AI 完成前不会自动改变。" : pendingSave?.impact?.risk === "metadata" ? "此变更关联了配置要求或设计规范。确认后将更新字段定义。" : "确认后将更新字段定义并刷新对应配置表单。"}</DialogDescription></DialogHeader>{pendingSave?.impact && <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">受影响页面：{pendingSave.impact.boundPages.length} 个 · 配置要求引用：{pendingSave.impact.requirementRefCount} 处 · 设计规范引用：{pendingSave.impact.designSpecRefCount} 处</div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setPendingSave(null)}>继续编辑</Button><Button type="button" onClick={confirmSave}>{pendingSave?.needsAi ? "保存并发送" : "确认保存"}</Button></DialogFooter></DialogContent>
      </Dialog>
    </DialogContent>
  </Dialog>;
}
