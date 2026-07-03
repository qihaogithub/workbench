"use client";

import { useState } from "react";
import type {
  DemoPageMeta,
  DemoFolderMeta,
  DemoPageRuntimeType,
} from "@opencode-workbench/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  FolderPlus,
  Copy,
  MoveRight,
  Bot,
} from "lucide-react";
import type { FlatTreeItem } from "./demo-page-tree-utils";

interface DemoPageTreeItemProps {
  flatItem: FlatTreeItem;
  projectId: string;
  sessionId: string | null;
  activeDemoId: string | null;
  folders: DemoFolderMeta[];
  pages: DemoPageMeta[];
  isExpanded: boolean;
  activeDragId: string | null;
  onToggleFolder: (folderId: string) => void;
  onPageSelect: (pageId: string) => void;
  onPageRename: (pageId: string, name: string) => void;
  onPageCopy: (pageId: string) => void;
  onPageDelete: (pageId: string) => void;
  onRequestRuntimeConversion?: (
    pageId: string,
    targetRuntimeType: DemoPageRuntimeType,
  ) => void;
  onRenameFolder: (folderId: string, name: string) => void;
  onDeleteFolder: (folderId: string, deleteContents: boolean) => void;
  onCreateSubFolder: (parentId: string) => void;
  onMovePageToFolder: (pageId: string, targetParentId: string | null) => void;
}

export function DemoPageTreeItem({
  flatItem,
  projectId,
  sessionId,
  activeDemoId,
  folders,
  pages,
  isExpanded,
  activeDragId,
  onToggleFolder,
  onPageSelect,
  onPageRename,
  onPageCopy,
  onPageDelete,
  onRequestRuntimeConversion,
  onRenameFolder,
  onDeleteFolder,
  onCreateSubFolder,
  onMovePageToFolder,
}: DemoPageTreeItemProps) {
  const { item, depth, hasChildren } = flatItem;
  const isFolder = item.id.startsWith("folder_");
  const isDraggingPage = activeDragId !== null && !activeDragId.startsWith("folder_");
  const shouldHoldFolderPosition = isFolder && isDraggingPage;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const startEditing = (id: string, currentName: string) => {
    setEditingId(id);
    setEditingName(currentName);
  };

  const finishEditing = () => {
    const trimmed = editingName.trim();
    if (trimmed && editingId) {
      if (isFolder) {
        onRenameFolder(editingId, trimmed);
      } else {
        onPageRename(editingId, trimmed);
      }
    }
    setEditingId(null);
    setEditingName("");
  };

  const isActive = !isFolder && activeDemoId === item.id;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: shouldHoldFolderPosition
          ? undefined
          : CSS.Transform.toString(transform),
        transition: shouldHoldFolderPosition ? undefined : transition,
        paddingLeft: `${depth * 20 + 8}px`,
      }}
      className={cn(
        "group flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm transition-colors select-none",
        isActive
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-muted border border-transparent",
        isDragging && "opacity-30",
      )}
    >
      <div
        className="flex items-center gap-1.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        onClick={() => {
          if (isFolder) {
            onToggleFolder(item.id);
          } else {
            onPageSelect(item.id);
          }
        }}
        onDoubleClick={() => {
          if (editingId === item.id) return;
          startEditing(item.id, item.name);
        }}
      >
        {isFolder && hasChildren && (
          <span className="shrink-0 text-muted-foreground">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        )}
        {isFolder && !hasChildren && <span className="w-3.5 shrink-0" />}

        {isFolder ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500" />
          )
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        {editingId === item.id ? (
          <Input
            autoFocus
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={finishEditing}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              else if (e.key === "Escape") {
                setEditingId(null);
                setEditingName("");
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-7 text-sm px-2 py-0 flex-1 min-w-0"
          />
        ) : (
          <span className="truncate flex-1 min-w-0">{item.name}</span>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {isActive && (
          <Badge variant="secondary" className="text-[10px] h-5">
            当前
          </Badge>
        )}

        {isFolder ? (
          <FolderContextMenu
            folderId={item.id}
            folderName={item.name}
            onRename={() => startEditing(item.id, item.name)}
            onCreateSubFolder={() => onCreateSubFolder(item.id)}
            onDelete={(deleteContents) =>
              onDeleteFolder(item.id, deleteContents)
            }
          />
        ) : (
          <PageContextMenu
            pageId={item.id}
            pageName={item.name}
            pageParentId={(item as DemoPageMeta).parentId ?? null}
            runtimeType={(item as DemoPageMeta).runtimeType}
            folders={folders}
            onRename={() => startEditing(item.id, item.name)}
            onCopy={() => onPageCopy(item.id)}
            onDelete={() => onPageDelete(item.id)}
            onMoveTo={onMovePageToFolder}
            onRequestRuntimeConversion={onRequestRuntimeConversion}
          />
        )}
      </div>
    </div>
  );
}

export function StaticTreeItem({
  item,
  depth,
  activeDemoId,
}: {
  item: DemoPageMeta | DemoFolderMeta;
  depth: number;
  activeDemoId: string | null;
}) {
  const isFolder = item.id.startsWith("folder_");
  const isActive = !isFolder && activeDemoId === item.id;

  return (
    <div
      className="flex items-center gap-1.5 py-1.5 px-2 rounded-md text-sm bg-popover border shadow-md select-none"
      style={{ paddingLeft: `${depth * 20 + 8}px` }}
    >
      {isFolder ? (
        <Folder className="h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="truncate flex-1 min-w-0">{item.name}</span>
      {isActive && (
        <Badge variant="secondary" className="text-[10px] h-5">
          当前
        </Badge>
      )}
    </div>
  );
}

function FolderContextMenu({
  folderId,
  folderName,
  onRename,
  onCreateSubFolder,
  onDelete,
}: {
  folderId: string;
  folderName: string;
  onRename: () => void;
  onCreateSubFolder: () => void;
  onDelete: (deleteContents: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          重命名
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateSubFolder}>
          <FolderPlus className="mr-2 h-4 w-4" />
          新建子文件夹
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(false)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          删除文件夹（页面移至上级）
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => {
            if (
              confirm(
                `确定要删除文件夹「${folderName}」及其所有内容吗？此操作不可撤销。`,
              )
            ) {
              onDelete(true);
            }
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          删除文件夹及内容
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PageContextMenu({
  pageId,
  pageName,
  pageParentId,
  runtimeType,
  folders,
  onRename,
  onCopy,
  onDelete,
  onMoveTo,
  onRequestRuntimeConversion,
}: {
  pageId: string;
  pageName: string;
  pageParentId: string | null;
  runtimeType?: DemoPageRuntimeType;
  folders: DemoFolderMeta[];
  onRename: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onMoveTo: (pageId: string, targetParentId: string | null) => void;
  onRequestRuntimeConversion?: (
    pageId: string,
    targetRuntimeType: DemoPageRuntimeType,
  ) => void;
}) {
  const moveTargets = folders.filter((f) => f.id !== pageParentId);
  const isPrototype = runtimeType === "prototype-html-css";
  const targetRuntimeType: DemoPageRuntimeType = isPrototype
    ? "high-fidelity-react"
    : "prototype-html-css";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="mr-2 h-4 w-4" />
          重命名
        </DropdownMenuItem>
        {moveTargets.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MoveRight className="mr-2 h-4 w-4" />
              移动到
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {pageParentId !== null && (
                <DropdownMenuItem onClick={() => onMoveTo(pageId, null)}>
                  📄 根级
                </DropdownMenuItem>
              )}
              {moveTargets.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onClick={() => onMoveTo(pageId, f.id)}
                >
                  📁 {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onClick={onCopy}>
          <Copy className="mr-2 h-4 w-4" />
          复制页面
        </DropdownMenuItem>
        {onRequestRuntimeConversion && (
          <DropdownMenuItem
            onClick={() => onRequestRuntimeConversion(pageId, targetRuntimeType)}
          >
            <Bot className="mr-2 h-4 w-4" />
            {isPrototype ? "AI 转高保真页" : "AI 转 HTML/CSS 原型"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={onDelete}>
          <Trash2 className="mr-2 h-4 w-4" />
          删除页面
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
