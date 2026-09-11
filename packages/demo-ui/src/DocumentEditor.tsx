"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { EditorStatus, editorViewCtx, parserCtx } from "@milkdown/kit/core";
import type { CommentMention } from "@workbench/shared";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown, insert, replaceAll } from "@milkdown/kit/utils";
import { cn } from "./utils";
import {
  buildCrepeConfig,
  uploadImage,
  type CrepeProjectActions,
} from "./markdown/crepe-config";
import { documentBlockEdit } from "./markdown/document-block-edit";
import { documentHeadingMenu } from "./markdown/document-heading-menu";
import {
  documentInsertMenu,
  documentInsertMenuApi,
} from "./markdown/document-insert-menu";
import { documentSelectionToolbar } from "./markdown/document-selection-toolbar";
import { ProjectReferencePicker } from "./markdown/ProjectReferencePicker";
import { projectReferencePresentation } from "./markdown/project-reference-presentation";
import "./markdown/project-reference-presentation.css";
import {
  decodeMarkdownReferenceUri,
  parseMarkdownReferences,
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
import { useMarkdownImageLightbox } from "./MarkdownImageLightbox";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown/crepe-theme.css";
import "./markdown-image-lightbox.css";

export type DocumentUploadHandler = (
  file: File,
) => Promise<{ url: string; kind: "image" | "video" | "file" }>;

/** Converts an external image URL to a stable URL hosted by the current system. */
export type DocumentRemoteImageHandler = (url: string) => Promise<string>;

export interface ConfigReferenceCandidate {
  key: string;
  label: string;
}

/** Markdown 编辑器可选的评论提及候选；不启用时编辑器行为保持不变。 */
export interface MarkdownMentionCandidate {
  id: string;
  name: string;
  type: "user" | "agent";
}

/** 编辑器宿主授予的项目引用上下文；不包含用户/session 对象。 */
export interface MarkdownReferenceContext {
  source: MarkdownReferenceSource;
  policy: ReferencePolicy;
}

export type MarkdownReferenceProvider = ((input: {
  query: string;
  trigger: "@";
  context: MarkdownReferenceContext;
  signal?: AbortSignal;
  /** Target project; the source context never changes when browsing projects. */
  projectId?: string;
}) => Promise<MarkdownReferenceCandidate[]> | MarkdownReferenceCandidate[]) & {
  listProjects?: (
    signal?: AbortSignal,
  ) => Promise<Array<{ id: string; name: string }>>;
};

export type MarkdownReferenceClickHandler = (input: {
  target: MarkdownReferenceTarget;
  labelSnapshot: string;
}) => void;

export interface DocumentEditorProps {
  /** Stable resource identity. Switching it resets selection, menus and history. */
  documentKey?: string;
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
  /** Cmd/Ctrl+Enter 提交当前简版编辑器内容。 */
  onSubmit?: () => void;
  /** 编辑器创建后自动聚焦正文。 */
  autoFocus?: boolean;
  /** 评论 Markdown 编辑器可选的 @ 提及候选。 */
  mentionCandidates?: MarkdownMentionCandidate[];
  /** 评论编辑器输入 @ 后异步查询项目参与者。 */
  searchMentionCandidates?: (
    query: string,
    options?: { signal?: AbortSignal },
  ) => Promise<MarkdownMentionCandidate[]>;
  /** 当前 Markdown 中已解析的结构化提及。 */
  mentions?: CommentMention[];
  /** 提及候选选择或内容删除后的结构化提及回调。 */
  onMentionsChange?: (mentions: CommentMention[]) => void;
  /** 是否允许候选列表包含 AI。 */
  canMentionAgent?: boolean;
  /** 只读内容交由父级滚动时关闭编辑器自身滚动，完整展开正文。 */
  scrollable?: boolean;
  /** 是否显示固定顶部格式工具栏；选区浮动工具栏不受影响。 */
  showTopBar?: boolean;
  /** 让编辑器从单行高度随内容增长，达到上限后在正文区滚动。 */
  autoGrow?: boolean;
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

interface DocumentMenuAnchor {
  left: number;
  top: number;
}

function escapeMarkdownLabel(label: string): string {
  return label.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function insertMarkdown(crepe: Crepe, markdown: string): boolean {
  const view = getEditorView(crepe);
  if (!view) return false;
  crepe.editor.action(insert(markdown));
  view.focus();
  return true;
}

function getEditorView(crepe: Crepe): EditorView | null {
  if (crepe.editor.status !== EditorStatus.Created) return null;
  return crepe.editor.action((ctx) => ctx.get(editorViewCtx)) ?? null;
}

export function DocumentEditor(props: DocumentEditorProps) {
  return (
    <DocumentEditorInstance
      key={props.documentKey ?? JSON.stringify(props.referenceContext?.source)}
      {...props}
    />
  );
}

function DocumentEditorInstance({
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
  onSubmit,
  autoFocus = false,
  mentionCandidates,
  searchMentionCandidates,
  mentions = [],
  onMentionsChange,
  canMentionAgent = false,
  scrollable = true,
  showTopBar = true,
  autoGrow = false,
  onCommentSelection,
  className,
}: DocumentEditorProps) {
  const { lightbox, openMarkdownImage } = useMarkdownImageLightbox();
  const rootRef = useRef<HTMLDivElement>(null);
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const onChangeRef = useRef(onChange);
  const uploadHandlerRef = useRef(uploadHandler);
  const localizeRemoteImageRef = useRef(localizeRemoteImage);
  const referenceCandidatesRef = useRef(referenceCandidates);
  const mentionCandidatesRef = useRef(mentionCandidates);
  const searchMentionCandidatesRef = useRef(searchMentionCandidates);
  const mentionsRef = useRef(mentions);
  const onMentionsChangeRef = useRef(onMentionsChange);
  const canMentionAgentRef = useRef(canMentionAgent);
  const lastEmittedRef = useRef(value);
  const externalSyncRef = useRef(false);
  const externalSyncTargetRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const editorReadyRef = useRef(false);
  const [editorReady, setEditorReady] = useState(false);
  const readOnlyRef = useRef(readOnly);
  const onCommentSelectionRef = useRef(onCommentSelection);
  const referenceContextRef = useRef(referenceContext);
  const referenceProviderRef = useRef(referenceProvider);
  const onReferenceClickRef = useRef(onReferenceClick);
  const onReferenceInsertedRef = useRef(onReferenceInserted);
  const onSubmitRef = useRef(onSubmit);

  onChangeRef.current = onChange;
  uploadHandlerRef.current = uploadHandler;
  localizeRemoteImageRef.current = localizeRemoteImage;
  readOnlyRef.current = readOnly;
  onCommentSelectionRef.current = onCommentSelection;
  referenceCandidatesRef.current = referenceCandidates;
  mentionCandidatesRef.current = mentionCandidates;
  searchMentionCandidatesRef.current = searchMentionCandidates;
  mentionsRef.current = mentions;
  onMentionsChangeRef.current = onMentionsChange;
  canMentionAgentRef.current = canMentionAgent;
  referenceContextRef.current = referenceContext;
  referenceProviderRef.current = referenceProvider;
  onReferenceClickRef.current = onReferenceClick;
  onReferenceInsertedRef.current = onReferenceInserted;
  onSubmitRef.current = onSubmit;
  const uploadsEnabled = Boolean(uploadHandler);
  const referenceCandidateSignature = (referenceCandidates ?? [])
    .map((candidate) => `${candidate.key}\u0000${candidate.label}`)
    .join("\u0001");
  const [referenceMenu, setReferenceMenu] = useState<{
    query: string;
    candidates: MarkdownReferenceCandidate[];
    selectedIndex: number;
    anchor: DocumentMenuAnchor;
    status: "loading" | "ready" | "error";
  } | null>(null);
  const referenceMenuRef = useRef(referenceMenu);
  referenceMenuRef.current = referenceMenu;
  const referenceTriggerRef = useRef<number | null>(null);
  const referenceRequestRef = useRef(0);
  const referenceAbortRef = useRef<AbortController | null>(null);
  const projectInsertAbortRef = useRef<AbortController | null>(null);
  const projectInsertGenerationRef = useRef(0);
  const openReferenceMenuRef = useRef<(() => void) | null>(null);
  const forceReferenceMenuRef = useRef(false);
  const referenceDirectoriesRef = useRef(
    new Map<string, MarkdownReferenceCandidate[]>(),
  );
  const referenceDirectoryVersionsRef = useRef(new Map<string, symbol>());
  const selectedReferenceProjectRef = useRef<string | undefined>(undefined);
  const [selectedReferenceProject, setSelectedReferenceProject] = useState<
    string | undefined
  >();
  const [referenceProjects, setReferenceProjects] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [referenceProjectsStatus, setReferenceProjectsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [referenceProjectsRetry, setReferenceProjectsRetry] = useState(0);
  const referenceProjectIds = JSON.stringify(
    [
      ...new Set(
        parseMarkdownReferences(value).references.map(
          ({ target }) => target.projectId,
        ),
      ),
    ].sort(),
  );
  const referenceSourceSignature = JSON.stringify(referenceContext?.source ?? null);
  const retryReferenceMenuRef = useRef<(() => void) | null>(null);
  const closeReferenceMenuRef = useRef<(() => void) | null>(null);
  const dismissReferenceMenu = useCallback(
    () => closeReferenceMenuRef.current?.(),
    [],
  );
  useEffect(() => {
    referenceDirectoriesRef.current.clear();
    referenceDirectoryVersionsRef.current.clear();
    referenceAbortRef.current?.abort();
    referenceRequestRef.current += 1;
    projectInsertAbortRef.current?.abort();
    projectInsertAbortRef.current = null;
    projectInsertGenerationRef.current += 1;
    setReferenceMenu(null);
    setReferenceProjects([]);
    selectedReferenceProjectRef.current = referenceContext?.source.projectId;
    const current = crepeRef.current;
    const view = current && getEditorView(current);
    view?.dispatch(view.state.tr.setMeta("project-reference-directory", true));
  }, [
    referenceProvider,
    referenceSourceSignature,
  ]);
  useEffect(() => {
    if (
      !editorReady ||
      !referenceProvider ||
      !referenceContext ||
      referenceProjectIds === "[]"
    )
      return;
    let controller: AbortController | null = null;
    let disposed = false;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const projectIds: string[] = JSON.parse(referenceProjectIds);
      for (const projectId of projectIds) {
        if (
          referenceContext.policy.sameProjectOnly &&
          projectId !== referenceContext.source.projectId
        )
          continue;
        const version = Symbol();
        referenceDirectoryVersionsRef.current.set(projectId, version);
        Promise.resolve()
          .then(() =>
            referenceProvider({
              query: "",
              trigger: "@",
              context: referenceContext,
              signal: request.signal,
              projectId,
            }),
          )
          .then((candidates) => {
            if (
              disposed ||
              request.signal.aborted ||
              referenceDirectoryVersionsRef.current.get(projectId) !== version
            )
              return;
            referenceDirectoriesRef.current.set(
              projectId,
              candidates.filter(
                (candidate) => candidate.target.projectId === projectId,
              ),
            );
            const current = crepeRef.current;
            const view = current && getEditorView(current);
            if (view)
              view.dispatch(
                view.state.tr.setMeta("project-reference-directory", true),
              );
          })
          .catch((error: unknown) => {
            if (
              disposed ||
              request.signal.aborted ||
              referenceDirectoryVersionsRef.current.get(projectId) !== version
            )
              return;
            const status = (error as { status?: number })?.status;
            if (status && [401, 403, 404].includes(status)) {
              referenceDirectoriesRef.current.set(projectId, []);
              const current = crepeRef.current;
              const view = current && getEditorView(current);
              view?.dispatch(
                view.state.tr.setMeta("project-reference-directory", true),
              );
            }
            /* Transient failures do not turn other projects into missing targets. */
          });
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [editorReady, referenceProvider, referenceContext, referenceProjectIds]);
  useEffect(() => {
    if (
      !referenceMenu ||
      !referenceProvider?.listProjects ||
      referenceContext?.policy.sameProjectOnly
    )
      return;
    const controller = new AbortController();
    setReferenceProjectsStatus("loading");
    Promise.resolve()
      .then(() => referenceProvider.listProjects!(controller.signal))
      .then((projects) => {
        if (controller.signal.aborted) return;
        setReferenceProjects(projects);
        setReferenceProjectsStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setReferenceProjects([]);
          setReferenceProjectsStatus("error");
        }
      });
    return () => controller.abort();
  }, [
    Boolean(referenceMenu),
    referenceProvider,
    referenceContext?.policy.sameProjectOnly,
    referenceProjectsRetry,
  ]);
  const insertReferenceCandidateRef = useRef<
    ((candidate: MarkdownReferenceCandidate) => void) | null
  >(null);
  const insertProjectReferenceRef = useRef<
    ((projectId: string) => Promise<void>) | null
  >(null);
  const [mentionMenu, setMentionMenu] = useState<{
    query: string;
    candidates: MarkdownMentionCandidate[];
    selectedIndex: number;
    anchor: DocumentMenuAnchor;
    status?: "ready" | "loading" | "empty" | "error" | "rate_limited";
  } | null>(null);
  const mentionMenuRef = useRef(mentionMenu);
  mentionMenuRef.current = mentionMenu;
  const mentionTriggerRef = useRef<number | null>(null);
  const insertMentionCandidateRef = useRef<
    ((candidate: MarkdownMentionCandidate) => void) | null
  >(null);

  useEffect(() => {
    const query = mentionMenu?.query.trim();
    if (!query || !searchMentionCandidates) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMentionMenu((current) =>
        current?.query.trim() === query ? { ...current, status: "loading" } : current,
      );
      void searchMentionCandidates(query, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          const staticMatches = (mentionCandidates ?? []).filter(
            (candidate) =>
              (canMentionAgent || candidate.type !== "agent") &&
              candidate.name.toLowerCase().includes(query.toLowerCase()),
          );
          const merged = [...staticMatches, ...result].filter(
            (candidate, index, all) =>
              all.findIndex((item) => item.id === candidate.id && item.type === candidate.type) === index,
          ).slice(0, 20);
          setMentionMenu((current) =>
            current?.query.trim() === query
              ? { ...current, candidates: merged, selectedIndex: 0, status: merged.length ? "ready" : "empty" }
              : current,
          );
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          const message = error instanceof Error ? error.message : String(error);
          const rateLimited = Boolean(error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 429);
          setMentionMenu((current) =>
            current?.query.trim() === query
              ? { ...current, candidates: [], status: rateLimited || /429|限流|频繁/.test(message) ? "rate_limited" : "error" }
              : current,
          );
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canMentionAgent, mentionCandidates, mentionMenu?.query, searchMentionCandidates]);

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
        if (!mountedRef.current || crepeRef.current !== crepe) return;
        const name = escapeMarkdownLabel(file.name || "附件");
        const markdown =
          kind === "video"
            ? `\n<video controls src="${result.url}"></video>\n`
            : `\n[${name}](${result.url})\n`;
        const inserted = insertMarkdown(crepe, markdown);
        if (inserted && showTopBar) {
          crepe.editor.action((ctx) =>
            ctx.get(documentInsertMenuApi.key).recordRecent(
              kind === "video" ? "upload-video" : "upload-file",
            ),
          );
        }
      } catch (error) {
        reportUploadError(error);
      }
    },
    [reportUploadError, showTopBar],
  );

  useEffect(() => {
    mountedRef.current = true;
    editorReadyRef.current = false;
    setEditorReady(false);
    const root = rootRef.current;
    const overlayRoot = overlayRootRef.current;
    if (!root || !overlayRoot) return;

    const getMenuAnchor = (view: EditorView): DocumentMenuAnchor => {
      try {
        const coords = view.coordsAtPos(view.state.selection.from);
        const overlayRect = overlayRoot.getBoundingClientRect();
        return {
          left: coords.left - overlayRect.left,
          top: coords.bottom - overlayRect.top + 8,
        };
      } catch {
        const rect = view.dom.getBoundingClientRect();
        const overlayRect = overlayRoot.getBoundingClientRect();
        return {
          left: rect.left - overlayRect.left,
          top: rect.top - overlayRect.top + 8,
        };
      }
    };

    const actions: CrepeProjectActions = {
      uploadImage: (file) => uploadImage(uploadHandlerRef.current, file),
      uploadVideo: () => videoInputRef.current?.click(),
      uploadFile: () => fileInputRef.current?.click(),
      insertReference: (candidate) => {
        const crepe = crepeRef.current;
        if (!crepe) return;
        return insertMarkdown(
          crepe,
          `@[${escapeMarkdownLabel(candidate.label)}](${candidate.key})`,
        );
      },
      openProjectReference: () => openReferenceMenuRef.current?.(),
    };
    const config = buildCrepeConfig({
      placeholder,
      actions,
      showTopBar,
    });
    const crepe = new Crepe({
      root,
      defaultValue: value,
      ...config,
    });
    crepeRef.current = crepe;
    crepe.addFeature(projectReferencePresentation, {
      root,
      getCandidates: () => [...referenceDirectoriesRef.current.values()].flat(),
      getResolvedProjectIds: () =>
        new Set(referenceDirectoriesRef.current.keys()),
    });
    if (showTopBar) {
      crepe.addFeature(documentHeadingMenu, { root: overlayRoot, actions });
      crepe.addFeature(documentInsertMenu, {
        root: overlayRoot,
        actions,
        referenceCandidates: referenceCandidatesRef.current,
        enableUploads: uploadsEnabled,
        enableProjectReferences: Boolean(
          referenceProviderRef.current && referenceContextRef.current,
        ),
      });
    }

    const reportCommentSelection = (view: EditorView) => {
      const selection = view.state.selection;
      if (selection.empty) return;
      const doc = view.state.doc;
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
    };

    crepe.addFeature(documentSelectionToolbar, {
      root: overlayRoot,
      onCommentSelection: onCommentSelectionRef.current
        ? reportCommentSelection
        : undefined,
    });
    if (!autoGrow) {
      crepe.addFeature(documentBlockEdit, {
        root: overlayRoot,
        actions,
        referenceCandidates: referenceCandidatesRef.current,
        enableUploads: uploadsEnabled,
        enableProjectReferences: Boolean(
          referenceProviderRef.current && referenceContextRef.current,
        ),
      });
    }
    crepe.setReadonly(readOnly);
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (externalSyncRef.current) {
          lastEmittedRef.current = markdown;
          return;
        }
        if (externalSyncTargetRef.current !== null) {
          const currentView =
            crepeRef.current === crepe ? getEditorView(crepe) : null;
          const currentMarkdown = currentView
            ? crepe.editor.action(getMarkdown())
            : null;
          if (currentMarkdown === markdown) {
            externalSyncTargetRef.current = null;
            lastEmittedRef.current = markdown;
            return;
          }
          externalSyncTargetRef.current = null;
        }
        if (markdown === lastEmittedRef.current) return;
        lastEmittedRef.current = markdown;
        onChangeRef.current(markdown);
        updateMentions(markdown);
      });
    });

    const handlePaste = (event: ClipboardEvent) => {
      const localize = localizeRemoteImageRef.current;
      if (!localize || readOnlyRef.current) return;

      const markdownPaste = getMarkdownImagePaste(event.clipboardData);
      const plainText =
        event.clipboardData?.getData("text/plain")?.trim() ?? "";
      const externalUrls = getExternalImageUrlsFromClipboard(
        event.clipboardData,
      );
      const externalUrl = plainText
        ? null
        : getExternalImageUrlFromClipboard(event.clipboardData);

      if (markdownPaste) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void Promise.all(
          markdownPaste.externalUrls.map(
            async (url) => [url, await localize(url)] as const,
          ),
        )
          .then((localized) => {
            if (!mountedRef.current || crepeRef.current !== crepe) return;
            insertMarkdown(
              crepe,
              replaceMarkdownImageUrls(
                markdownPaste.markdown,
                new Map(localized),
              ),
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
            const view = getEditorView(crepe);
            if (!view) return;
            const replacements = new Map(localized);
            const currentMarkdown = crepe.editor.action(getMarkdown());
            const markdown = replaceMarkdownImageUrls(
              currentMarkdown,
              replacements,
            );
            if (markdown !== currentMarkdown) {
              crepe.editor.action(replaceAll(markdown));
            }
          })
          .catch(reportUploadError);
      }, 0);
    };
    root.addEventListener("paste", handlePaste, true);

    const closeReferenceMenu = () => {
      projectInsertAbortRef.current?.abort();
      projectInsertAbortRef.current = null;
      projectInsertGenerationRef.current += 1;
      selectedReferenceProjectRef.current =
        referenceContextRef.current?.source.projectId;
      referenceRequestRef.current += 1;
      referenceTriggerRef.current = null;
      forceReferenceMenuRef.current = false;
      referenceAbortRef.current?.abort();
      referenceAbortRef.current = null;
      setReferenceMenu(null);
    };
    closeReferenceMenuRef.current = () => {
      closeReferenceMenu();
      getEditorView(crepe)?.focus();
    };

    const closeMentionMenu = () => {
      mentionTriggerRef.current = null;
      setMentionMenu(null);
    };

    const updateMentions = (markdown: string) => {
      const current = mentionsRef.current;
      if (!current.length || !onMentionsChangeRef.current) return;
      const next = current.filter((mention) =>
        markdown.includes(`@${mention.name}`),
      );
      if (
        next.length === current.length &&
        next.every(
          (mention, index) =>
            mention.id === current[index]?.id &&
            mention.type === current[index]?.type,
        )
      )
        return;
      mentionsRef.current = next;
      onMentionsChangeRef.current(next);
    };

    const updateMentionMenu = () => {
      const candidates = mentionCandidatesRef.current ?? [];
      const hasSearch = Boolean(searchMentionCandidatesRef.current);
      const view = getEditorView(crepe);
      if (
        (!candidates.length && !hasSearch) ||
        readOnlyRef.current ||
        !view ||
        !view.state.selection.empty
      ) {
        closeMentionMenu();
        return;
      }
      const trigger = mentionTriggerRef.current;
      if (trigger === null || trigger > view.state.selection.from) {
        closeMentionMenu();
        return;
      }
      const typed = view.state.doc.textBetween(
        trigger,
        view.state.selection.from,
        "",
      );
      if (
        !typed.startsWith("@") ||
        /[\n\r\t ]/.test(typed) ||
        typed.length > 80
      ) {
        closeMentionMenu();
        return;
      }
      const query = typed.slice(1).toLowerCase();
      const visibleCandidates = candidates
        .filter(
          (candidate) =>
            canMentionAgentRef.current || candidate.type !== "agent",
        )
        .filter(
          (candidate) => !query || candidate.name.toLowerCase().includes(query),
        )
        .slice(0, 20);
      if (!visibleCandidates.length) {
        closeMentionMenu();
        return;
      }
      setMentionMenu({
        query: typed.slice(1),
        candidates: visibleCandidates,
        selectedIndex: 0,
        anchor: getMenuAnchor(view),
        status: visibleCandidates.length ? "ready" : hasSearch && query ? "loading" : "empty",
      });
    };

    const insertMentionCandidate = (candidate: MarkdownMentionCandidate) => {
      const trigger = mentionTriggerRef.current;
      if (trigger === null) return;
      const view = getEditorView(crepe);
      if (!view) return;
      view.dispatch(view.state.tr.delete(trigger, view.state.selection.from));
      insertMarkdown(crepe, `@${escapeMarkdownLabel(candidate.name)} `);
      const current = mentionsRef.current;
      const mention: CommentMention = {
        id: candidate.id,
        name: candidate.name,
        type: candidate.type,
      };
      if (
        !current.some(
          (item) => item.id === mention.id && item.type === mention.type,
        )
      ) {
        const next = [...current, mention];
        mentionsRef.current = next;
        onMentionsChangeRef.current?.(next);
      }
      closeMentionMenu();
    };
    insertMentionCandidateRef.current = insertMentionCandidate;

    const updateReferenceMenu = () => {
      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      const view = getEditorView(crepe);
      if (
        !provider ||
        !context ||
        readOnlyRef.current ||
        !view ||
        !view.state.selection.empty
      ) {
        closeReferenceMenu();
        return;
      }
      const trigger = referenceTriggerRef.current;
      if (trigger === null || trigger > view.state.selection.from) {
        closeReferenceMenu();
        return;
      }
      const typed = view.state.doc.textBetween(
        trigger,
        view.state.selection.from,
        "",
      );
      if (
        (!forceReferenceMenuRef.current && !typed.startsWith("@")) ||
        /[\n\r\t ]/.test(typed) ||
        typed.length > 120
      ) {
        closeReferenceMenu();
        return;
      }
      const query = forceReferenceMenuRef.current ? "" : typed.slice(1);
      const projectId =
        selectedReferenceProjectRef.current ?? context.source.projectId;
      const directoryVersion = Symbol();
      if (!query)
        referenceDirectoryVersionsRef.current.set(projectId, directoryVersion);
      const requestId = ++referenceRequestRef.current;
      referenceAbortRef.current?.abort();
      const controller = new AbortController();
      referenceAbortRef.current = controller;
      setReferenceMenu({
        query,
        candidates: [],
        selectedIndex: 0,
        anchor: getMenuAnchor(view),
        status: "loading",
      });
      Promise.resolve()
        .then(() =>
          provider({
            query,
            trigger: "@",
            context,
            signal: controller.signal,
            projectId,
          }),
        )
        .then((candidates) => {
          if (
            controller.signal.aborted ||
            requestId !== referenceRequestRef.current ||
            !mountedRef.current
          )
            return;
          const allowedKinds = context.policy.allowedTargetKinds;
          const visibleCandidates = candidates.filter((candidate) => {
            if (candidate.target.projectId !== projectId) return false;
            if (allowedKinds && !allowedKinds.includes(candidate.target.kind))
              return false;
            if (
              context.policy.sameProjectOnly &&
              candidate.target.projectId !== context.source.projectId
            )
              return false;
            return true;
          });
          const currentView = getEditorView(crepe);
          if (!currentView) return;
          setReferenceMenu({
            query,
            candidates: visibleCandidates,
            selectedIndex: 0,
            anchor: getMenuAnchor(currentView),
            status: "ready",
          });
          if (
            !query &&
            referenceDirectoryVersionsRef.current.get(projectId) ===
              directoryVersion
          ) {
            referenceDirectoriesRef.current.set(projectId, visibleCandidates);
            currentView.dispatch(
              currentView.state.tr.setMeta("project-reference-directory", true),
            );
          }
        })
        .catch((error: unknown) => {
          if (
            !controller.signal.aborted &&
            requestId === referenceRequestRef.current
          ) {
            if (
              !query &&
              referenceDirectoryVersionsRef.current.get(projectId) ===
                directoryVersion &&
              [401, 403, 404].includes(
                (error as { status?: number })?.status ?? 0,
              )
            ) {
              referenceDirectoriesRef.current.set(projectId, []);
              const currentView = getEditorView(crepe);
              currentView?.dispatch(
                currentView.state.tr.setMeta(
                  "project-reference-directory",
                  true,
                ),
              );
            }
            setReferenceMenu((current) =>
              current ? { ...current, status: "error" } : null,
            );
          }
        });
    };
    retryReferenceMenuRef.current = updateReferenceMenu;
    openReferenceMenuRef.current = () => {
      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      if (!provider || !context || readOnlyRef.current) return;
      const view = getEditorView(crepe);
      if (!view) return;
      if (!view.state.selection.empty) return;
      selectedReferenceProjectRef.current = context.source.projectId;
      setSelectedReferenceProject(context.source.projectId);
      referenceTriggerRef.current = view.state.selection.from;
      const preceding = view.state.selection.$from.parent.textBetween(
        0,
        view.state.selection.$from.parentOffset,
        "",
      );
      if (preceding.startsWith("/")) {
        // Opening is inert; consume a slash command only after selecting a target.
        referenceTriggerRef.current -= preceding.length;
      }
      forceReferenceMenuRef.current = true;
      updateReferenceMenu();
    };

    const insertReferenceCandidate = (
      candidate: MarkdownReferenceCandidate,
    ) => {
      const trigger = referenceTriggerRef.current;
      if (trigger === null) return;
      const view = getEditorView(crepe);
      if (!view) return;
      const markdown = serializeMarkdownReference(
        candidate.target,
        candidate.label ||
          candidate.displayPath.split(" / ").pop() ||
          candidate.displayPath,
      );
      // Delete the trigger/query, then let Milkdown parse canonical Markdown
      // into a link mark instead of inserting the syntax as literal text.
      const parsed = crepe.editor.action((ctx) => ctx.get(parserCtx)(markdown));
      const inline = parsed.firstChild?.content;
      if (!inline) return;
      const transaction = view.state.tr.replaceWith(
        trigger,
        view.state.selection.from,
        inline,
      );
      // Keep typing outside the reference mark and insert in one undo step.
      transaction.setStoredMarks([]);
      view.dispatch(transaction.scrollIntoView());
      closeReferenceMenu();
      view.focus();
      if (showTopBar) {
        crepe.editor.action((ctx) =>
          ctx.get(documentInsertMenuApi.key).recordRecent(
            "insert-project-reference",
          ),
        );
      }
      onReferenceInsertedRef.current?.(candidate);
    };
    insertReferenceCandidateRef.current = insertReferenceCandidate;
    insertProjectReferenceRef.current = async (projectId) => {
      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      if (!provider || !context) throw new Error("项目引用上下文不可用");
      if (!context.policy.allowedTargetKinds.includes("project")) {
        throw new Error("当前编辑器不允许引用整个项目");
      }
      const trigger = referenceTriggerRef.current;
      if (trigger === null || !referenceMenuRef.current) return;
      projectInsertAbortRef.current?.abort();
      const controller = new AbortController();
      projectInsertAbortRef.current = controller;
      const generation = ++projectInsertGenerationRef.current;
      const sourceSignature = JSON.stringify(context.source);
      try {
        const candidates = await provider({
          query: "",
          trigger: "@",
          context,
          signal: controller.signal,
          projectId,
        });
        if (
          controller.signal.aborted ||
          !mountedRef.current ||
          generation !== projectInsertGenerationRef.current ||
          !referenceMenuRef.current ||
          referenceTriggerRef.current !== trigger ||
          JSON.stringify(referenceContextRef.current?.source ?? null) !==
            sourceSignature
        )
          return;
        const candidate = candidates.find(
          (item) =>
            item.target.kind === "project" && item.target.projectId === projectId,
        );
        if (!candidate) throw new Error("项目不存在或无权访问");
        insertReferenceCandidate(candidate);
      } finally {
        if (projectInsertAbortRef.current === controller) {
          projectInsertAbortRef.current = null;
        }
      }
    };

    const handleReferenceKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        (event.target as HTMLElement).closest?.(".wb-reference")
      ) {
        event.preventDefault();
        (event.target as HTMLElement).click();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        onSubmitRef.current?.();
        return;
      }
      const mentionEnabled = Boolean(
        mentionCandidatesRef.current?.length || searchMentionCandidatesRef.current,
      );
      const mentionView = mentionEnabled ? getEditorView(crepe) : null;
      if (mentionView && !readOnlyRef.current) {
        if (event.key === "@" && mentionView.state.selection.empty) {
          mentionTriggerRef.current = mentionView.state.selection.from;
          window.queueMicrotask(updateMentionMenu);
          return;
        }
        const currentMentionMenu = mentionMenuRef.current;
        if (currentMentionMenu) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            setMentionMenu((current) => {
              if (!current || current.candidates.length === 0) return current;
              const selectedIndex =
                (current.selectedIndex + delta + current.candidates.length) %
                current.candidates.length;
              return { ...current, selectedIndex };
            });
            return;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            const candidate =
              currentMentionMenu.candidates[currentMentionMenu.selectedIndex];
            if (candidate) {
              event.preventDefault();
              insertMentionCandidateRef.current?.(candidate);
              return;
            }
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeMentionMenu();
            return;
          }
          window.setTimeout(updateMentionMenu, 0);
        }
      }

      const provider = referenceProviderRef.current;
      const context = referenceContextRef.current;
      if (!provider || !context || readOnlyRef.current) return;
      const view = getEditorView(crepe);
      if (!view) return;
      if (event.key === "@" && view.state.selection.empty) {
        referenceTriggerRef.current = view.state.selection.from;
        window.queueMicrotask(updateReferenceMenu);
        return;
      }
      // Treat a canonical wb:// link mark as one atomic chip for deletion.
      // Milkdown stores the label as ordinary text with a link mark; deleting
      // the whole marked run keeps users from leaving a half-written URI.
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        view.state.selection.empty
      ) {
        const { from } = view.state.selection;
        const direction = event.key === "Backspace" ? -1 : 1;
        const probe =
          direction < 0
            ? view.state.doc.resolve(from).nodeBefore
            : view.state.doc.resolve(from).nodeAfter;
        const mark = probe?.marks.find(
          (candidate) =>
            typeof candidate.attrs?.href === "string" &&
            candidate.attrs.href.startsWith("wb://"),
        );
        if (mark) {
          let start = from;
          let end = from;
          if (direction < 0) {
            while (start > 0) {
              const node = view.state.doc.resolve(start).nodeBefore;
              if (
                !node?.isText ||
                !node.marks.some((candidate) => candidate.eq(mark))
              )
                break;
              start -= node.nodeSize;
            }
            end = from;
          } else {
            while (end < view.state.doc.content.size) {
              const node = view.state.doc.resolve(end).nodeAfter;
              if (
                !node?.isText ||
                !node.marks.some((candidate) => candidate.eq(mark))
              )
                break;
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
            (current.selectedIndex + delta + current.candidates.length) %
            current.candidates.length;
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

    const handleReferenceInput = () => {
      window.setTimeout(updateMentionMenu, 0);
      window.setTimeout(updateReferenceMenu, 0);
    };
    const handleReferenceClick = (event: MouseEvent) => {
      if (readOnlyRef.current && openMarkdownImage(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "a",
      );
      // Milkdown sanitizes custom protocols in rendered href; the decoration
      // preserves the canonical URI without exposing it to native navigation.
      const reference =
        (event.target as HTMLElement).closest<HTMLElement>(
          "[data-reference-uri]",
        ) ?? anchor?.querySelector<HTMLElement>("[data-reference-uri]");
      const href =
        reference?.dataset.referenceUri ?? anchor?.getAttribute("href");
      if (!href?.startsWith("wb://")) return;
      const target = decodeMarkdownReferenceUri(href);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (
        referenceDirectoriesRef.current.has(target.projectId) &&
        !referenceDirectoriesRef.current
          .get(target.projectId)!
          .some(
            (candidate) =>
              serializeMarkdownReference(candidate.target, "") ===
              serializeMarkdownReference(target, ""),
          )
      )
        return;
      onReferenceClickRef.current?.({
        target,
        labelSnapshot: anchor?.textContent?.trim() || "",
      });
    };
    root.addEventListener("keydown", handleReferenceKeyDown, true);
    root.addEventListener("input", handleReferenceInput, true);
    root.addEventListener("click", handleReferenceClick, true);

    void crepe
      .create()
      .then(() => {
        if (!mountedRef.current || crepeRef.current !== crepe) return;
        editorReadyRef.current = true;
        setEditorReady(true);
        if (autoFocus) {
          queueMicrotask(() => {
            // StrictMode can leave a previous instance in this host while its
            // async destroy finishes. Focus this instance, not the first DOM match.
            if (
              !mountedRef.current ||
              crepeRef.current !== crepe ||
              !editorReadyRef.current
            )
              return;
            getEditorView(crepe)?.focus();
          });
        }
      })
      .catch(() => {
        if (crepeRef.current !== crepe) return;
        editorReadyRef.current = false;
        setEditorReady(false);
      });

    return () => {
      mountedRef.current = false;
      root.removeEventListener("paste", handlePaste, true);
      root.removeEventListener("keydown", handleReferenceKeyDown, true);
      root.removeEventListener("input", handleReferenceInput, true);
      root.removeEventListener("click", handleReferenceClick, true);
      referenceRequestRef.current += 1;
      closeReferenceMenu();
      closeMentionMenu();
      externalSyncTargetRef.current = null;
      openReferenceMenuRef.current = null;
      retryReferenceMenuRef.current = null;
      closeReferenceMenuRef.current = null;
      referenceDirectoriesRef.current.clear();
      referenceDirectoryVersionsRef.current.clear();
      selectedReferenceProjectRef.current = undefined;
      insertReferenceCandidateRef.current = null;
      insertProjectReferenceRef.current = null;
      insertMentionCandidateRef.current = null;
      if (crepeRef.current === crepe) {
        crepeRef.current = null;
        editorReadyRef.current = false;
      }
      void crepe.destroy();
    };
    // Crepe's feature graph is immutable after creation. Callback props use refs;
    // only changes that reshape the menu recreate the instance.
  }, [
    placeholder,
    uploadsEnabled,
    referenceCandidateSignature,
    Boolean(referenceProvider),
    Boolean(referenceContext),
    Boolean(onCommentSelection),
    openMarkdownImage,
    showTopBar,
    autoGrow,
    autoFocus,
  ]);

  useEffect(() => {
    crepeRef.current?.setReadonly(readOnly);
  }, [readOnly]);

  useEffect(() => {
    const crepe = crepeRef.current;
    if (!crepe || !editorReadyRef.current || value === lastEmittedRef.current)
      return;
    queueMicrotask(() => {
      if (
        !mountedRef.current ||
        crepeRef.current !== crepe ||
        !editorReadyRef.current
      )
        return;
      const view = getEditorView(crepe);
      if (!view) return;
      const currentMarkdown = crepe.editor.action(getMarkdown());
      if (currentMarkdown === value) {
        lastEmittedRef.current = value;
        return;
      }

      const nextDoc = crepe.editor.action((ctx) => ctx.get(parserCtx)(value));
      if (!nextDoc) return;

      const currentDoc = view.state.doc;
      const diffStart = currentDoc.content.findDiffStart(nextDoc.content);
      if (diffStart === null) {
        lastEmittedRef.current = value;
        return;
      }
      const diffEnd = currentDoc.content.findDiffEnd(
        nextDoc.content,
        currentDoc.content.size,
        nextDoc.content.size,
      );
      if (!diffEnd) return;

      // A block-level change can make the first differing position land
      // after the common suffix in the new document (for example, removing
      // the second of two paragraphs). In that case `nextDoc.slice` would be
      // called with `from > to`, producing an invalid open slice that makes
      // ProseMirror's Fitter walk past the end of its fragment. Fall back to
      // the safe whole-document replacement for this structural case.
      const canApplyDiff = diffStart <= diffEnd.a && diffStart <= diffEnd.b;

      referenceTriggerRef.current = null;
      mentionTriggerRef.current = null;
      referenceRequestRef.current += 1;
      setReferenceMenu(null);
      setMentionMenu(null);
      externalSyncRef.current = true;
      externalSyncTargetRef.current = value;
      try {
        if (canApplyDiff) {
          const transaction = view.state.tr
            .replace(diffStart, diffEnd.a, nextDoc.slice(diffStart, diffEnd.b))
            .setMeta("addToHistory", false)
            .setMeta("document-editor-external-sync", true);
          view.dispatch(transaction);
        } else {
          // Keep the fallback in the same external-sync transaction boundary
          // so a structural refresh is not added to the undo history.
          const transaction = view.state.tr
            .replace(
              0,
              currentDoc.content.size,
              nextDoc.slice(0, nextDoc.content.size),
            )
            .setMeta("addToHistory", false)
            .setMeta("document-editor-external-sync", true);
          view.dispatch(transaction);
        }
        lastEmittedRef.current = value;
      } finally {
        externalSyncRef.current = false;
      }
    });
  }, [value, editorReady]);

  return (
    <>
      <div
        className={cn(
          "document-editor-crepe relative",
          readOnly && "markdown-image-previewable",
          scrollable ? "h-full min-h-[200px]" : "h-auto min-h-0",
          autoGrow && "document-editor-autogrow",
          className,
        )}
        data-document-editor="crepe"
        data-readonly={readOnly}
        data-scrollable={scrollable}
        data-auto-grow={autoGrow}
      >
        <div ref={rootRef} className="crepe h-full" />
        <div
          ref={overlayRootRef}
          className="document-editor-overlays"
          data-document-editor-overlays="true"
        >
          {referenceMenu && (
            <ProjectReferencePicker
              projects={referenceProjects}
              projectId={
                selectedReferenceProject ?? referenceContext?.source.projectId
              }
              currentProjectId={referenceContext?.source.projectId}
              projectsStatus={referenceProjectsStatus}
              onProjectsRetry={() =>
                setReferenceProjectsRetry((value) => value + 1)
              }
              onProjectChange={
                referenceProvider?.listProjects &&
                !referenceContext?.policy.sameProjectOnly
                  ? (projectId) => {
                      selectedReferenceProjectRef.current = projectId;
                      setSelectedReferenceProject(projectId);
                      retryReferenceMenuRef.current?.();
                    }
                  : undefined
              }
              onProjectInsert={
                referenceProvider?.listProjects &&
                !referenceContext?.policy.sameProjectOnly &&
                referenceContext?.policy.allowedTargetKinds.includes("project")
                  ? (projectId) => insertProjectReferenceRef.current?.(projectId)
                  : undefined
              }
              allowProjectReferences={Boolean(
                referenceContext?.policy.allowedTargetKinds.includes("project"),
              )}
              candidates={referenceMenu.candidates}
              status={referenceMenu.status}
              anchor={referenceMenu.anchor}
              onSelect={(candidate) =>
                insertReferenceCandidateRef.current?.(candidate)
              }
              onClose={dismissReferenceMenu}
              onRetry={() => retryReferenceMenuRef.current?.()}
            />
          )}
          {mentionMenu && (
            <div
              className="document-mention-menu absolute max-h-72 min-w-56 max-w-[min(90vw,22rem)] overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
              style={{
                left: mentionMenu.anchor.left,
                top: mentionMenu.anchor.top,
              }}
              role="listbox"
              aria-label="提及候选"
            >
              {mentionMenu.status === "loading" && <div className="px-2 py-1.5 text-xs text-muted-foreground">正在搜索参与者…</div>}
              {mentionMenu.status === "empty" && <div className="px-2 py-1.5 text-xs text-muted-foreground">无匹配参与者</div>}
              {mentionMenu.status === "rate_limited" && <div className="px-2 py-1.5 text-xs text-destructive">搜索过于频繁，请稍后重试</div>}
              {mentionMenu.status === "error" && <div className="px-2 py-1.5 text-xs text-destructive">参与者搜索失败</div>}
              {mentionMenu.candidates.map((candidate, index) => (
                <button
                  key={`${candidate.type}:${candidate.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === mentionMenu.selectedIndex}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                    index === mentionMenu.selectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/60",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMentionCandidateRef.current?.(candidate);
                  }}
                >
                  <span className="shrink-0 text-muted-foreground">@</span>
                  <span className="min-w-0 flex-1 truncate">
                    {candidate.name}
                  </span>
                  {candidate.type === "agent" && (
                    <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-500">
                      AI
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
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
      {lightbox}
    </>
  );
}
