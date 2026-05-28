"use client";

import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode2,
  FileJson,
  FileText,
  Eye,
  Pencil,
} from "lucide-react";
import type { WorkspaceFileNode } from "@/lib/workspace-file-utils";
import { isFileEditable, getFileIcon } from "@/lib/workspace-file-utils";
import { Loader2 } from "lucide-react";

interface WorkspaceFileTreeItemProps {
  node: WorkspaceFileNode;
  depth: number;
  expandedFolders: Set<string>;
  loadingPaths: Set<string>;
  onToggleFolder: (path: string) => void;
  onFileSelect: (filePath: string) => void;
}

/** 根据文件类型返回对应图标 */
function FileIcon({ name }: { name: string }) {
  const iconType = getFileIcon(name);
  switch (iconType) {
    case "tsx":
      return <FileCode2 className="h-4 w-4 text-blue-400 shrink-0" />;
    case "json":
      return <FileJson className="h-4 w-4 text-yellow-400 shrink-0" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

export function WorkspaceFileTreeItem({
  node,
  depth,
  expandedFolders,
  loadingPaths,
  onToggleFolder,
  onFileSelect,
}: WorkspaceFileTreeItemProps) {
  const isDirectory = node.type === "directory";
  const isExpanded = expandedFolders.has(node.path);
  const isLoading = loadingPaths.has(node.path);
  const editable = !isDirectory && isFileEditable(node.path);

  const indent = depth * 16 + 8;

  if (isDirectory) {
    return (
      <div>
        <button
          className="flex items-center gap-1.5 w-full py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors"
          style={{ paddingLeft: indent }}
          onClick={() => onToggleFolder(node.path)}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          ) : isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 shrink-0" />
          )}
          <span className="truncate text-foreground">{node.name}</span>
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        className="flex items-center gap-1.5 w-full py-1 px-2 text-sm hover:bg-accent/50 rounded-sm transition-colors group"
        style={{ paddingLeft: indent + 16 }}
        onClick={() => onFileSelect(node.path)}
      >
        <FileIcon name={node.name} />
        <span className="truncate text-foreground flex-1 text-left">
          {node.name}
        </span>
        <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Eye className="h-3 w-3 text-muted-foreground" />
          {editable && <Pencil className="h-3 w-3 text-blue-400" />}
        </span>
      </button>
    </div>
  );
}
