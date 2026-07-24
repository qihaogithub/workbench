"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import {
  FolderKanban,
  Search,
  ChevronRight,
  FileText,
  Layers,
} from "lucide-react";
import { cn } from "../lib/utils";
import type { ProjectReference } from "./inline-tag-input";

interface ProjectReferencePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectReference[];
  onSelect: (project: ProjectReference) => void;
}

interface CategoryNode {
  label: string;
  fullPath: string;
  count: number;
  children: CategoryNode[];
}

function buildCategoryTree(projects: ProjectReference[]): CategoryNode[] {
  const rootMap = new Map<string, CategoryNode>();

  for (const p of projects) {
    const cat = p.category;
    if (!cat) continue;
    const parts = cat.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    const rootLabel = parts[0];
    const rest = parts.slice(1);
    const subLabel = rest.join(" / ");

    let root = rootMap.get(rootLabel);
    if (!root) {
      root = { label: rootLabel, fullPath: rootLabel, count: 0, children: [] };
      rootMap.set(rootLabel, root);
    }
    root.count++;

    if (subLabel) {
      const childFullPath = `${rootLabel}/${subLabel}`;
      const existing = root.children.find((c) => c.fullPath === childFullPath);
      if (existing) {
        existing.count++;
      } else {
        root.children.push({
          label: subLabel,
          fullPath: childFullPath,
          count: 1,
          children: [],
        });
      }
    }
  }

  return Array.from(rootMap.values())
    .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"))
    .map((node) => ({
      ...node,
      children: node.children.sort((a, b) =>
        a.label.localeCompare(b.label, "zh-CN"),
      ),
    }));
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function ProjectCard({
  project,
  onSelect,
}: {
  project: ProjectReference;
  onSelect: (p: ProjectReference) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-colors hover:bg-accent",
      )}
      onClick={() => onSelect(project)}
    >
      <div className="aspect-video w-full bg-muted">
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileText className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{project.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {project.category && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {project.category.split("/").pop()}
            </Badge>
          )}
          {project.demoCount != null && (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {project.demoCount}
            </span>
          )}
        </div>
        {project.updatedAt != null && (
          <span className="text-[10px] text-muted-foreground/60">
            {formatTime(project.updatedAt)}
          </span>
        )}
      </div>
    </button>
  );
}

export function ProjectReferencePicker({
  open,
  onOpenChange,
  projects,
  onSelect,
}: ProjectReferencePickerProps) {
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const categoryTree = useMemo(() => buildCategoryTree(projects), [projects]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedCategory(null);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = useMemo(() => {
    let result = projects;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.category && p.category.toLowerCase().includes(q)),
      );
    } else if (selectedCategory) {
      result = result.filter((p) => {
        if (!p.category) return false;
        return (
          p.category === selectedCategory ||
          p.category.startsWith(selectedCategory + "/")
        );
      });
    }

    return result;
  }, [projects, search, selectedCategory]);

  const unCategorizedCount = useMemo(
    () => projects.filter((p) => !p.category).length,
    [projects],
  );

  const totalCount = projects.length;

  const toggleExpand = (label: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[540px] flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <DialogTitle className="text-base">引用其他项目</DialogTitle>
        </DialogHeader>
        <div className="relative mx-5 mt-3 shrink-0">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="搜索项目..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-1 min-h-0 mt-3">
          <ScrollArea className="w-[180px] shrink-0 border-r px-3 py-2">
            <div className="space-y-0.5">
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  !selectedCategory &&
                    !search.trim() &&
                    "bg-accent font-medium",
                )}
                onClick={() => setSelectedCategory(null)}
              >
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate text-left">全部项目</span>
                <span className="text-xs text-muted-foreground">
                  {totalCount}
                </span>
              </button>

              {unCategorizedCount > 0 && (
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                    selectedCategory === "__uncategorized__" &&
                      "bg-accent font-medium",
                  )}
                  onClick={() => setSelectedCategory("__uncategorized__")}
                >
                  <span className="flex-1 truncate text-left text-muted-foreground">
                    未分类
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {unCategorizedCount}
                  </span>
                </button>
              )}

              {categoryTree.map((node) => (
                <div key={node.fullPath}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                      selectedCategory === node.fullPath &&
                        "bg-accent font-medium",
                    )}
                    onClick={() => {
                      setSelectedCategory(node.fullPath);
                      if (node.children.length > 0) {
                        toggleExpand(node.label);
                      }
                    }}
                  >
                    {node.children.length > 0 && (
                      <ChevronRight
                        className={cn(
                          "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
                          expandedCategories.has(node.label) && "rotate-90",
                        )}
                      />
                    )}
                    {node.children.length === 0 && <span className="w-3 shrink-0" />}
                    <span className="flex-1 truncate text-left">
                      {node.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {node.count}
                    </span>
                  </button>
                  {expandedCategories.has(node.label) &&
                    node.children.map((child) => (
                      <button
                        key={child.fullPath}
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md py-1.5 pl-8 pr-2 text-sm transition-colors hover:bg-accent",
                          selectedCategory === child.fullPath &&
                            "bg-accent font-medium",
                        )}
                        onClick={() => setSelectedCategory(child.fullPath)}
                      >
                        <span className="flex-1 truncate text-left text-muted-foreground">
                          {child.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {child.count}
                        </span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </ScrollArea>

          <ScrollArea className="flex-1 px-5 py-3">
            {filtered.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  未找到匹配的项目
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                {filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
