import { commandsCtx, type Editor } from "@milkdown/kit/core";
import {
  headingSchema,
  paragraphSchema,
  setBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $ctx, $prose } from "@milkdown/kit/utils";
import type { CrepeProjectActions } from "./crepe-config";
import { DocumentBlockMenu } from "./document-block-menu";
import { mountDocumentOverlayPositioner } from "./document-overlay-positioning";
import {
  PRIMARY_HEADING_STYLE_OPTIONS,
  MORE_HEADING_STYLE_OPTIONS,
  getHeadingStyleLabel,
} from "./heading-style-toolbar";

export const documentHeadingMenuApi = $ctx(
  { toggle: () => {} },
  "documentHeadingMenuApi",
);

/** The TopBar button is registered via buildTopBar; this feature owns only
 * that button's labelled span and its menu, not Crepe's rendered controls. */
export const documentHeadingMenu = (
  editor: Editor,
  options?: { root: HTMLElement; actions: CrepeProjectActions },
) => {
  if (!options) return;
  editor.use(documentHeadingMenuApi).use(
    $prose(
      (ctx) =>
        new Plugin({
          key: new PluginKey("document-heading-menu"),
          view(view) {
            const ownerDocument = view.dom.ownerDocument;
            let anchor: HTMLElement | null = null;
            const trigger = () =>
              view.dom.parentElement?.querySelector<HTMLElement>(
                "[data-document-heading-trigger]",
              ) ?? null;
            const close = () => {
              anchor = null;
              menu.setVisible(false);
              positioner.hide();
              trigger()
                ?.closest("button")
                ?.setAttribute("aria-expanded", "false");
            };
            const groups = [
              {
                key: "text",
                label: "文本",
                options: PRIMARY_HEADING_STYLE_OPTIONS,
              },
              {
                key: "more",
                label: "更多",
                options: MORE_HEADING_STYLE_OPTIONS,
              },
            ].map(({ key, label, options: headings }) => ({
              key,
              label,
              items: headings.map(({ label, level }) => ({
                key: level === null ? "text" : `h${level}`,
                label,
                icon: '<svg viewBox="0 0 24 24"><path d="M5 5h2v6h10V5h2v14h-2v-6H7v6H5Z"/></svg>',
                run: () => {
                  close();
                  ctx.get(commandsCtx).call(setBlockTypeCommand.key, {
                    nodeType:
                      level === null
                        ? paragraphSchema.type(ctx)
                        : headingSchema.type(ctx),
                    attrs: level === null ? undefined : { level },
                  });
                  view.focus();
                },
              })),
            }));
            const menu = new DocumentBlockMenu(
              ctx,
              { groups, actions: options.actions, label: "标题样式" },
              () => {
                close();
                view.focus();
              },
              ownerDocument,
            );
            menu.element.classList.add("document-heading-menu");
            options.root.append(menu.element);
            const positioner = mountDocumentOverlayPositioner({
              root: options.root,
              boundary:
                view.dom.closest('[data-document-editor="crepe"]') ?? view.dom,
              floating: menu.element,
              contextElement: view.dom,
              getReferenceRect: () => {
                if (!anchor?.isConnected) return null;
                const rect = anchor.getBoundingClientRect();
                const bar = anchor
                  .closest(".milkdown-top-bar")
                  ?.getBoundingClientRect();
                // A wrapped TopBar may have more than one row. Open below
                // its last row while retaining the clicked button's x anchor.
                return new DOMRect(
                  rect.left,
                  rect.top,
                  rect.width,
                  Math.max(rect.bottom, bar?.bottom ?? rect.bottom) - rect.top,
                );
              },
              placements: ["bottom-start", "right-start", "left-start"],
              minimumSize: { width: 160, height: 96 },
            });
            ctx.set(documentHeadingMenuApi.key, {
              toggle() {
                if (anchor) {
                  close();
                  return;
                }
                anchor = trigger()?.closest("button") ?? null;
                if (!anchor || !view.editable) return;
                anchor.setAttribute("aria-expanded", "true");
                menu.setVisible(true);
                void positioner.refresh();
              },
            });
            const outside = (event: PointerEvent) => {
              if (
                !menu.element.contains(event.target as Node) &&
                !anchor?.contains(event.target as Node)
              )
                close();
            };
            ownerDocument.addEventListener("pointerdown", outside, true);
            // Crepe's public TopBar button calls onRun on pointerdown only.
            // Native keyboard/assistive activation emits a detail=0 click;
            // handle it directly, without synthesizing pointer events.
            const keyboardClick = (event: MouseEvent) => {
              if (event.detail !== 0) return;
              const button = (event.target as Element).closest("button");
              if (!button?.contains(trigger())) return;
              event.preventDefault();
              ctx.get(documentHeadingMenuApi.key).toggle();
            };
            const toolbarRoot = view.dom.parentElement;
            toolbarRoot?.addEventListener("click", keyboardClick);
            const updateLabel = () => {
              const span = trigger();
              if (!span) return;
              const node = view.state.selection.$from.parent;
              span.textContent = `${getHeadingStyleLabel(node.type === headingSchema.type(ctx) ? Number(node.attrs.level) : null)} ▾`;
              const button = span.closest("button");
              button?.setAttribute("aria-label", "标题样式");
              button?.setAttribute("aria-haspopup", "menu");
              button?.setAttribute("aria-expanded", String(Boolean(anchor)));
            };
            updateLabel();
            return {
              update(_view, previous) {
                updateLabel();
                if (
                  !view.editable ||
                  previous.doc !== view.state.doc ||
                  !previous.selection.eq(view.state.selection)
                )
                  close();
              },
              destroy() {
                toolbarRoot?.removeEventListener("click", keyboardClick);
                ownerDocument.removeEventListener("pointerdown", outside, true);
                positioner.destroy();
                menu.destroy();
              },
            };
          },
        }),
    ),
  );
};
