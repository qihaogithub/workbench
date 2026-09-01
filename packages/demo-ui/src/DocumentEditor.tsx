"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  headingSchema,
  paragraphSchema,
  setBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { insert, replaceAll } from "@milkdown/kit/utils";
import { cn } from "./utils";
import {
  buildCrepeConfig,
  uploadImage,
  type CrepeProjectActions,
} from "./markdown/crepe-config";
import { mountHeadingStyleToolbar } from "./markdown/heading-style-toolbar";
import { mountTopBarOverflow } from "./markdown/top-bar-overflow";
import {
  decodeMarkdownReferenceUri,
  serializeMarkdownReference,
  type MarkdownReferenceCandidate,
  type MarkdownReferenceSource,
  type MarkdownReferenceTarget,
  type ReferencePolicy,
} from "@workbench/shared/markdown-reference";
import {
  getExternalImageUrlFromClipboard,
  getExternalImageUrlsFromClipboard,
  getMarkdownImagePaste,
  replaceMarkdownImageUrls,
} from "./markdown/remote-image-paste";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown/crepe-theme.css";

export type DocumentUploadHandler = (
  file: File,
) => Promise<{ url: string; kind: "image" | "video" | "file" }>;

/** Converts an external image URL to a stable URL hosted by the current system. */
export type DocumentRemoteImageHandler = (url: string) => Promise<string>;

export interface ConfigReferenceCandidate {
  key: string;
  label: string;
}

/** 编辑器宿主授予的项目引用上下文；不包含用户/session 对象。 */
export interface MarkdownReferenceContext {
  source: MarkdownReferenceSource;
  policy: ReferencePolicy;
}

export type MarkdownReferenceProvider = (input: {
  query: string;
  trigger: "@";
  context: MarkdownReferenceContext;
  signal?: AbortSignal;
}) => Promise<MarkdownReferenceCandidate[]> | MarkdownReferenceCandidate[];

export type MarkdownReferenceClickHandler = (input: {
  target: MarkdownReferenceTarget;
  labelSnapshot: string;
}) => void;

export interface DocumentEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** 提供时，Crepe 块菜单显示图片/视频/附件上传项。 */
  uploadHandler?: DocumentUploadHandler;
  /** 提供时，快捷键粘贴的外网图片会先保存到当前系统图床。 */
  localizeRemoteImage?: DocumentRemoteImageHandler;
  /** 提供时，Crepe 块菜单显示「引用配置项」。 */
  referenceCandidates?: ConfigReferenceCandidate[];
  /** 项目/页面/知识文档引用的 typed source 与权限策略。 */
  referenceContext?: MarkdownReferenceContext;
  /** 输入 @ 时按当前 scope 查询候选；未提供时不启用实体引用菜单。 */
  referenceProvider?: MarkdownReferenceProvider;
  /** 点击 wb:// 引用时交由宿主导航；浏览器不会直接请求自定义协议。 */
  onReferenceClick?: MarkdownReferenceClickHandler;
  /** 供诊断/最近使用记录插入的实体引用。 */
  onReferenceInserted?: (candidate: MarkdownReferenceCandidate) => void;
  /** 只读内容交由父级滚动时关闭编辑器自身滚动，完整展开正文。 */
  scrollable?: boolean;
  /** 有非空文本选区时，显示评论入口并返回可重新定位的选区锚点。 */
  onCommentSelection?: (selection: {
    quote: string;
    prefix: string;
    suffix: string;
    from: number;
    to: number;
  }) => void;
  className?: string;
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function insertMarkdown(crepe: Crepe, markdown: string) {
  crepe.editor.action(insert(markdown));
  crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
}

export function DocumentEditor({
  value,
  onChange,
  readOnly = false,
  placeholder = "输入 Markdown 内容...",
  uploadHandler,
  localizeRemoteImage,
  referenceCandidates,
  referenceContext,
  referenceProvider,
  onReferenceClick,
  onReferenceInserted,
  scrollable = true,
  onCommentSelection,
  className,
}: DocumentEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const uploadHandlerRef = useRef(uploadHandler);
  const localizeRemoteImageRef = useRef(localizeRemoteImage);
  const referenceCandidatesRef = useRef(referenceCandidates);
  const lastEmittedRef = useRef(value);
  const mountedRef = useRef(true);
  const readOnlyRef = useRef(readOnly);
  const onCommentSelectionRef = useRef(onCommentSelection);
  const referenceContextRef = useRef(referenceContext);
  const referenceProviderRef = useRef(referenceProvider);
  const onReferenceClickRef = useRef(onReferenceClick);
  const onReferenceInsertedRef = useRef(onReferenceInserted);

  onChangeRef.current = onChange;
  uploadHandlerRef.current = uploadHandler;
  localizeRemoteImageRef.current = localizeRemoteImage;
  readOnlyRef.current = readOnly;
  onCommentSelectionRef.current = onCommentSelection;
  referenceCandidatesRef.current = referenceCandidates;
  referenceContextRef.current = referenceContext;
  referenceProviderRef.current = referenceProvider;
  onReferenceClickRef.current = onReferenceClick;
  onReferenceInsertedRef.current = onReferenceInserted;
  const uploadsEnabled = Boolean(uploadHandler);
  const referenceCandidateSignature = (referenceCandidates ?? [])
    .map((candidate) => `${candidate.key}\u0000${candidate.label}`)
    .join("\u0001");
  const [referenceMenu, setReferenceMenu] = useState<{
    query: string;
    candidates: MarkdownReferenceCandidate[];
    selectedIndex: number;
  } | null>(null);
  const referenceMenuRef = useRef(referenceMenu);
  referenceMenuRef.current = referenceMenu;
  const referenceTriggerRef = useRef<number | null>(null);
  const referenceRequestRef = useRef(0);
  const referenceAbortRef = useRef<AbortController | null>(null);
  const openReferenceMenuRef = useRef<(() => void) | null>(null);
  const forceReferenceMenuRef = useRef(false);
  const insertReferenceCandidateRef = useRef<((candidate: MarkdownReferenceCandidate) => void) | null>(null);

  const reportUploadError = useCallback((error: unknown) => {
    window.alert(error instanceof Error ? error.message : "上传失败，请重试");
  }, []);

  const uploadAndInsert = useCallback(
    async (file: File, kind: "video" | "file") => {
      const handler = uploadHandlerRef.current;
      const crepe = crepeRef.current;
      if (!handler || !crepe) return;

      try {
        const result = await handler(file);
        if (!mountedRef.current || !crepeRef.current) return;
        const name = escapeMarkdownLabel(file.name || "附件");
        const markdown =
          kind === "video"
            ? `\n<video controls src="${result.url}"></video>\n`
            : `\n[${name}](${result.url})\n`;
        insertMarkdown(crepeRef.current, markdown);
      } catch (error) {
        reportUploadError(error);
      }
    },
    [reportUploadError],
  );

  useEffect(() => {
    mountedRef.current = true;
    const root = rootRef.current;
    if (!root) return;

    const actions: CrepeProjectActions = {
      uploadImage: (file) => uploadImage(uploadHandlerRef.current, file),
      uploadVideo: () => videoInputRef.current?.click(),
      uploadFile: () => fileInputRef.current?.click(),
      insertReference: (candidate) => {
        const crepe = crepeRef.current;
        if (!crepe) return;
        insertMarkdown(
          crepe,
          `@[${escapeMarkdownLabel(candidate.label)}](${candidate.key})`,
        );
      },
      openProjectReference: () => openReferenceMenuRef.current?.(),
    };
    const config = buildCrepeConfig({
      placeholder,
      actions,
      enableUploads: uploadsEnabled,
      referenceCandidates: referenceCandidatesRef.current,
      enableProjectReferences: Boolean(referenceProviderRef.current && referenceContextRef.current),
    });
    const crepe = new Crepe({
      root,
      defaultValue: value,
      ...config,
    });
    crepeRef.current = crepe;
    crepe.setReadonly(readOnly);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (markdown === lastEmittedRef.current) return;
        lastEmittedRef.current = markdown;
        onChangeRef.current(markdown);
      });
    });

    const handlePaste = (event: ClipboardEvent) => {
      const localize = localizeRemoteImageRef.current;
      if (!localize || readOnlyRef.current) return;

      const markdownPaste = getMarkdownImagePaste(event.clipboardData);
      const plainText = event.clipboardData?.getData("text/plain")?.trim() ?? "";
      const externalUrls = getExternalImageUrlsFromClipboard(event.clipboardData);
      const externalUrl = plainText
        ? null
        : getExternalImageUrlFromClipboard(event.clipboardData);

      if (markdownPaste) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void Promise.all(
          markdownPaste.externalUrls.map(async (url) => [url, await localize(url)] as const),
        )
          .then((localized) => {
            if (!mountedRef.current || crepeRef.current !== crepe) return;
            insertMarkdown(
              crepe,
              replaceMarkdownImageUrls(markdownPaste.markdown, new Map(localized)),
            );
          })
          .catch(reportUploadError);
        return;
      }

      if (externalUrl) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void localize(externalUrl)
          .then((url) => {
            if (!mountedRef.current || crepeRef.current !== crepe) return;
            insertMarkdown(crepe, `![](${url})`);
          })
          .catch(reportUploadError);
        return;
      }

      // Rich article paste: let Milkdown preserve the full HTML structure, then
      // localize the image URLs from the resulting Markdown document.
      if (!externalUrls.length) return;

      window.setTimeout(() => {
        void Promise.all(
          externalUrls.map(async (url) => [url, await localize(url)] as const),
        )
        .then((localized) => {
          if (!mountedRef.current || crepeRef.current !== crepe) return;
          const replacements = new Map(localized);
          const markdown = replaceMarkdownImageUrls(lastEmittedRef.current, replacements);
          if (markdown !== lastEmittedRef.current) {
            crepe.editor.action(replaceAll(markdown));
          }
        })
        .catch(reportUploadError);
      }, 0);
    };
    root.addEventListener("paste", handlePaste, true);

    const closeReferenceMenu = () => {
      referenceTriggerRef.current = null;
      forceReferenceMenuRef.current = false;
      referenceAbortRef.current?.abort();
      referenceAbortRef.current = null;
      setReferenceMenu(null);
    };

    const updateReferenceMenu = () => {
      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx));
      if (!provider || !context || readOnlyRef.current || !view.state.selection.empty) {
        closeReferenceMenu();
        return;
      }
      const trigger = referenceTriggerRef.current;
      if (trigger === null || trigger > view.state.selection.from) {
        closeReferenceMenu();
        return;
      }
      const typed = view.state.doc.textBetween(trigger, view.state.selection.from, "");
      if ((!forceReferenceMenuRef.current && !typed.startsWith("@")) || /[\n\r\t ]/.test(typed) || typed.length > 120) {
        closeReferenceMenu();
        return;
      }
      const query = forceReferenceMenuRef.current ? "" : typed.slice(1);
      const requestId = ++referenceRequestRef.current;
      referenceAbortRef.current?.abort();
      const controller = new AbortController();
      referenceAbortRef.current = controller;
      Promise.resolve(provider({ query, trigger: "@", context, signal: controller.signal }))
        .then((candidates) => {
          if (requestId !== referenceRequestRef.current || !mountedRef.current) return;
          const allowedKinds = context.policy.allowedTargetKinds;
          const visibleCandidates = candidates.filter((candidate) => {
            if (allowedKinds && !allowedKinds.includes(candidate.target.kind)) return false;
            if (context.policy.sameProjectOnly && candidate.target.projectId !== context.source.projectId) return false;
            return true;
          });
          setReferenceMenu({ query, candidates: visibleCandidates.slice(0, 30), selectedIndex: 0 });
        })
        .catch(() => {
          if (requestId === referenceRequestRef.current) setReferenceMenu(null);
        });
    };
    openReferenceMenuRef.current = () => {
      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      if (!provider || !context || readOnlyRef.current) return;
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx));
      if (!view.state.selection.empty) return;
      referenceTriggerRef.current = view.state.selection.from;
      forceReferenceMenuRef.current = true;
      updateReferenceMenu();
    };

    const insertReferenceCandidate = (candidate: MarkdownReferenceCandidate) => {
      const trigger = referenceTriggerRef.current;
      if (trigger === null) return;
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx));
      const markdown = serializeMarkdownReference(
        candidate.target,
        candidate.displayPath.split(" / ").pop() || candidate.displayPath,
      );
      // Delete the trigger/query, then let Milkdown parse canonical Markdown
      // into a link mark instead of inserting the syntax as literal text.
      view.dispatch(view.state.tr.delete(trigger, view.state.selection.from));
      insertMarkdown(crepe, markdown);
      closeReferenceMenu();
      onReferenceInsertedRef.current?.(candidate);
    };
    insertReferenceCandidateRef.current = insertReferenceCandidate;

    const handleReferenceKeyDown = (event: KeyboardEvent) => {
      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      if (!provider || !context || readOnlyRef.current) return;
      const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx));
      if (event.key === "@" && view.state.selection.empty) {
        referenceTriggerRef.current = view.state.selection.from;
        window.queueMicrotask(updateReferenceMenu);
        return;
      }
      // Treat a canonical wb:// link mark as one atomic chip for deletion.
      // Milkdown stores the label as ordinary text with a link mark; deleting
      // the whole marked run keeps users from leaving a half-written URI.
      if ((event.key === "Backspace" || event.key === "Delete") && view.state.selection.empty) {
        const { from } = view.state.selection;
        const direction = event.key === "Backspace" ? -1 : 1;
        const probe = direction < 0 ? view.state.doc.resolve(from).nodeBefore : view.state.doc.resolve(from).nodeAfter;
        const mark = probe?.marks.find((candidate) => typeof candidate.attrs?.href === "string" && candidate.attrs.href.startsWith("wb://"));
        if (mark) {
          let start = from;
          let end = from;
          if (direction < 0) {
            while (start > 0) {
              const node = view.state.doc.resolve(start).nodeBefore;
              if (!node?.isText || !node.marks.some((candidate) => candidate.eq(mark))) break;
              start -= node.nodeSize;
            }
            end = from;
          } else {
            while (end < view.state.doc.content.size) {
              const node = view.state.doc.resolve(end).nodeAfter;
              if (!node?.isText || !node.marks.some((candidate) => candidate.eq(mark))) break;
              end += node.nodeSize;
            }
          }
          if (start !== end) {
            event.preventDefault();
            view.dispatch(view.state.tr.delete(start, end));
            return;
          }
        }
      }
      const currentMenu = referenceMenuRef.current;
      if (!currentMenu) {
        if (event.key === "Escape") closeReferenceMenu();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setReferenceMenu((current) => {
          if (!current || current.candidates.length === 0) return current;
          const selectedIndex =
            (current.selectedIndex + delta + current.candidates.length) % current.candidates.length;
          return { ...current, selectedIndex };
        });
        return;
      }
      if (event.key === "Enter") {
        const candidate = currentMenu.candidates[currentMenu.selectedIndex];
        if (!candidate) return;
        event.preventDefault();
        insertReferenceCandidate(candidate);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeReferenceMenu();
        return;
      }
      window.setTimeout(updateReferenceMenu, 0);
    };

    const handleReferenceInput = () => window.setTimeout(updateReferenceMenu, 0);
    const handleReferenceClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith("wb://")) return;
      const target = decodeMarkdownReferenceUri(href);
      if (!target) return;
      event.preventDefault();
      onReferenceClickRef.current?.({
        target,
        labelSnapshot: anchor?.textContent?.trim() || "",
      });
    };
    root.addEventListener("keydown", handleReferenceKeyDown, true);
    root.addEventListener("input", handleReferenceInput, true);
    root.addEventListener("click", handleReferenceClick, true);

    let headingStyleToolbar: ReturnType<typeof mountHeadingStyleToolbar> | null =
      null;
    let topBarOverflow: ReturnType<typeof mountTopBarOverflow> | null = null;
    let selectionCommentButton: HTMLButtonElement | null = null;
    let selectionToolbarObserver: MutationObserver | null = null;
    void crepe.create().then(() => {
      if (!mountedRef.current || crepeRef.current !== crepe) return;
      topBarOverflow = mountTopBarOverflow({ root });
      headingStyleToolbar = mountHeadingStyleToolbar({
        root,
        getActiveLevel: () =>
          crepe.editor.action((ctx) => {
            const node = ctx.get(editorViewCtx).state.selection.$from.parent;
            if (node.type !== headingSchema.type(ctx)) return null;
            return node.attrs.level as number;
          }),
        onSelect: (level) => {
          crepe.editor.action((ctx) => {
            const nodeType =
              level === null ? paragraphSchema.type(ctx) : headingSchema.type(ctx);
            ctx.get(commandsCtx).call(setBlockTypeCommand.key, {
              nodeType,
              ...(level === null ? {} : { attrs: { level } }),
            });
          });
        },
      });
      if (onCommentSelectionRef.current) {
        selectionCommentButton = document.createElement("button");
        selectionCommentButton.type = "button";
        selectionCommentButton.className = "document-comment-selection-button";
        selectionCommentButton.title = "添加选区评论";
        selectionCommentButton.setAttribute("aria-label", "添加选区评论");
        selectionCommentButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4zM12 8v6m-3-3h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        selectionCommentButton.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          const selection = crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.selection);
          if (selection.empty) return;
          const doc = crepe.editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
          const quote = doc.textBetween(selection.from, selection.to, "\n").trim();
          if (!quote) return;
          const fullText = doc.textBetween(0, doc.content.size, "\n");
          const start = fullText.indexOf(quote);
          onCommentSelectionRef.current?.({
            quote,
            prefix: fullText.slice(Math.max(0, start - 80), start),
            suffix: fullText.slice(start + quote.length, start + quote.length + 80),
            from: selection.from,
            to: selection.to,
          });
        });
        const attach = () => {
          const toolbar = root.querySelector<HTMLElement>(".milkdown-toolbar");
          if (toolbar && selectionCommentButton && !toolbar.contains(selectionCommentButton)) toolbar.append(selectionCommentButton);
        };
        attach();
        selectionToolbarObserver = new MutationObserver(attach);
        selectionToolbarObserver.observe(root, { childList: true, subtree: true });
      }
    });

    return () => {
      mountedRef.current = false;
      root.removeEventListener("paste", handlePaste, true);
      root.removeEventListener("keydown", handleReferenceKeyDown, true);
      root.removeEventListener("input", handleReferenceInput, true);
      root.removeEventListener("click", handleReferenceClick, true);
      referenceRequestRef.current += 1;
      closeReferenceMenu();
      openReferenceMenuRef.current = null;
      insertReferenceCandidateRef.current = null;
      headingStyleToolbar?.destroy();
      topBarOverflow?.destroy();
      selectionToolbarObserver?.disconnect();
      selectionCommentButton?.remove();
      if (crepeRef.current === crepe) crepeRef.current = null;
      void crepe.destroy();
    };
    // Crepe's feature graph is immutable after creation. Callback props use refs;
    // only changes that reshape the menu recreate the instance.
  }, [placeholder, uploadsEnabled, referenceCandidateSignature, Boolean(referenceProvider), Boolean(referenceContext)]);

  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [readOnly]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    referenceTriggerRef.current = null;
    referenceRequestRef.current += 1;
    setReferenceMenu(null);
    queueMicrotask(() => {
      if (crepeRef.current !== crepe) return;
      crepe.editor.action(replaceAll(value));
    });
  }, [value]);

  return (
    <div
      className={cn(
        "document-editor-crepe relative",
        scrollable ? "h-full min-h-[200px]" : "h-auto min-h-0",
        className,
      )}
      data-document-editor="crepe"
      data-readonly={readOnly}
      data-scrollable={scrollable}
    >
      <div ref={rootRef} className="crepe h-full" />
      {referenceMenu && referenceMenu.candidates.length > 0 && (
        <div
          className="document-reference-menu absolute z-50 mt-1 max-h-72 min-w-64 max-w-[min(90vw,28rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          role="listbox"
          aria-label="项目引用候选"
        >
          {referenceMenu.candidates.map((candidate, index) => (
            <button
              key={`${candidate.target.kind}:${candidate.target.projectId}:${candidate.target.kind === "project" ? "" : candidate.target.kind === "page" ? candidate.target.pageId : candidate.target.docId}`}
              type="button"
              role="option"
              aria-selected={index === referenceMenu.selectedIndex}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                index === referenceMenu.selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                insertReferenceCandidateRef.current?.(candidate);
              }}
            >
              <span className="shrink-0 text-muted-foreground">@</span>
              <span className="min-w-0 flex-1 truncate">{candidate.displayPath}</span>
              <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{candidate.target.kind}</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadAndInsert(file, "video");
          event.target.value = "";
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void uploadAndInsert(file, "file");
          event.target.value = "";
        }}
      />
    </div>
  );
}
