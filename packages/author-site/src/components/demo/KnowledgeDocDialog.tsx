"use client";

import { useMemo, useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Loader2, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";
import {
  DocumentEditor,
  type MarkdownReferenceClickHandler,
  type MarkdownReferenceContext,
  type MarkdownReferenceProvider,
} from "@workbench/demo-ui/DocumentEditor";
import type { CollabRoomDescriptor } from "@workbench/shared";
import type { MarkdownReferenceTarget } from "@workbench/shared/markdown-reference";
import { decodeMarkdownReferenceUri, serializeMarkdownReference } from "@workbench/shared/markdown-reference";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cjk } from "@streamdown/cjk";
import { useCollabDocument, type CollabUser } from "@/hooks/useCollabDocument";
import {
  MarkdownReferenceLinksPanel,
  type MarkdownReferenceMention,
} from "./MarkdownReferenceLinksPanel";
import { createAuthorReferenceProvider, navigateToMarkdownMention } from "./markdown-reference-navigation";
import { toKnowledgeItem } from "./document-api-adapter";
import { localizeRemoteImageForSession } from "@workbench/demo-ui/markdown/remote-image-localizer";
import {
  DocumentSaveCoordinator,
  DocumentSaveError,
  type DocumentSaveSnapshot,
  toDocumentSaveError,
} from "@/lib/document-save-coordinator";
import {
  createOfflineDraftStore,
  type OfflineDraftStore,
} from "@/lib/workspace-offline-drafts";
import { DocumentSaveStatusBar } from "./DocumentSaveStatusBar";

export interface KnowledgeItem {
  id: string;
  title: string;
  source: "system" | "user";
  description: string;
  fileName?: string;
  addedAt: string;
  updatedAt: string;
  sizeBytes?: number;
  category?: string;
  tags?: string[];
  aiSummary?: string;
  aiKeywords?: string[];
  summaryStatus?: "ready" | "stale" | "failed";
  readonly?: boolean;
}

export type KnowledgeDocDialogMode = "read" | "edit" | "add";

interface KnowledgeDocDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: KnowledgeDocDialogMode;
  item: KnowledgeItem | null;
  workingDir?: string;
  projectId?: string;
  documentApiMode?: "legacy" | "project";
  workspaceId?: string;
  sessionId?: string;
  onReferenceClick?: MarkdownReferenceClickHandler;
  collabUser?: Partial<CollabUser>;
  onSaved: (item?: KnowledgeItem) => void;
}

function replaceCollabText(
  ytext: { toString: () => string; delete: (index: number, length: number) => void; insert: (index: number, text: string) => void } | null,
  value: string,
): void {
  if (!ytext || ytext.toString() === value) return;
  ytext.delete(0, ytext.toString().length);
  if (value) ytext.insert(0, value);
}

/**
 * 知识库文档弹窗 - 支持阅读/编辑/添加
 * 阅读模式下用户条目可切换到编辑模式
 */
export function KnowledgeDocDialog({
  open,
  onOpenChange,
  mode: initialMode,
  item,
  workingDir,
  projectId,
  documentApiMode = "legacy",
  workspaceId,
  sessionId,
  onReferenceClick,
  collabUser,
  onSaved,
}: KnowledgeDocDialogProps) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  // 内部模式状态，支持从阅读切换到编辑
  const [activeMode, setActiveMode] = useState<KnowledgeDocDialogMode>(initialMode);
  const [content, setContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [addTitle, setAddTitle] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addContent, setAddContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const activeItemId = item?.id;
  const activeItemDescription = item?.description ?? "";
  const [editSaveSnapshot, setEditSaveSnapshot] = useState<DocumentSaveSnapshot>({
    status: "clean",
    error: null,
    localRevision: 0,
    committedRevision: 0,
    hasLocalDraft: false,
  });
  const referenceEditorContainerRef = useRef<HTMLDivElement>(null);
  const editValueRef = useRef({ content: "", description: "" });
  editValueRef.current = { content: editContent, description: editDescription };
  const activeModeRef = useRef(activeMode);
  activeModeRef.current = activeMode;
  const draftStoreRef = useRef<OfflineDraftStore | null>(null);
  if (!draftStoreRef.current) draftStoreRef.current = createOfflineDraftStore();
  const collabDescriptor = useMemo<CollabRoomDescriptor | null>(() => {
    if (
      !open ||
      activeMode !== "edit" ||
      !item ||
      item.source === "system" ||
      documentApiMode !== "legacy" ||
      !item.fileName ||
      !projectId ||
      !workspaceId ||
      !sessionId
    ) {
      return null;
    }

    return {
      projectId,
      workspaceId,
      sessionId,
      resourcePath: `knowledge/${item.fileName}`,
      kind: "knowledge-document",
    };
  }, [activeMode, documentApiMode, item, open, projectId, sessionId, workspaceId]);
  const collab = useCollabDocument(collabDescriptor, collabUser);
  const localizeRemoteImage = useCallback(
    async (url: string): Promise<string> => {
      if (!sessionId) throw new Error("当前会话不可用，无法保存外网图片");
      return localizeRemoteImageForSession(sessionId, url);
    },
    [sessionId],
  );
  const referenceProvider = useMemo<MarkdownReferenceProvider | undefined>(
    () => projectId ? createAuthorReferenceProvider(projectId, sessionId) : undefined,
    [projectId, sessionId],
  );
  const referenceContext = useMemo<MarkdownReferenceContext | undefined>(() => {
    if (!projectId || !workspaceId || !item || item.source === "system") return undefined;
    return {
      source: { kind: "knowledge-document", projectId, workspaceId, docId: item.id },
      policy: {
        allowedTargetKinds: ["page", "config", "document"],
        sameProjectOnly: false,
        allowUnresolved: false,
      },
    };
  }, [item, projectId, workspaceId]);
  const referenceTarget = useMemo<MarkdownReferenceTarget | undefined>(() => {
    if (!projectId || !item || item.source === "system") return undefined;
    return { kind: "document", projectId, docId: item.id };
  }, [item, projectId]);
  const handleReferenceClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith("wb://")) return;
      event.preventDefault();
      const target = decodeMarkdownReferenceUri(href);
      if (!target) return;
      onReferenceClick?.({ target, labelSnapshot: anchor?.textContent?.trim() || "" });
    },
    [onReferenceClick],
  );
  const handleUnlinkedMentionNavigate = useCallback((mention: MarkdownReferenceMention) => {
    const current = activeMode === "edit" ? editContent : content;
    navigateToMarkdownMention(referenceEditorContainerRef.current, current, mention);
  }, [activeMode, content, editContent]);

  const saveEdit = useCallback(
    async (value: { content: string; description: string }): Promise<void> => {
      if (!activeItemId || (!workingDir && !(documentApiMode === "project" && projectId))) {
        throw new DocumentSaveError("文档尚未准备好保存。", { code: "UNKNOWN" });
      }
      const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
      if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
      if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
      const response = await fetch(
        documentApiMode === "project" && projectId
          ? `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(activeItemId)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
          : `/api/knowledge/${activeItemId}?${params.toString()}`,
        {
          method: documentApiMode === "project" ? "PATCH" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: value.description,
            content: value.content,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw toDocumentSaveError(
          data ? { ...data, status: response.status } : { status: response.status },
          "保存失败",
        );
      }
      const savedItem = documentApiMode === "project"
        ? toKnowledgeItem(data.data.snapshot)
        : data.data as KnowledgeItem;
      onSavedRef.current(savedItem);
    },
    [activeItemId, documentApiMode, projectId, sessionId, workingDir],
  );

  const editSaveKey =
    activeMode === "edit" && item && !collabDescriptor
      ? `knowledge-dialog:${documentApiMode}:${projectId ?? workingDir ?? "local"}:${item.id}`
      : null;
  const editCoordinatorRef = useRef<
    DocumentSaveCoordinator<{ content: string; description: string }> | null
  >(null);
  const editCoordinator = useMemo<
    DocumentSaveCoordinator<{ content: string; description: string }> | null
  >(() => {
    if (!editSaveKey) return null;
    const currentStore = draftStoreRef.current;
    let instance: DocumentSaveCoordinator<{
      content: string;
      description: string;
    }>;
    instance = new DocumentSaveCoordinator({
      save: saveEdit,
      draft:
        projectId && workspaceId && currentStore
          ? {
              store: currentStore,
              workspaceId,
              projectId,
              path: editSaveKey,
              serialize: (value) => JSON.stringify(value),
              deserialize: (value) => JSON.parse(value) as {
                content: string;
                description: string;
              },
            }
          : undefined,
      onStateChange: (snapshot) => {
        if (editCoordinatorRef.current !== instance) return;
        setEditSaveSnapshot(snapshot);
      },
      onCommitted: ({ value, latest }) => {
        if (editCoordinatorRef.current !== instance || !latest) return;
        setContent(value.content);
        setEditContent(value.content);
        setEditDescription(value.description);
        setHasChanges(false);
      },
      onError: (error) => {
        if (editCoordinatorRef.current !== instance) return;
        toastRef.current({ title: error.message, variant: "destructive" });
      },
    });
    return instance;
  }, [editSaveKey, projectId, saveEdit, workspaceId]);
  editCoordinatorRef.current = editCoordinator;

  const restoreEditDraft = useCallback(async () => {
    const value = await editCoordinatorRef.current?.restoreDraft();
    if (!value) return;
    setContent(value.content);
    setEditContent(value.content);
    setEditDescription(value.description);
    setHasChanges(true);
  }, []);

  const discardEditDraft = useCallback(async () => {
    await editCoordinatorRef.current?.discardDraft();
    setEditContent(content);
    setEditDescription(item?.description ?? "");
    setHasChanges(false);
  }, [content, item?.description]);

  useEffect(() => {
    setEditSaveSnapshot(
      editCoordinator?.getSnapshot() ?? {
        status: "clean",
        error: null,
        localRevision: 0,
        committedRevision: 0,
        hasLocalDraft: false,
      },
    );
    const current = editCoordinator;
    return () => {
      if (current) void current.dispose();
    };
  }, [editCoordinator]);

  // 打开弹窗时重置模式并加载数据
  useEffect(() => {
    if (!open) return;
    setActiveMode(initialMode);

    if (initialMode === "add") {
      setAddTitle("");
      setAddDescription("");
      setAddContent("");
      setHasChanges(false);
      return;
    }

    if (item && (workingDir || (documentApiMode === "project" && projectId))) {
      setLoading(true);
      setHasChanges(false);
      const contentPromise = documentApiMode === "project" && projectId
        ? fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(item.id)}${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`).then(async (response) => {
            const payload = await response.json();
            if (!response.ok || !payload?.success) throw new Error(payload?.error?.message || "读取失败");
            return payload.data?.content || "";
          })
        : workingDir
          ? readFileContent(workingDir, item.fileName || "")
          : Promise.resolve("");
      contentPromise
        .then(async (text) => {
          if (!open) return;
          let nextContent = text;
          const base = { content: text, description: item.description };
          const coordinator = editCoordinatorRef.current;
          coordinator?.setBase(base);
          const draft = coordinator
            ? await coordinator.readDraft(base)
            : { status: "none" as const };
          if (draft.status === "match") {
            nextContent = draft.value.content;
            setEditDescription(draft.value.description);
            if (activeModeRef.current === "edit") coordinator?.markDirty(draft.value);
          } else {
            setEditDescription(item.description);
          }
          setContent(nextContent);
          setEditContent(nextContent);
        })
        .catch(() => {
          setContent("");
          setEditContent("");
        })
        .finally(() => setLoading(false));
    }
  }, [documentApiMode, initialMode, item, open, projectId, sessionId, workingDir]);

  // 从阅读模式切换到编辑模式时，当前正文已经在 state 中，仍需检查同一
  // 文档是否存在可安全恢复的本地草稿。
  useEffect(() => {
    if (activeMode !== "edit" || !activeItemId || !editCoordinator) return;
    let cancelled = false;
    const base = {
      content: editValueRef.current.content,
      description: activeItemDescription,
    };
    editCoordinator.setBase(base);
    void editCoordinator.readDraft(base).then((draft) => {
      if (cancelled || draft.status !== "match") return;
      setContent(draft.value.content);
      setEditContent(draft.value.content);
      setEditDescription(draft.value.description);
      editCoordinator.markDirty(draft.value);
    });
    return () => {
      cancelled = true;
    };
  }, [activeItemDescription, activeItemId, activeMode, editCoordinator]);

  useEffect(() => {
    if (!collabDescriptor || activeMode !== "edit") return;
    if (collab.status === "connecting" || collab.status === "offline") return;
    setContent(collab.value);
    setEditContent(collab.value);
  }, [activeMode, collab.status, collab.value, collabDescriptor]);

  // 编辑模式变更检测
  useEffect(() => {
    if (activeMode === "edit" && item) {
      setHasChanges(
        editContent !== content || editDescription !== item.description
      );
    }
  }, [editContent, editDescription, content, activeMode, item]);

  const handleSave = async () => {
    if (!workingDir && !(documentApiMode === "project" && projectId)) return;
    setSaving(true);
    try {
      if (activeMode === "add") {
        if (!addTitle.trim() || !addContent.trim()) return;
        const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
        if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
        if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
        const res = await fetch(
          documentApiMode === "project" && projectId
            ? `/api/projects/${encodeURIComponent(projectId)}/documents${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""}`
            : `/api/knowledge?${params.toString()}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: addTitle.trim(),
              description: addDescription.trim(),
              content: addContent,
            }),
          }
        );
        const data = await res.json();
        if (data.success) {
          toast({ title: "添加成功" });
          onSaved(documentApiMode === "project" ? toKnowledgeItem(data.data.snapshot) : data.data as KnowledgeItem);
          onOpenChange(false);
        } else {
          toast({
            title: "添加失败",
            description: data.error?.message,
            variant: "destructive",
          });
        }
      } else if (activeMode === "edit" && item) {
        if (collabDescriptor) {
          await collab.flush();
          const contentToSave = collab.ytext?.toString() ?? editContent;
          const params = workingDir ? new URLSearchParams({ workingDir }) : new URLSearchParams();
          if (projectId && documentApiMode === "legacy") params.set("projectId", projectId);
          if (sessionId && documentApiMode === "legacy") params.set("sessionId", sessionId);
          const res = await fetch(
            `/api/knowledge/${item.id}?${params.toString()}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                description: editDescription,
                content: contentToSave,
              }),
            },
          );
          const data = await res.json();
          if (!data.success) {
            toast({
              title: "保存失败",
              description: data.error?.message,
              variant: "destructive",
            });
            return;
          }
          setContent(contentToSave);
          setEditContent(contentToSave);
          toast({ title: "保存成功" });
          onSaved(data.data as KnowledgeItem);
          onOpenChange(false);
        } else {
          const saved = await editCoordinatorRef.current?.flush();
          if (!saved) return;
          toast({ title: "保存成功" });
          onOpenChange(false);
        }
      }
    } catch {
      toast({
        title: activeMode === "add" ? "添加失败" : "保存失败",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // 标题栏
  const renderTitle = () => {
    if (activeMode === "add") {
      return (
        <DialogTitle className="flex items-center gap-2">
          <span className="text-sm">添加知识文档</span>
        </DialogTitle>
      );
    }

    return (
      <DialogTitle className="flex items-center gap-2">
        <Pencil className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {item?.title}
        </span>
        {activeMode === "read" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-xs px-1.5"
            onClick={() => setActiveMode("edit")}
          >
            <Pencil className="h-3 w-3" />
            编辑
          </Button>
        ) : (
          <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
            编辑中
          </span>
        )}
      </DialogTitle>
    );
  };

  // 内容区
  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (activeMode === "add") {
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              标题
            </label>
            <Input
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="输入文档标题"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              描述
            </label>
            <Input
              value={addDescription}
              onChange={(e) => setAddDescription(e.target.value)}
              placeholder="简要描述文档内容"
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0">
            <label className="text-xs font-medium text-muted-foreground">
              内容（Markdown）
            </label>
            <div className="mt-1 h-[300px]">
              <DocumentEditor
                value={addContent}
                onChange={setAddContent}
                localizeRemoteImage={sessionId ? localizeRemoteImage : undefined}
                referenceProvider={projectId ? referenceProvider : undefined}
                onReferenceClick={onReferenceClick}
              />
            </div>
          </div>
        </div>
      );
    }

    if (activeMode === "edit") {
      return (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              描述
            </label>
            <Input
              value={editDescription}
              onChange={(e) => {
                const description = e.target.value;
                setEditDescription(description);
                if (!collabDescriptor) {
                  editCoordinatorRef.current?.markDirty({
                    content: editContent,
                    description,
                  });
                }
              }}
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0">
            <DocumentEditor
              documentKey={`${projectId ?? workingDir}:knowledge:${item?.id}`}
              value={editContent}
              onChange={(nextValue) => {
                setEditContent(nextValue);
                if (collabDescriptor) {
                  replaceCollabText(collab.ytext, nextValue);
                } else {
                  editCoordinatorRef.current?.markDirty({
                    content: nextValue,
                    description: editDescription,
                  });
                }
              }}
              localizeRemoteImage={sessionId ? localizeRemoteImage : undefined}
              referenceContext={referenceContext}
              referenceProvider={referenceContext ? referenceProvider : undefined}
              onReferenceClick={onReferenceClick}
            />
          </div>
          {!collabDescriptor && (
            <DocumentSaveStatusBar
              snapshot={editSaveSnapshot}
              onRetry={() => {
                void editCoordinatorRef.current?.retry();
              }}
              onRestoreDraft={() => {
                void restoreEditDraft();
              }}
              onDiscardDraft={() => {
                void discardEditDraft();
              }}
            />
          )}
          {collabDescriptor && (
            <div className="text-[11px] text-muted-foreground">
              协同状态：{collab.status === "synced" ? "已同步" : collab.status === "saving" ? "保存中" : collab.status === "connecting" ? "连接中" : "离线"}
              {collab.awareness.length > 1 ? ` · ${collab.awareness.length} 人在线` : ""}
            </div>
          )}
        </div>
      );
    }

    // 阅读模式 - 使用 Streamdown 渲染 Markdown
    return (
      <div className="markdown-editor-content text-sm overflow-y-auto h-full scrollbar-thin px-3 py-2" onClick={handleReferenceClick}>
        <Streamdown plugins={{ code, cjk }} controls={{ table: false, code: true }}>
          {content || "（无内容）"}
        </Streamdown>
      </div>
    );
  };

  // 底部按钮
  const renderFooter = () => {
    if (activeMode === "add") {
      return (
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !addTitle.trim() || !addContent.trim()}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            添加
          </Button>
        </DialogFooter>
      );
    }

    if (activeMode === "edit") {
      return (
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              if (hasChanges) {
                setEditContent(content);
                setEditDescription(item?.description || "");
              }
              setActiveMode("read");
            }}
          >
            {hasChanges ? "取消编辑（有未保存的更改）" : "返回阅读"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={(saving || editSaveSnapshot.status === "saving") || !hasChanges}
          >
            {saving || editSaveSnapshot.status === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                保存
              </>
            )}
          </Button>
        </DialogFooter>
      );
    }

    // 阅读模式
    return (
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </DialogFooter>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col">
        <DialogHeader>{renderTitle()}</DialogHeader>

        <div ref={referenceEditorContainerRef} className="relative flex-1 min-h-0 flex flex-col border rounded-md overflow-hidden p-4">
          {renderContent()}
          {projectId && workspaceId && item?.source === "user" && (
            <MarkdownReferenceLinksPanel
              projectId={projectId}
              sessionId={sessionId}
              source={referenceContext?.source}
              target={referenceTarget}
              onTargetClick={(target, labelSnapshot) => onReferenceClick?.({ target, labelSnapshot })}
              onMentionNavigate={handleUnlinkedMentionNavigate}
              onMentionClick={(mention) => {
                if (!window.confirm(`将「${mention.label}」转换为项目引用？`)) return;
                const current = activeMode === "edit" ? editContent : content;
                if (current.slice(mention.start, mention.end) !== mention.label) return;
                const next = `${current.slice(0, mention.start)}${serializeMarkdownReference(mention.target, mention.label)}${current.slice(mention.end)}`;
                if (activeMode === "edit") {
                  setEditContent(next);
                  if (collabDescriptor) {
                    replaceCollabText(collab.ytext, next);
                  } else {
                    editCoordinatorRef.current?.markDirty({
                      content: next,
                      description: editDescription,
                    });
                  }
                } else {
                  setContent(next);
                }
              }}
            />
          )}
        </div>

        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}

/** 读取知识库文件内容 */
async function readFileContent(
  workingDir: string,
  fileName: string
): Promise<string> {
  const res = await fetch(
    `/api/knowledge/content?workingDir=${encodeURIComponent(workingDir)}&fileName=${encodeURIComponent(fileName)}`
  );
  if (res.ok) {
    const data = await res.json();
    if (data.success) {
      return data.data.content;
    }
  }
  return "";
}
