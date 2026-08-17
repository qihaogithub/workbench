"use client";

import { useCallback, useEffect, useRef } from "react";
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

  onChangeRef.current = onChange;
  uploadHandlerRef.current = uploadHandler;
  localizeRemoteImageRef.current = localizeRemoteImage;
  readOnlyRef.current = readOnly;
  onCommentSelectionRef.current = onCommentSelection;
  referenceCandidatesRef.current = referenceCandidates;
  const uploadsEnabled = Boolean(uploadHandler);
  const referenceCandidateSignature = (referenceCandidates ?? [])
    .map((candidate) => `${candidate.key}\u0000${candidate.label}`)
    .join("\u0001");

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
    };
    const config = buildCrepeConfig({
      placeholder,
      actions,
      enableUploads: uploadsEnabled,
      referenceCandidates: referenceCandidatesRef.current,
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
      headingStyleToolbar?.destroy();
      topBarOverflow?.destroy();
      selectionToolbarObserver?.disconnect();
      selectionCommentButton?.remove();
      if (crepeRef.current === crepe) crepeRef.current = null;
      void crepe.destroy();
    };
    // Crepe's feature graph is immutable after creation. Callback props use refs;
    // only changes that reshape the menu recreate the instance.
  }, [placeholder, uploadsEnabled, referenceCandidateSignature]);

  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [readOnly]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
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
