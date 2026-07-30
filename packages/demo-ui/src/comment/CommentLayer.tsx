"use client";

/**
 * CommentLayer：评论功能编排层。
 *
 * 包裹预览区域（PreviewStage），提供：
 * - 评论模式开关（十字光标 + 悬停高亮，由 iframe 内 commentModeScript 实现）
 * - 点击页面内容捕获锚点元素 → 弹出创建评论输入框
 * - 评论 pin 层（跟随页面滚动/缩放定位）
 * - 线程面板（查看/回复/解决/删除）
 * - 评论侧栏（筛选列表）
 *
 * 坐标模型：
 * - pin 存储为文档归一化坐标（xRatio/yRatio，相对 docWidth/docHeight）。
 * - iframe 通过 COMMENT_VIEW_STATE 常驻上报滚动/文档尺寸。
 * - 渲染时：文档坐标 → 减去当前滚动 → 视口坐标 → 乘 iframe 缩放比 + 偏移 → 容器像素坐标。
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import type { CommentAnchor } from "@workbench/shared";
import { cn } from "../utils";
import type {
  CommentClickPayload,
  CommentViewStatePayload,
  VisualNodeInfo,
} from "../iframe-types";
import { CommentCreatePopover } from "./CommentCreatePopover";
import { CommentPin } from "./CommentPin";
import { CommentSidebar } from "./CommentSidebar";
import { CommentThreadPopover } from "./CommentThreadPopover";
import { useComments } from "./useComments";
import type {
  CommentLayerProps,
  CreateCommentInput,
  IframeViewState,
  MentionCandidate,
} from "./types";

/** 从 iframe 捕获的元素信息构建评论锚点 */
function buildAnchor(node: VisualNodeInfo, outerHtml?: string): CommentAnchor {
  return {
    domPath: node.domPath,
    tagName: node.tagName,
    componentName: node.componentName,
    textSnippet: node.textContent ? node.textContent.slice(0, 80) : undefined,
    snapshot: {
      className: node.className,
      outerHtml,
      computedStyle: node.computedStyle as Record<string, string> | undefined,
      attrs: node.attrs as Record<string, string> | undefined,
      sourceLocation: node.sourceFile
        ? {
            file: node.sourceFile,
            line: node.sourceLine,
            column: node.sourceColumn,
          }
        : undefined,
      editCapabilities: node.editCapabilities,
    },
  };
}

interface CreateDraft {
  anchor: CommentAnchor;
  pin: { xRatio: number; yRatio: number };
  left: number;
  top: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** 查找容器内原型预览的根元素（Shadow DOM 内）；iframe 页面返回 null */
function findPrototypeRoot(container: HTMLElement): HTMLElement | null {
  const host = container.querySelector<HTMLElement>("[data-prototype-preview]");
  if (!host?.shadowRoot) return null;
  return host.shadowRoot.querySelector<HTMLElement>(".prototype-root");
}

/** 计算元素相对原型根节点的 CSS 选择器路径 */
function computePrototypeDomPath(el: HTMLElement, root: HTMLElement): string {
  const parts: string[] = [];
  let current: HTMLElement | null = el;
  while (current && current !== root) {
    const tag = current.tagName.toLowerCase();
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const currentTagName = current.tagName;
    const sameTag = Array.from(parent.children).filter(
      (child): child is Element => child.tagName === currentTagName,
    );
    parts.unshift(
      sameTag.length > 1
        ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})`
        : tag,
    );
    current = parent;
  }
  return parts.join(" > ");
}

/** 从原型页（直接 DOM，非 iframe）元素构建 VisualNodeInfo，供 buildAnchor 复用 */
function buildVisualNodeInfoFromElement(
  el: HTMLElement,
  root: HTMLElement,
): VisualNodeInfo {
  const rect = el.getBoundingClientRect();
  const domPath = computePrototypeDomPath(el, root);
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  const className =
    typeof el.className === "string" && el.className ? el.className : undefined;
  const caps: VisualNodeInfo["editCapabilities"] = [
    "annotate",
    "style",
    "structure",
  ];
  if (text && el.children.length === 0) caps.push("text");
  if (el instanceof HTMLImageElement || el.getAttribute("src")) caps.push("image");
  if (el instanceof HTMLAnchorElement || el.getAttribute("href")) caps.push("link");
  if (className) caps.push("className");
  return {
    nodeId: domPath,
    tagName: el.tagName.toLowerCase(),
    componentName:
      el.getAttribute("data-component-name") || el.tagName.toLowerCase(),
    className,
    textContent: text ? text.slice(0, 180) : undefined,
    domPath,
    parentPath: el.parentElement
      ? computePrototypeDomPath(el.parentElement, root)
      : undefined,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    attrs: {
      src: el.getAttribute("src") || undefined,
      alt: el.getAttribute("alt") || undefined,
      href: el.getAttribute("href") || undefined,
      role: el.getAttribute("role") || undefined,
      ariaLabel: el.getAttribute("aria-label") || undefined,
    },
    editCapabilities: caps,
  };
}

/** 在容器内查找 contentWindow 匹配的 iframe */
function findContainedIframe(
  container: HTMLElement,
  win: MessageEventSource | null,
): HTMLIFrameElement | null {
  if (!win) return null;
  const iframes = container.querySelectorAll("iframe");
  for (let i = 0; i < iframes.length; i += 1) {
    if (iframes[i].contentWindow === win) return iframes[i];
  }
  return null;
}

export function CommentLayer({
  projectId,
  pageId,
  api,
  wsUrl,
  currentUser,
  canMentionAgent = false,
  mentionCandidates,
  children,
  disabled = false,
  showToggle = true,
  showSidebar = false,
  className,
  commentMode: commentModeProp,
  onCommentModeChange,
  activeThreadId: activeThreadIdProp,
  onActiveThreadChange,
  threads: threadsProp,
  onCreateComment,
  onAddReply,
  onSetResolved,
  onDeleteThread,
  onDeleteReply,
}: CommentLayerProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const [viewState, setViewState] = useState<IframeViewState | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(showSidebar);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [protoHostEl, setProtoHostEl] = useState<HTMLElement | null>(null);

  /* ---------------- 受控 / 内部状态解析 ---------------- */
  const commentModeControlled = commentModeProp !== undefined;
  const [internalCommentMode, setInternalCommentMode] = useState(false);
  const commentMode = commentModeControlled ? commentModeProp : internalCommentMode;
  const updateCommentMode = useCallback(
    (next: boolean) => {
      if (commentModeControlled) onCommentModeChange?.(next);
      else setInternalCommentMode(next);
    },
    [commentModeControlled, onCommentModeChange],
  );

  const activeThreadControlled = activeThreadIdProp !== undefined;
  const [internalActiveThreadId, setInternalActiveThreadId] = useState<string | null>(null);
  const activeThreadId = activeThreadControlled ? activeThreadIdProp : internalActiveThreadId;
  const updateActiveThreadId = useCallback(
    (next: string | null) => {
      if (activeThreadControlled) onActiveThreadChange?.(next);
      else setInternalActiveThreadId(next);
    },
    [activeThreadControlled, onActiveThreadChange],
  );

  const commentModeRef = useRef(commentMode);
  commentModeRef.current = commentMode;
  const createDraftRef = useRef(createDraft);
  createDraftRef.current = createDraft;

  /* ---------------- 数据层：外部管理 or 内部 hook ---------------- */
  const useExternalData = threadsProp !== undefined;
  const internalComments = useComments({
    projectId,
    pageId,
    api,
    wsUrl,
    enabled: !useExternalData,
  });
  const threads = useExternalData ? threadsProp : internalComments.threads;
  const createComment = useExternalData
    ? onCreateComment ?? internalComments.createComment
    : internalComments.createComment;
  const addReply = useExternalData
    ? onAddReply ?? internalComments.addReply
    : internalComments.addReply;
  const setResolved = useExternalData
    ? onSetResolved ?? internalComments.setResolved
    : internalComments.setResolved;
  const deleteThread = useExternalData
    ? onDeleteThread ?? internalComments.deleteThread
    : internalComments.deleteThread;
  const deleteReply = useExternalData
    ? onDeleteReply ?? internalComments.deleteReply
    : internalComments.deleteReply;

  /* ---------------- @候选人 ---------------- */
  const [fetchedCandidates, setFetchedCandidates] = useState<MentionCandidate[]>([]);
  useEffect(() => {
    if (mentionCandidates) return;
    let cancelled = false;
    api
      .listMentionCandidates()
      .then((list) => {
        if (!cancelled) setFetchedCandidates(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api, mentionCandidates]);

  const candidates = useMemo(() => {
    const base = mentionCandidates ?? fetchedCandidates;
    const list = [...base];
    if (canMentionAgent && !list.some((c) => c.type === "agent")) {
      list.unshift({ id: "agent", name: "AI 助手", type: "agent" });
    }
    return list;
  }, [mentionCandidates, fetchedCandidates, canMentionAgent]);

  /* ---------------- iframe 探测 ---------------- */
  useEffect(() => {
    if (disabled) return;
    const container = areaRef.current;
    if (!container) return;
    const detect = () => {
      const frame = container.querySelector("iframe");
      setIframeEl((prev) => (prev === frame ? prev : frame));
      const protoHost = container.querySelector<HTMLElement>("[data-prototype-preview]");
      setProtoHostEl((prev) => (prev === protoHost ? prev : protoHost));
    };
    detect();
    const observer = new MutationObserver(detect);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [disabled, pageId]);

  /* ---------------- 窗口尺寸变化 → 重算 pin 位置 ---------------- */
  useEffect(() => {
    if (disabled) return;
    const onResize = () => setLayoutVersion((v) => v + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [disabled]);

  /* ---------------- iframe 消息监听 ---------------- */
  const handleCommentClick = useCallback(
    (payload: CommentClickPayload) => {
      if (!commentModeRef.current) return;
      if (createDraftRef.current) return;
      const container = areaRef.current;
      const frame = iframeEl;
      if (!container || !frame) return;

      const docX = payload.x + payload.scrollX;
      const docY = payload.y + payload.scrollY;
      const xRatio = payload.docWidth > 0 ? docX / payload.docWidth : 0;
      const yRatio = payload.docHeight > 0 ? docY / payload.docHeight : 0;

      const iframeRect = frame.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const designWidth = frame.contentWindow?.innerWidth || payload.viewportWidth;
      const scale = designWidth > 0 ? iframeRect.width / designWidth : 1;
      const left = iframeRect.left - containerRect.left + payload.x * scale;
      const top = iframeRect.top - containerRect.top + payload.y * scale;

      // node 为 null（点击 body/空白区域）时兜底：仍允许创建评论，锚定到 body
      const anchor: CommentAnchor = payload.node
        ? buildAnchor(payload.node, payload.outerHtml)
        : {
            domPath: "body",
            tagName: "body",
            snapshot: { outerHtml: payload.outerHtml },
          };

      setCreateDraft({
        anchor,
        pin: { xRatio, yRatio },
        left,
        top: top + 14,
      });
    },
    [iframeEl],
  );

  /** 原型页（无 iframe，Shadow DOM 直接渲染）：捕获点击元素并创建评论草稿 */
  const handlePrototypeCommentClick = useCallback(
    (event: MouseEvent, target: HTMLElement) => {
      if (!commentModeRef.current) return;
      if (createDraftRef.current) return;
      const container = areaRef.current;
      const host = protoHostEl;
      if (!container || !host?.shadowRoot) return;
      const root = host.shadowRoot.querySelector<HTMLElement>(".prototype-root");
      if (!root || !root.contains(target)) return;

      event.preventDefault();
      event.stopPropagation();

      const containerRect = container.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const xRatio =
        rootRect.width > 0
          ? clamp01((event.clientX - rootRect.left) / rootRect.width)
          : 0;
      const yRatio =
        rootRect.height > 0
          ? clamp01((event.clientY - rootRect.top) / rootRect.height)
          : 0;

      const node = buildVisualNodeInfoFromElement(target, root);
      setCreateDraft({
        anchor: buildAnchor(node, target.outerHTML.slice(0, 600)),
        pin: { xRatio, yRatio },
        left: event.clientX - containerRect.left,
        top: event.clientY - containerRect.top + 14,
      });
    },
    [protoHostEl],
  );

  useEffect(() => {
    if (disabled) return;
    const handler = (event: MessageEvent) => {
      const container = areaRef.current;
      if (!container) return;
      const data = event.data;
      if (!data || typeof data !== "object" || typeof data.type !== "string") return;
      if (data.type !== "COMMENT_VIEW_STATE" && data.type !== "COMMENT_CLICK") {
        return;
      }
      if (!findContainedIframe(container, event.source)) return;

      if (data.type === "COMMENT_VIEW_STATE") {
        const p = data as CommentViewStatePayload;
        setViewState({
          scrollX: p.scrollX,
          scrollY: p.scrollY,
          docWidth: p.docWidth,
          docHeight: p.docHeight,
          viewportWidth: p.viewportWidth,
          viewportHeight: p.viewportHeight,
        });
      } else if (data.type === "COMMENT_CLICK") {
        handleCommentClick(data as CommentClickPayload);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [disabled, handleCommentClick]);

  /* ---------------- 评论模式开关 → 通知 iframe ---------------- */
  useEffect(() => {
    if (disabled) return;
    const frame = iframeEl;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      { type: commentMode ? "ENTER_COMMENT_MODE" : "EXIT_COMMENT_MODE" },
      "*",
    );
  }, [commentMode, iframeEl, disabled]);

  /* ---------------- iframe 重载后重同步评论模式 ---------------- */
  useEffect(() => {
    const frame = iframeEl;
    if (!frame || disabled) return;
    const onLoad = () => {
      if (!commentModeRef.current) return;
      frame.contentWindow?.postMessage({ type: "ENTER_COMMENT_MODE" }, "*");
    };
    frame.addEventListener("load", onLoad);
    return () => frame.removeEventListener("load", onLoad);
  }, [iframeEl, disabled]);

  /* ---------------- 原型页滚动 → 重算 pin 位置 ---------------- */
  useEffect(() => {
    const host = protoHostEl;
    if (!host || disabled) return;
    const onScroll = () => setLayoutVersion((v) => v + 1);
    host.addEventListener("scroll", onScroll, true);
    return () => host.removeEventListener("scroll", onScroll, true);
  }, [protoHostEl, disabled]);

  /* ---------------- 原型页评论模式：十字光标 + 悬停高亮 + 点击捕获 ---------------- */
  useEffect(() => {
    const host = protoHostEl;
    if (!host || disabled || !commentMode) return;
    const shadow = host.shadowRoot;
    if (!shadow) return;

    host.style.cursor = "crosshair";

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-comment-mode-style", "true");
    styleEl.textContent =
      "*{cursor:crosshair !important;}[data-comment-hover]{outline:2px solid #2563eb !important;outline-offset:-2px;}";
    shadow.appendChild(styleEl);

    let hovered: HTMLElement | null = null;
    const setHovered = (el: HTMLElement | null) => {
      if (hovered === el) return;
      hovered?.removeAttribute("data-comment-hover");
      hovered = el;
      hovered?.setAttribute("data-comment-hover", "true");
    };
    const resolveTarget = (event: Event, allowRoot: boolean): HTMLElement | null => {
      const root = shadow.querySelector<HTMLElement>(".prototype-root");
      if (!root) return null;
      for (const item of event.composedPath()) {
        if (item === host) return null;
        if (item instanceof HTMLElement && root.contains(item)) {
          if (item === root && !allowRoot) return null;
          return item;
        }
      }
      return null;
    };
    const onPointerOver = (event: Event) => setHovered(resolveTarget(event, false));
    const onPointerLeave = () => setHovered(null);
    const onClick = (event: Event) => {
      const mouseEvent = event as MouseEvent;
      if (mouseEvent.button !== 0) return;
      const target = resolveTarget(mouseEvent, true);
      if (!target) return;
      handlePrototypeCommentClick(mouseEvent, target);
    };

    shadow.addEventListener("pointerover", onPointerOver);
    host.addEventListener("pointerleave", onPointerLeave);
    shadow.addEventListener("click", onClick, true);
    return () => {
      setHovered(null);
      host.style.cursor = "";
      styleEl.remove();
      shadow.removeEventListener("pointerover", onPointerOver);
      host.removeEventListener("pointerleave", onPointerLeave);
      shadow.removeEventListener("click", onClick, true);
    };
  }, [protoHostEl, commentMode, disabled, handlePrototypeCommentClick]);

  useEffect(() => {
    if (!commentMode) setCreateDraft(null);
  }, [commentMode]);

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (createDraftRef.current) {
        setCreateDraft(null);
      } else if (activeThreadId) {
        updateActiveThreadId(null);
      } else if (commentModeRef.current) {
        updateCommentMode(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, activeThreadId, updateActiveThreadId, updateCommentMode]);

  /* ---------------- pin 坐标映射 ---------------- */
  const pinPositions = useMemo(() => {
    void layoutVersion;
    const container = areaRef.current;
    if (!container) return new Map<string, { left: number; top: number }>();

    // 原型页（无 iframe）：直接用根的视口矩形定位，自动跟随滚动/缩放
    const protoRoot = findPrototypeRoot(container);
    if (protoRoot) {
      const rootRect = protoRoot.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const map = new Map<string, { left: number; top: number }>();
      for (const thread of threads) {
        map.set(thread.id, {
          left: rootRect.left - containerRect.left + thread.pin.xRatio * rootRect.width,
          top: rootRect.top - containerRect.top + thread.pin.yRatio * rootRect.height,
        });
      }
      return map;
    }

    const frame = iframeEl;
    if (!frame || !viewState) {
      return new Map<string, { left: number; top: number }>();
    }
    const iframeRect = frame.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const designWidth = frame.contentWindow?.innerWidth || viewState.viewportWidth;
    if (!designWidth || iframeRect.width === 0) return new Map();
    const scale = iframeRect.width / designWidth;
    const offsetX = iframeRect.left - containerRect.left;
    const offsetY = iframeRect.top - containerRect.top;

    const map = new Map<string, { left: number; top: number }>();
    for (const thread of threads) {
      const docX = thread.pin.xRatio * viewState.docWidth;
      const docY = thread.pin.yRatio * viewState.docHeight;
      const vpX = docX - viewState.scrollX;
      const vpY = docY - viewState.scrollY;
      map.set(thread.id, {
        left: offsetX + vpX * scale,
        top: offsetY + vpY * scale,
      });
    }
    return map;
  }, [threads, viewState, iframeEl, protoHostEl, layoutVersion]);

  /* ---------------- 提交创建评论 ---------------- */
  const handleSubmitCreate = useCallback(
    async (input: CreateCommentInput) => {
      await createComment(input);
      setCreateDraft(null);
    },
    [createComment],
  );

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );
  const activeThreadPos = activeThread ? pinPositions.get(activeThread.id) : undefined;

  const unresolvedCount = threads.filter((t) => !t.resolved).length;

  if (disabled) {
    return <div className={cn("relative h-full w-full", className)}>{children}</div>;
  }

  return (
    <div className={cn("flex h-full w-full", className)}>
      <div ref={areaRef} className="relative min-w-0 flex-1 overflow-hidden">
        {children}

        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
          {threads.map((thread, index) => {
            const pos = pinPositions.get(thread.id);
            if (!pos) return null;
            return (
              <div
                key={thread.id}
                className="pointer-events-auto absolute"
                style={{ left: 0, top: 0 }}
              >
                <CommentPin
                  thread={thread}
                  index={index + 1}
                  left={pos.left}
                  top={pos.top}
                  active={activeThreadId === thread.id}
                  onClick={() =>
                    updateActiveThreadId(activeThreadId === thread.id ? null : thread.id)
                  }
                />
              </div>
            );
          })}
        </div>

        {createDraft && (
          <CommentCreatePopover
            draft={{ pageId, anchor: createDraft.anchor, pin: createDraft.pin }}
            mentionCandidates={candidates}
            canMentionAgent={canMentionAgent}
            left={createDraft.left}
            top={createDraft.top}
            onCancel={() => setCreateDraft(null)}
            onSubmit={handleSubmitCreate}
          />
        )}

        {activeThread && activeThreadPos && (
          <CommentThreadPopover
            thread={activeThread}
            currentUser={currentUser}
            mentionCandidates={candidates}
            canMentionAgent={canMentionAgent}
            left={activeThreadPos.left}
            top={activeThreadPos.top + 20}
            onClose={() => updateActiveThreadId(null)}
            onAddReply={addReply}
            onSetResolved={setResolved}
            onDeleteThread={deleteThread}
            onDeleteReply={deleteReply}
          />
        )}

        {showToggle && (
          <div className="absolute right-3 top-3 z-40 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              title="评论列表"
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-full border shadow-sm transition-colors",
                sidebarOpen
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              <MessageSquare className="h-4 w-4" />
              {unresolvedCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-semibold text-white">
                  {unresolvedCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                updateCommentMode(!commentMode);
                updateActiveThreadId(null);
              }}
              title={commentMode ? "退出评论模式" : "添加评论（点击页面内容）"}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm transition-colors",
                commentMode
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              <MessageSquarePlus className="h-4 w-4" />
              {commentMode ? "退出评论" : "评论"}
            </button>
          </div>
        )}

        {commentMode && !createDraft && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full bg-foreground/80 px-3 py-1.5 text-[11px] text-background shadow">
            点击页面内容添加评论 · Esc 退出
          </div>
        )}
      </div>

      {sidebarOpen && (
        <CommentSidebar
          threads={threads}
          currentUserId={currentUser?.id}
          activeThreadId={activeThreadId}
          onSelectThread={(id) => {
            updateActiveThreadId(id);
            updateCommentMode(false);
          }}
          onClose={() => setSidebarOpen(false)}
          className="w-72 shrink-0 border-l border-border"
        />
      )}
    </div>
  );
}
