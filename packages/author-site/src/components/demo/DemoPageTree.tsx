"use client";

import { useState, useMemo, useCallback } from "react";
import type { DemoPageMeta, DemoFolderMeta } from "@opencode-workbench/shared";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useToast } from "@/components/ui/toast-provider";
import { DemoPageTreeItem, StaticTreeItem } from "./DemoPageTreeItem";
import { NewFolderDialog } from "./NewFolderDialog";
import { ImportFromFigmaDialog } from "./ImportFromFigmaDialog";
import { Plus, FileText, FolderPlus, Upload } from "lucide-react";
import {
  flattenTree,
  findItemById,
  reorderSiblings,
  isDescendantLocal,
} from "./demo-page-tree-utils";
import { projectApiClient } from "@/lib/project-api";

interface DemoPageTreeProps {
  projectId: string;
  sessionId: string | null;
  pages: DemoPageMeta[];
  folders: DemoFolderMeta[];
  onPagesChange: (pages: DemoPageMeta[]) => void;
  onFoldersChange: (folders: DemoFolderMeta[]) => void;
  activeDemoId: string | null;
  onPageSelect: (pageId: string) => void;
  onPageRename: (pageId: string, name: string) => void;
  onPageCopy: (pageId: string) => void;
  onPageDelete: (pageId: string) => void;
  onViewCode: (pageId: string) => void;
}

export function DemoPageTree({
  projectId,
  sessionId,
  pages,
  folders,
  onPagesChange,
  onFoldersChange,
  activeDemoId,
  onPageSelect,
  onPageRename,
  onPageCopy,
  onPageDelete,
  onViewCode,
}: DemoPageTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [importFigmaDialogOpen, setImportFigmaDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();

  const flatItems = useMemo(
    () => flattenTree(pages, folders, expandedFolders),
    [pages, folders, expandedFolders],
  );

  const activeItem = activeId
    ? findItemById(activeId, pages, folders)
    : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      if (!sessionId) return;

      const activeItem = findItemById(String(active.id), pages, folders);
      const overItem = findItemById(String(over.id), pages, folders);
      if (!activeItem || !overItem) return;

      const activeIsFolder = activeItem.id.startsWith("folder_");
      const overIsFolder = overItem.id.startsWith("folder_");

      if (activeIsFolder && overIsFolder) {
        if (isDescendantLocal(activeItem.id, overItem.id, folders)) return;
      }

      const activeParent = activeItem.parentId ?? null;
      const overParent = overItem.parentId ?? null;

      if (activeParent === overParent) {
        const pageUpdates: Array<{ id: string; order: number; parentId: string | null }> = [];
        const folderUpdates: Array<{ id: string; order: number; parentId: string | null }> = [];

        if (activeIsFolder) {
          const updated = reorderSiblings(folders, activeParent, activeItem.id, overItem.id);
          onFoldersChange(updated);
          for (const f of updated) {
            if ((f.parentId ?? null) === activeParent) {
              folderUpdates.push({ id: f.id, order: f.order, parentId: f.parentId ?? null });
            }
          }
        } else {
          const updated = reorderSiblings(pages, activeParent, activeItem.id, overItem.id);
          onPagesChange(updated);
          for (const p of updated) {
            if ((p.parentId ?? null) === activeParent) {
              pageUpdates.push({ id: p.id, order: p.order, parentId: p.parentId ?? null });
            }
          }
        }

        try {
          await projectApiClient.reorderDemoPages(
            projectId,
            sessionId,
            pageUpdates,
            folderUpdates.length > 0 ? folderUpdates : undefined,
          );
        } catch {
          toast({ title: "排序保存失败", variant: "destructive" });
        }
      }
    },
    [sessionId, pages, folders, projectId, onPagesChange, onFoldersChange, toast],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleCreateFolder = useCallback(
    async (name: string, parentId: string | null) => {
      if (!sessionId) return;
      try {
        const folder = await projectApiClient.createFolder(projectId, name, sessionId, parentId);
        onFoldersChange([...folders, folder].sort((a, b) => a.order - b.order));
        if (parentId) {
          setExpandedFolders(prev => new Set([...prev, parentId]));
        }
        toast({ title: "文件夹创建成功" });
      } catch (err) {
        toast({
          title: "创建文件夹失败",
          description: err instanceof Error ? err.message : "未知错误",
          variant: "destructive",
        });
      }
    },
    [sessionId, projectId, folders, onFoldersChange, toast],
  );

  const handleRenameFolder = useCallback(
    async (folderId: string, name: string) => {
      if (!sessionId) return;
      try {
        const updated = await projectApiClient.patchFolder(projectId, folderId, sessionId, { name });
        onFoldersChange(folders.map(f => (f.id === folderId ? updated : f)));
        toast({ title: "文件夹已重命名" });
      } catch {
        toast({ title: "重命名失败", variant: "destructive" });
      }
    },
    [sessionId, projectId, folders, onFoldersChange, toast],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string, deleteContents: boolean) => {
      if (!sessionId) return;
      try {
        const deletedPageIds = await projectApiClient.deleteFolder(
          projectId,
          folderId,
          sessionId,
          deleteContents,
        );
        onFoldersChange(folders.filter(f => f.id !== folderId));
        if (deleteContents && deletedPageIds.length > 0) {
          onPagesChange(pages.filter(p => !deletedPageIds.includes(p.id)));
          if (activeDemoId && deletedPageIds.includes(activeDemoId)) {
            const remaining = pages.filter(p => !deletedPageIds.includes(p.id));
            if (remaining.length > 0) {
              onPageSelect(remaining[0].id);
            }
          }
        } else {
          onPagesChange(
            pages.map(p =>
              p.parentId === folderId
                ? { ...p, parentId: folders.find(f => f.id === folderId)?.parentId ?? null }
                : p,
            ),
          );
        }
        toast({ title: deleteContents ? "文件夹及内容已删除" : "文件夹已删除，页面已移至上级" });
      } catch {
        toast({ title: "删除文件夹失败", variant: "destructive" });
      }
    },
    [sessionId, projectId, folders, pages, activeDemoId, onFoldersChange, onPagesChange, onPageSelect, toast],
  );

  const handleAddPage = useCallback(async () => {
    if (!sessionId) {
      toast({ title: "未创建 Session", variant: "destructive" });
      return;
    }
    try {
      const res = await projectApiClient.createDemoPage(
        projectId,
        "新建页面",
        sessionId,
      );
      onPagesChange([...pages, res].sort((a, b) => a.order - b.order));
      toast({ title: "页面创建成功" });
    } catch {
      toast({ title: "创建失败", variant: "destructive" });
    }
  }, [sessionId, projectId, pages, onPagesChange, toast]);

  const handleImportFigmaCreated = useCallback((page: DemoPageMeta) => {
    onPagesChange([...pages, page].sort((a, b) => a.order - b.order));
    onPageSelect(page.id);
  }, [pages, onPagesChange, onPageSelect]);

  const handleMovePageToFolder = useCallback(
    async (pageId: string, targetParentId: string | null) => {
      if (!sessionId) return;
      try {
        const sameParent = pages.filter(p => (p.parentId ?? null) === targetParentId);
        const nextOrder = sameParent.length > 0 ? Math.max(...sameParent.map(p => p.order)) + 1 : 0;
        const updated = await projectApiClient.patchDemoPageMeta(projectId, pageId, sessionId, {
          parentId: targetParentId,
          order: nextOrder,
        });
        onPagesChange(pages.map(p => (p.id === pageId ? updated : p)));
        if (targetParentId) {
          setExpandedFolders(prev => new Set([...prev, targetParentId]));
        }
      } catch {
        toast({ title: "移动页面失败", variant: "destructive" });
      }
    },
    [sessionId, projectId, pages, onPagesChange, toast],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-sm font-medium">📄 页面列表</h3>
        <div className="flex items-center gap-1">
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                添加
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="end">
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setPopoverOpen(false);
                  handleAddPage();
                }}
              >
                <FileText className="h-4 w-4" />
                添加页面
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setPopoverOpen(false);
                  setNewFolderParentId(null);
                  setNewFolderDialogOpen(true);
                }}
              >
                <FolderPlus className="h-4 w-4" />
                添加文件夹
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  setPopoverOpen(false);
                  setImportFigmaDialogOpen(true);
                }}
              >
                <Upload className="h-4 w-4" />
                从 Figma 导入
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 pb-4">
          {flatItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              暂无页面
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={flatItems.map(f => f.item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-0.5">
                  {flatItems.map(flat => (
                    <DemoPageTreeItem
                      key={flat.item.id}
                      flatItem={flat}
                      projectId={projectId}
                      sessionId={sessionId}
                      activeDemoId={activeDemoId}
                      folders={folders}
                      pages={pages}
                      isExpanded={flat.isExpanded}
                      onToggleFolder={toggleFolder}
                      onPageSelect={onPageSelect}
                      onPageRename={onPageRename}
                      onPageCopy={onPageCopy}
                      onPageDelete={onPageDelete}
                      onViewCode={onViewCode}
                      onRenameFolder={handleRenameFolder}
                      onDeleteFolder={handleDeleteFolder}
                      onCreateSubFolder={(parentId) => {
                        setNewFolderParentId(parentId);
                        setNewFolderDialogOpen(true);
                      }}
                      onMovePageToFolder={handleMovePageToFolder}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeItem ? (
                  <StaticTreeItem
                    item={activeItem}
                    depth={
                      flatItems.find(f => f.item.id === activeItem.id)?.depth ?? 0
                    }
                    activeDemoId={activeDemoId}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            💡 拖拽可调整同级顺序，右键菜单可移动到文件夹
          </p>
        </div>
      </ScrollArea>

      <NewFolderDialog
        open={newFolderDialogOpen}
        onOpenChange={setNewFolderDialogOpen}
        parentId={newFolderParentId}
        folders={folders}
        onCreate={handleCreateFolder}
      />

      <ImportFromFigmaDialog
        open={importFigmaDialogOpen}
        onOpenChange={setImportFigmaDialogOpen}
        projectId={projectId}
        sessionId={sessionId}
        onPageCreated={handleImportFigmaCreated}
      />
    </div>
  );
}
