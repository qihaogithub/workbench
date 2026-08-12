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
import "@milkdown/crepe/theme/common/style.css";
import "./markdown/crepe-theme.css";

export type DocumentUploadHandler = (
  file: File,
) => Promise<{ url: string; kind: "image" | "video" | "file" }>;

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
  /** 提供时，Crepe 块菜单显示「引用配置项」。 */
  referenceCandidates?: ConfigReferenceCandidate[];
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
  referenceCandidates,
  className,
}: DocumentEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const uploadHandlerRef = useRef(uploadHandler);
  const referenceCandidatesRef = useRef(referenceCandidates);
  const lastEmittedRef = useRef(value);
  const mountedRef = useRef(true);

  onChangeRef.current = onChange;
  uploadHandlerRef.current = uploadHandler;
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

    let headingStyleToolbar: ReturnType<typeof mountHeadingStyleToolbar> | null =
      null;
    let topBarOverflow: ReturnType<typeof mountTopBarOverflow> | null = null;
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
    });

    return () => {
      mountedRef.current = false;
      headingStyleToolbar?.destroy();
      topBarOverflow?.destroy();
      if (crepeRef.current === crepe) crepeRef.current = null;
      void crepe.destroy();
    };
    // Crepe's feature graph is immutable after creation. Callback props use refs;
    // only changes that reshape the menu recreate the instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className={cn("document-editor-crepe relative h-full min-h-[200px]", className)}
      data-document-editor="crepe"
      data-readonly={readOnly}
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
