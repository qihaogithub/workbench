import type { Editor } from "@milkdown/kit/core";
import { linkPreviewTooltip } from "@milkdown/kit/component/link-tooltip";
import { DOMSerializer, type Mark, type Node } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type PluginView } from "@milkdown/kit/prose/state";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import {
  Decoration,
  DecorationSet,
  type EditorProps,
} from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import {
  decodeMarkdownReferenceUri,
  encodeMarkdownReferenceUri,
} from "@workbench/shared/markdown-reference";
import type { MarkdownReferenceCandidate } from "@workbench/shared/markdown-reference";

export interface ProjectReferencePresentationOptions {
  root: HTMLElement;
  /** null includes loading and failed requests; [] means successfully loaded empty. */
  getCandidates: () => readonly MarkdownReferenceCandidate[] | null;
  /** Only these projects have an authoritative response; all others stay unknown. */
  getResolvedProjectIds?: () => ReadonlySet<string>;
}

export const projectReferenceDirectoryMeta = "project-reference-directory";
export const projectReferencePresentationKey = new PluginKey<DecorationSet>(
  "project-reference-presentation",
);

export function referenceDecorations(
  doc: Node,
  candidates: readonly MarkdownReferenceCandidate[] | null,
  resolvedProjectIds?: ReadonlySet<string>,
): DecorationSet {
  const directory = new Map<string, MarkdownReferenceCandidate>();
  for (const candidate of candidates ?? []) {
    try {
      directory.set(encodeMarkdownReferenceUri(candidate.target), candidate);
    } catch {
      /* A bad entry cannot invalidate other references. */
    }
  }
  const ranges: Array<{
    from: number;
    to: number;
    uri: string;
    label: string;
    parts: Array<{ from: number; to: number }>;
  }> = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const uri = node.marks.find((mark) => mark.type.name === "link")?.attrs
      .href;
    if (typeof uri !== "string" || !decodeMarkdownReferenceUri(uri)) return;
    const last = ranges[ranges.length - 1];
    const part = { from: pos, to: pos + node.nodeSize };
    if (last && last.to === pos && last.uri === uri) {
      last.to += node.nodeSize;
      last.label += node.text;
      last.parts.push(part);
    } else ranges.push({ ...part, uri, label: node.text ?? "", parts: [part] });
  });
  return DecorationSet.create(
    doc,
    ranges.flatMap(({ parts, uri, label }) => {
      const target = decodeMarkdownReferenceUri(uri)!;
      const candidate = directory.get(encodeMarkdownReferenceUri(target));
      const current =
        candidate?.label ||
        candidate?.displayPath.split("/").filter(Boolean).pop()?.trim() ||
        label;
      const unavailable =
        (resolvedProjectIds
          ? resolvedProjectIds.has(target.projectId)
          : candidates !== null) && !candidate;
      return parts.map(({ from, to }, index) =>
        Decoration.inline(from, to, {
          nodeName: "span",
          class:
            "wb-reference" +
            (current !== label ? " wb-reference-renamed" : "") +
            (index ? " wb-reference-continuation" : ""),
          "data-reference-uri": uri,
          "data-reference-kind": target.kind,
          "data-reference-label": current,
          "data-reference-path": candidate?.displayPath ?? "",
          "data-reference-status": unavailable
            ? "unavailable"
            : candidate
              ? "available"
              : "unknown",
          role: "link",
          tabindex: index ? "-1" : "0",
          title: "",
          "aria-label": `${current}${unavailable ? "（不可用）" : ""}`,
          ...(index && current !== label ? { "aria-hidden": "true" } : {}),
          ...(unavailable ? { "aria-disabled": "true" } : {}),
        }),
      );
    }),
  );
}

let popupSequence = 0;

/** Milkdown sanitizes wb:// hrefs to ""; decoration metadata is the DOM identity. */
export function findReferenceElement(
  target: EventTarget | null,
  editor: HTMLElement,
) {
  const element =
    target instanceof editor.ownerDocument.defaultView!.Node
      ? target.nodeType === 1
        ? (target as HTMLElement)
        : target.parentElement
      : null;
  // One link mark can contain several formatted spans. The whole wrapper,
  // including icon/padding, is one hit target and one tooltip identity.
  const reference =
    element
      ?.closest?.("[data-wb-reference-wrapper], a")
      ?.querySelector<HTMLElement>(".wb-reference[data-reference-uri]") ??
    element?.closest?.<HTMLElement>(".wb-reference[data-reference-uri]");
  return reference && editor.contains(reference) ? reference : null;
}

/** Guard the final show boundary as well as pointer events: upstream work is debounced. */
export function guardReferencePreviewView(pluginView: PluginView): PluginView {
  const preview = pluginView as PluginView & {
    show?: (mark: Mark, from: number, to: number, rect: DOMRect) => void;
    hide?: () => void;
  };
  const show = preview.show?.bind(preview);
  if (show)
    preview.show = (mark, from, to, rect) => {
      if (
        typeof mark.attrs.href === "string" &&
        decodeMarkdownReferenceUri(mark.attrs.href)
      ) {
        preview.hide?.();
        return;
      }
      show(mark, from, to, rect);
    };
  return preview;
}

export function createProjectReferencePresentationPlugin(
  options: ProjectReferencePresentationOptions,
) {
  const build = (doc: Node) => {
    let candidates: readonly MarkdownReferenceCandidate[] | null = null;
    try {
      candidates = options.getCandidates();
    } catch {
      /* Failed directory is unknown, never deleted. */
    }
    return referenceDecorations(
      doc,
      candidates,
      options.getResolvedProjectIds?.(),
    );
  };
  return new Plugin<DecorationSet>({
    key: projectReferencePresentationKey,
    state: {
      init: (_, state) => build(state.doc),
      apply: (tr, previous) =>
        tr.docChanged || tr.getMeta(projectReferenceDirectoryMeta)
          ? build(tr.doc)
          : previous,
    },
    props: {
      decorations: (state) => projectReferencePresentationKey.getState(state),
      markViews: {
        link(mark, view, inline) {
          const rendered = DOMSerializer.renderSpec(
            view.dom.ownerDocument,
            mark.type.spec.toDOM!(mark, inline),
          );
          const dom = rendered.dom as HTMLElement;
          if (decodeMarkdownReferenceUri(mark.attrs.href)) {
            // Own only the wrapper, never PM's contentDOM text. Without href or
            // tabindex the presentation wrapper is neither a link nor a tab stop.
            dom.removeAttribute("href");
            dom.removeAttribute("tabindex");
            dom.removeAttribute("title");
            dom.setAttribute("role", "presentation");
            dom.setAttribute("data-wb-reference-wrapper", "");
          }
          return {
            dom,
            contentDOM: (rendered.contentDOM ?? dom) as HTMLElement,
            ignoreMutation: (mutation) =>
              mutation.type === "attributes" &&
              (mutation.target === dom ||
                (mutation.attributeName === "aria-describedby" &&
                  mutation.target instanceof HTMLElement &&
                  mutation.target.matches(
                    ".wb-reference[data-reference-uri]",
                  ))),
          };
        },
      },
    },
    view(view) {
      const root = options.root;
      const document = root.ownerDocument;
      const win = document.defaultView!;
      const syncFontSize = () => {
        for (const wrapper of view.dom.querySelectorAll<HTMLElement>(
          "[data-wb-reference-wrapper]",
        )) {
          const size = win.getComputedStyle(wrapper).fontSize;
          if (
            size &&
            wrapper.style.getPropertyValue("--wb-reference-font-size") !== size
          ) {
            wrapper.style.setProperty("--wb-reference-font-size", size);
          }
        }
      };
      syncFontSize();
      const popup = document.createElement("div");
      popup.className = "wb-reference-popup";
      popup.id = `wb-reference-popup-${++popupSequence}`;
      popup.setAttribute("role", "tooltip");
      popup.hidden = true;
      root.appendChild(popup);
      let active: HTMLElement | null = null;
      let pending: HTMLElement | null = null;
      let dismissed: HTMLElement | null = null;
      let showTimer: ReturnType<typeof setTimeout> | undefined;
      let hideTimer: ReturnType<typeof setTimeout> | undefined;
      let positionRevision = 0;
      const cancelTimers = () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
        pending = null;
      };
      const hide = () => {
        cancelTimers();
        positionRevision++;
        active?.removeAttribute("aria-describedby");
        active = null;
        popup.hidden = true;
        root.classList.remove("wb-reference-popup-open");
      };
      const find = (target: EventTarget | null) => {
        return findReferenceElement(target, view.dom);
      };
      const showReference = (reference: HTMLElement) => {
        if (!view.dom.contains(reference)) return;
        hide();
        active = reference;
        popup.replaceChildren();
        const heading = document.createElement("div");
        heading.className = "wb-reference-popup-heading";
        const icon = document.createElement("span");
        icon.className = "wb-reference-popup-icon";
        icon.dataset.referenceKind = reference.dataset.referenceKind;
        icon.setAttribute("aria-hidden", "true");
        const title = document.createElement("strong");
        const type =
          (
            {
              page: "页面",
              config: "配置项",
              document: "文档",
              project: "项目",
            } as Record<string, string>
          )[reference.dataset.referenceKind ?? ""] ?? "引用";
        title.textContent = `${type} · ${reference.dataset.referenceLabel ?? ""}`;
        heading.append(icon, title);
        const source = document.createElement("div");
        source.className = "wb-reference-popup-source";
        source.textContent = `来源：${reference.dataset.referencePath || "来源暂不可用"}`;
        const hint = document.createElement("small");
        hint.textContent =
          reference.dataset.referenceStatus === "unavailable"
            ? "引用不可用"
            : "点击引用，在新标签页打开";
        popup.append(heading, source, hint);
        reference.setAttribute("aria-describedby", popup.id);
        root.classList.add("wb-reference-popup-open");
        popup.hidden = false;
        popup.style.visibility = "hidden";
        const wrapper =
          reference.closest<HTMLElement>("[data-wb-reference-wrapper]") ??
          reference;
        const revision = ++positionRevision;
        void computePosition(wrapper, popup, {
          strategy: "fixed",
          placement: "bottom-start",
          middleware: [
            offset(8),
            flip({ padding: 12 }),
            shift({ padding: 12 }),
          ],
        })
          .then(({ x, y }) => {
            if (revision !== positionRevision || active !== reference) return;
            popup.style.left = `${x}px`;
            popup.style.top = `${y}px`;
            popup.style.visibility = "visible";
          })
          .catch(() => {
            if (revision === positionRevision) hide();
          });
      };
      const show = (event: Event) => {
        const reference = find(event.target);
        if (!reference) {
          dismissed = null;
          return;
        }
        clearTimeout(hideTimer);
        if (active === reference) return;
        if (event.type === "focusin") {
          dismissed = null;
          showReference(reference);
          return;
        }
        if (pending === reference || dismissed === reference) return;
        clearTimeout(showTimer);
        pending = reference;
        showTimer = setTimeout(() => {
          pending = null;
          showReference(reference);
        }, 200);
      };
      const leave = (event: Event) => {
        const next = (event as MouseEvent).relatedTarget;
        if (next instanceof win.Node && popup.contains(next)) {
          clearTimeout(hideTimer);
          return;
        }
        const reference = find(next);
        if (reference && (reference === active || reference === pending))
          return;
        dismissed = null;
        clearTimeout(showTimer);
        pending = null;
        clearTimeout(hideTimer);
        hideTimer = setTimeout(hide, 150);
      };
      const retain = () => clearTimeout(hideTimer);
      const onScroll = (event: Event) => {
        if (event.target instanceof win.Node && popup.contains(event.target))
          return;
        hide();
      };
      const key = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          dismissed = active ?? pending;
          hide();
        }
      };
      view.dom.addEventListener("mouseover", show);
      view.dom.addEventListener("focusin", show);
      view.dom.addEventListener("mouseout", leave);
      view.dom.addEventListener("focusout", leave);
      view.dom.addEventListener("keydown", key);
      popup.addEventListener("mouseenter", retain);
      popup.addEventListener("mouseleave", leave);
      popup.addEventListener("keydown", key);
      win.addEventListener("scroll", onScroll, true);
      win.addEventListener("resize", hide);
      win.addEventListener("resize", syncFontSize);
      return {
        update(currentView, previousState) {
          const changed =
            currentView.state.doc !== previousState.doc ||
            projectReferencePresentationKey.getState(currentView.state) !==
              projectReferencePresentationKey.getState(previousState);
          if (changed || (active && !currentView.dom.contains(active))) hide();
          if (changed) syncFontSize();
        },
        destroy() {
          hide();
          popup.remove();
          view.dom.removeEventListener("mouseover", show);
          view.dom.removeEventListener("focusin", show);
          view.dom.removeEventListener("mouseout", leave);
          view.dom.removeEventListener("focusout", leave);
          view.dom.removeEventListener("keydown", key);
          popup.removeEventListener("mouseenter", retain);
          popup.removeEventListener("mouseleave", leave);
          popup.removeEventListener("keydown", key);
          win.removeEventListener("scroll", onScroll, true);
          win.removeEventListener("resize", hide);
          win.removeEventListener("resize", syncFontSize);
        },
      };
    },
  });
}

/** Register with crepe.addFeature(projectReferencePresentation, options). */
export function projectReferencePresentation(
  editor: Editor,
  options?: ProjectReferencePresentationOptions,
) {
  if (!options) return;
  editor
    .config((ctx) => {
      // Crepe configures LinkTooltip before custom features. Remain usable when it is disabled.
      if (!ctx.isInjected(linkPreviewTooltip.key)) return;
      ctx.update(linkPreviewTooltip.key, (previous) => ({
        ...previous,
        props: suppressReferenceLinkPreview(previous.props ?? {}),
        view: previous.view
          ? (view) => guardReferencePreviewView(previous.view!(view))
          : undefined,
      }));
    })
    .use($prose(() => createProjectReferencePresentationPlugin(options)));
}

/** Skip Milkdown's debounced preview for references, preserving ordinary links and edit UI. */
export function suppressReferenceLinkPreview(props: EditorProps): EditorProps {
  const events = props.handleDOMEvents;
  return {
    ...props,
    handleDOMEvents: {
      ...events,
      mousemove(view, event) {
        const element = findReferenceElement(event.target, view.dom);
        const uri = element?.getAttribute("data-reference-uri");
        if (
          element &&
          view.dom.contains(element) &&
          uri &&
          decodeMarkdownReferenceUri(uri)
        ) {
          // Also dismiss a previously hovered ordinary link.
          (
            events?.mousemove as { cancel?: () => void } | undefined
          )?.cancel?.();
          events?.mouseleave?.call(this, view, event);
          return false;
        }
        return events?.mousemove?.call(this, view, event);
      },
    },
  };
}
