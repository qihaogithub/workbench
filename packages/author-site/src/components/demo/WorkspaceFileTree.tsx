"use client";

import { useState, useCallback, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WorkspaceFileTreeItem } from "./WorkspaceFileTreeItem";
import { isFileEditable } from "@/lib/workspace-file-utils";
import type { WorkspaceFileNode } from "@/lib/workspace-file-utils";

interface WorkspaceFileTreeProps {
  sessionId: string;
  onFileSelect: (filePath: string, editable: boolean) => void;
}

/**
 * 工作空间文件树容器组件
 * 管理展开/折叠状态、懒加载子目录、文件点击事件
 */
export function WorkspaceFileTree({
  sessionId,
  onFileSelect,
}: WorkspaceFileTreeProps) {
  const [rootTree, setRootTree] = useState<WorkspaceFileNode | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [loadedPaths, setLoadedPaths] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // 加载根目录
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;

    const loadRoot = async () => {
      setLoadingPaths(new Set([""]));
      setError(null);
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/workspace/files?path=`,
        );
        const data = await res.json();
        if (cancelled) return;

        if (data.success) {
          setRootTree(data.data);
          setLoadedPaths(new Set([""]));
        } else {
          setError(data.error?.message || "加载文件树失败");
        }
      } catch {
        if (!cancelled) setError("网络错误，请稍后重试");
      } finally {
        if (!cancelled) setLoadingPaths(new Set());
      }
    };

    loadRoot();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // 懒加载子目录
  const loadChildren = useCallback(
    async (folderPath: string) => {
      if (loadedPaths.has(folderPath)) return;

      setLoadingPaths((prev) => new Set(prev).add(folderPath));
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/workspace/files?path=${encodeURIComponent(folderPath)}`,
        );
        const data = await res.json();

        if (data.success) {
          const children: WorkspaceFileNode[] = data.data.children || [];

          // 合并到现有树中
          setRootTree((prev) => {
            if (!prev) return prev;
            return mergeChildrenIntoTree(prev, folderPath, children);
          });

          setLoadedPaths((prev) => new Set(prev).add(folderPath));
        }
      } catch {
        // 静默失败
      } finally {
        setLoadingPaths((prev) => {
          const next = new Set(prev);
          next.delete(folderPath);
          return next;
        });
      }
    },
    [sessionId, loadedPaths],
  );

  // 切换文件夹展开/折叠
  const handleToggleFolder = useCallback(
    (folderPath: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        if (next.has(folderPath)) {
          next.delete(folderPath);
        } else {
          next.add(folderPath);
          // 首次展开时懒加载
          if (!loadedPaths.has(folderPath)) {
            loadChildren(folderPath);
          }
        }
        return next;
      });
    },
    [loadedPaths, loadChildren],
  );

  // 文件点击
  const handleFileSelect = useCallback(
    (filePath: string) => {
      onFileSelect(filePath, isFileEditable(filePath));
    },
    [onFileSelect],
  );

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!rootTree) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    );
  }

  // 递归渲染树节点
  const renderNodes = (nodes: WorkspaceFileNode[], depth: number) => {
    return nodes.map((node) => (
      <div key={node.path}>
        <WorkspaceFileTreeItem
          node={node}
          depth={depth}
          expandedFolders={expandedFolders}
          loadingPaths={loadingPaths}
          onToggleFolder={handleToggleFolder}
          onFileSelect={handleFileSelect}
        />
        {node.type === "directory" &&
          expandedFolders.has(node.path) &&
          node.children &&
          renderNodes(node.children, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-sm font-medium">📁 工作空间文件</h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="pb-4">
          {rootTree.children && rootTree.children.length > 0 ? (
            renderNodes(rootTree.children, 0)
          ) : (
            <p className="text-sm text-muted-foreground px-4 py-4 text-center">
              工作空间为空
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="px-4 py-2 border-t">
        <p className="text-xs text-muted-foreground">
          💡 点击文件可查看代码，可编辑文件支持保存修改
        </p>
      </div>
    </div>
  );
}

/**
 * 将子节点合并到已有树结构的指定目录中
 */
function mergeChildrenIntoTree(
  root: WorkspaceFileNode,
  targetPath: string,
  children: WorkspaceFileNode[],
): WorkspaceFileNode {
  if (root.path === targetPath) {
    return { ...root, children };
  }

  if (!root.children) return root;

  return {
    ...root,
    children: root.children.map((child) =>
      mergeChildrenIntoTree(child, targetPath, children),
    ),
  };
}
