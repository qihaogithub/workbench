import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
  size,
} from "@floating-ui/dom";
import {
  ChevronRight,
  ChevronDown,
  Check,
  FileText,
  Folder,
  Layers,
  Layout,
  Search,
  X,
} from "lucide-react";
import {
  encodeMarkdownReferenceUri,
  type MarkdownReferenceCandidate,
} from "@workbench/shared/markdown-reference";
import "./project-reference-picker.css";

export interface ReferenceTreeNode {
  id: string;
  label: string;
  kind: string;
  candidate?: MarkdownReferenceCandidate;
  children: ReferenceTreeNode[];
}

/** Merge ancestor paths by stable identity, never by the (possibly duplicate) name. */
export function buildReferenceTree(
  candidates: readonly MarkdownReferenceCandidate[],
  tab: "page" | "document",
): ReferenceTreeNode[] {
  const roots: ReferenceTreeNode[] = [];
  const nodes = new Map<string, ReferenceTreeNode>();
  for (const candidate of candidates) {
    if (
      candidate.target.kind === "project" ||
      (candidate.target.kind === "document") !== (tab === "document")
    )
      continue;
    const ancestors =
      tab === "document"
        ? [
            {
              id: `documents:${candidate.documentGroup || "知识文档"}`,
              label: candidate.documentGroup || "知识文档",
              kind: "group",
            },
          ]
        : (candidate.hierarchy ?? []);
    let siblings = roots;
    for (const ancestor of ancestors) {
      let node = nodes.get(ancestor.id);
      if (!node) {
        node = { ...ancestor, children: [] };
        nodes.set(node.id, node);
        siblings.push(node);
      }
      siblings = node.children;
    }
    const id = encodeMarkdownReferenceUri(candidate.target);
    const existing = nodes.get(id);
    const label =
      candidate.label ||
      candidate.displayPath.split(" / ").pop() ||
      candidate.displayPath;
    if (existing)
      Object.assign(existing, {
        candidate,
        label,
        kind: candidate.target.kind,
      });
    else {
      const node = {
        id,
        label,
        kind: candidate.target.kind,
        candidate,
        children: [],
      };
      nodes.set(id, node);
      siblings.push(node);
    }
  }
  return roots;
}

export function ProjectReferencePicker({
  candidates,
  status,
  anchor,
  onSelect,
  onClose,
  onRetry,
  projects,
  projectId,
  currentProjectId,
  onProjectChange,
  projectsStatus = "ready",
  onProjectsRetry,
}: {
  candidates: readonly MarkdownReferenceCandidate[];
  status: "loading" | "ready" | "error";
  anchor: { left: number; top: number };
  onSelect: (candidate: MarkdownReferenceCandidate) => void;
  onClose: () => void;
  onRetry: () => void;
  projects?: readonly { id: string; name: string }[];
  projectId?: string;
  currentProjectId?: string;
  onProjectChange?: (id: string) => void;
  projectsStatus?: "loading" | "ready" | "error";
  onProjectsRetry?: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"page" | "document">("page");
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const projectMenu = useRef<HTMLDivElement>(null);
  const projectTrigger = useRef<HTMLButtonElement>(null);
  const projectSearchInput = useRef<HTMLInputElement>(null);
  const selectedProjectId = projectId ?? currentProjectId;
  const selectedProject = projects?.find(
    (project) => project.id === selectedProjectId,
  );
  const orderedProjects = useMemo(() => {
    if (!projects) return [];
    return [...projects].sort(
      (left, right) =>
        Number(right.id === currentProjectId) -
        Number(left.id === currentProjectId),
    );
  }, [currentProjectId, projects]);
  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLocaleLowerCase();
    if (!query) return orderedProjects;
    return orderedProjects.filter((project) =>
      project.name.toLocaleLowerCase().includes(query),
    );
  }, [orderedProjects, projectSearch]);
  const tree = useMemo(
    () => buildReferenceTree(candidates, tab),
    [candidates, tab],
  );
  const [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const place = () => {
      const parent = element.parentElement?.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const left = (parent?.left ?? 0) + anchor.left;
      const top = (parent?.top ?? 0) + anchor.top;
      setPosition({
        left: Math.max(8, Math.min(left, window.innerWidth - rect.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - rect.height - 8)),
      });
    };
    place();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    observer?.observe(element);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);
  useLayoutEffect(() => {
    const trigger = projectTrigger.current;
    const menu = projectMenu.current;
    if (!projectMenuOpen || !trigger || !menu) return;
    const theme = getComputedStyle(root.current!);
    for (const variable of [
      "--crepe-color-surface",
      "--crepe-color-outline",
      "--crepe-color-on-surface",
      "--crepe-color-on-surface-variant",
      "--crepe-color-hover",
      "--crepe-font-default",
    ]) {
      menu.style.setProperty(variable, theme.getPropertyValue(variable));
    }
    let disposed = false;
    let focused = false;
    return (() => {
      const cleanup = autoUpdate(trigger, menu, () => {
        void computePosition(trigger, menu, {
          placement: "bottom-start",
          strategy: "fixed",
          middleware: [
            offset(4),
            flip({ padding: 8 }),
            shift({ padding: 8 }),
            size({
              padding: 8,
              apply({ availableHeight, elements }) {
                elements.floating.style.maxHeight = `${Math.max(0, Math.min(340, availableHeight))}px`;
              },
            }),
          ],
        })
          .then(({ x, y }) => {
            if (!disposed)
              Object.assign(menu.style, {
                left: `${x}px`,
                top: `${y}px`,
                width: `${Math.min(trigger.getBoundingClientRect().width, window.innerWidth - 16)}px`,
                visibility: "visible",
              });
            if (!disposed && !focused) {
              focused = true;
              projectSearchInput.current?.focus({ preventScroll: true });
            }
          })
          .catch(() => {
            if (!disposed) setProjectMenuOpen(false);
          });
      });
      return () => {
        disposed = true;
        cleanup();
      };
    })();
  }, [projectMenuOpen]);
  useEffect(() => {
    root.current
      ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !projectMenu.current?.contains(event.target)
      )
        onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [onClose]);
  const toggle = (nodeId: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  const selectProject = (nextProjectId: string) => {
    onProjectChange?.(nextProjectId);
    setProjectMenuOpen(false);
    setProjectSearch("");
    setCollapsed(new Set<string>());
    root.current
      ?.querySelector<HTMLButtonElement>(".project-reference-project-trigger")
      ?.focus();
  };
  const renderNode = (node: ReferenceTreeNode, depth: number) => {
    const expanded = !collapsed.has(node.id);
    const Icon =
      node.kind === "page"
        ? Layout
        : node.kind === "config"
          ? Layers
          : node.kind === "document"
            ? FileText
            : Folder;
    return (
      <div key={node.id} role="none">
        <div
          className="project-reference-row"
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {node.children.length > 0 ? (
            <button
              type="button"
              className="project-reference-expand"
              aria-label={`${expanded ? "收起" : "展开"}${node.label}`}
              aria-expanded={expanded}
              onClick={() => toggle(node.id)}
            >
              <ChevronRight
                size={14}
                style={{ transform: expanded ? "rotate(90deg)" : undefined }}
              />
            </button>
          ) : (
            <span className="project-reference-expand" />
          )}
          <button
            type="button"
            role="treeitem"
            data-reference-node={node.id}
            aria-level={depth + 1}
            aria-expanded={node.children.length ? expanded : undefined}
            className="project-reference-name"
            title={node.candidate?.displayPath}
            onClick={() =>
              node.candidate ? onSelect(node.candidate) : toggle(node.id)
            }
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" && node.children.length) {
                event.preventDefault();
                setCollapsed((previous) => {
                  const next = new Set(previous);
                  next.delete(node.id);
                  return next;
                });
              }
              if (event.key === "ArrowLeft" && node.children.length) {
                event.preventDefault();
                setCollapsed((previous) => new Set(previous).add(node.id));
              }
            }}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{node.label}</span>
          </button>
        </div>
        {expanded && node.children.length > 0 && (
          <div role="group">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  return (
    <div
      ref={root}
      className="document-reference-menu project-reference-picker"
      style={position}
      role="dialog"
      aria-label="插入项目引用"
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          if (projectMenuOpen) {
            setProjectMenuOpen(false);
            setProjectSearch("");
            root.current
              ?.querySelector<HTMLButtonElement>(
                ".project-reference-project-trigger",
              )
              ?.focus();
          } else {
            onClose();
          }
          return;
        }
        if (
          event.target instanceof HTMLInputElement ||
          (event.target instanceof HTMLButtonElement &&
            event.target.closest(".project-reference-project-menu"))
        )
          return;
        if (
          event.key === "ArrowDown" ||
          event.key === "ArrowUp" ||
          event.key === "Home" ||
          event.key === "End"
        ) {
          const rows = [
            ...root.current!.querySelectorAll<HTMLButtonElement>(
              "[data-reference-node]",
            ),
          ];
          if (!rows.length) return;
          event.preventDefault();
          const index = rows.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? rows.length - 1
                : (index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) %
                  rows.length;
          rows[next].focus({ preventScroll: true });
          rows[next].scrollIntoView?.({ block: "nearest" });
        }
      }}
    >
      <div className="project-reference-heading">
        <span>插入项目引用</span>
        <button type="button" aria-label="关闭项目引用" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {onProjectChange && (
        <div className="project-reference-project-picker">
          <button
            ref={projectTrigger}
            type="button"
            className="project-reference-project-trigger"
            aria-label={
              selectedProject?.name || selectedProjectId || "选择项目"
            }
            aria-expanded={projectMenuOpen}
            aria-haspopup="listbox"
            onClick={() => setProjectMenuOpen((open) => !open)}
          >
            <span className="project-reference-project-trigger-copy">
              <span className="project-reference-project-label">项目</span>
              <span className="project-reference-project-value">
                {selectedProject?.name || selectedProjectId || "选择项目"}
              </span>
              {selectedProjectId === currentProjectId && (
                <span className="project-reference-current-badge">
                  当前项目
                </span>
              )}
            </span>
            <ChevronDown
              size={15}
              aria-hidden="true"
              className={projectMenuOpen ? "is-open" : undefined}
            />
          </button>
          {projectMenuOpen &&
            createPortal(
              <div
                ref={projectMenu}
                className="project-reference-picker project-reference-project-menu"
                style={{ visibility: "hidden" }}
                role="dialog"
                aria-label="选择项目"
              >
                <label className="project-reference-project-search">
                  <Search size={14} aria-hidden="true" />
                  <input
                    ref={projectSearchInput}
                    type="search"
                    value={projectSearch}
                    placeholder="搜索项目"
                    aria-label="搜索项目"
                    onChange={(event) => setProjectSearch(event.target.value)}
                  />
                </label>
                {projectsStatus === "loading" ? (
                  <p className="project-reference-project-state" role="status">
                    正在加载项目…
                  </p>
                ) : projectsStatus === "error" ? (
                  <div className="project-reference-project-state" role="alert">
                    <span>项目列表加载失败</span>
                    {onProjectsRetry && (
                      <button type="button" onClick={onProjectsRetry}>
                        重试
                      </button>
                    )}
                  </div>
                ) : filteredProjects.length ? (
                  <div role="listbox" aria-label="项目列表">
                    {filteredProjects.map((project, index) => (
                      <div role="presentation" key={project.id}>
                        {(index === 0 ||
                          filteredProjects[index - 1].id ===
                            currentProjectId) && (
                          <div
                            className="project-reference-project-group"
                            role="presentation"
                          >
                            {project.id === currentProjectId
                              ? "当前项目"
                              : "其他项目"}
                          </div>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={project.id === selectedProjectId}
                          className="project-reference-project-option"
                          onClick={() => selectProject(project.id)}
                        >
                          <span>{project.name || project.id}</span>
                          {project.id === currentProjectId && (
                            <span className="project-reference-current-badge">
                              当前
                            </span>
                          )}
                          {project.id === selectedProjectId && (
                            <Check size={14} aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="project-reference-project-state" role="status">
                    {projects?.length ? "没有匹配的项目" : "暂无可用项目"}
                  </p>
                )}
                <div className="project-reference-project-state">
                  仅显示有访问权限的项目
                </div>
              </div>,
              root.current?.parentElement ?? document.body,
            )}
        </div>
      )}
      <div
        className="project-reference-tabs"
        role="tablist"
        aria-label="引用类型"
      >
        {(["page", "document"] as const).map((value) => (
          <button
            key={value}
            id={`${id}-${value}`}
            aria-controls={`${id}-panel`}
            role="tab"
            type="button"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next = value === "page" ? "document" : "page";
                setTab(next);
                document.getElementById(`${id}-${next}`)?.focus();
              }
            }}
          >
            {value === "page" ? "页面" : "文档"}
          </button>
        ))}
      </div>
      <div
        className="project-reference-content"
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${tab}`}
        aria-busy={status === "loading"}
      >
        {status === "loading" ? (
          <p role="status">正在加载项目内容…</p>
        ) : status === "error" ? (
          <div role="alert">
            <p>项目内容加载失败</p>
            <button type="button" onClick={onRetry}>
              重试
            </button>
          </div>
        ) : tree.length ? (
          <div
            role="tree"
            aria-label={tab === "page" ? "页面与配置项" : "项目文档"}
          >
            {tree.map((node) => renderNode(node, 0))}
          </div>
        ) : (
          <p role="status">
            {tab === "page" ? "暂无可引用的页面或配置项" : "暂无可引用的文档"}
          </p>
        )}
      </div>
      <div className="project-reference-footer">
        {tab === "page" ? "点击名称插入 · 点击箭头展开" : "选择文档，插入引用"}
      </div>
    </div>
  );
}
