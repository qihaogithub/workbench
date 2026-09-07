import type { Editor } from "@milkdown/kit/core";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { $ctx, $prose } from "@milkdown/kit/utils";
import type { CrepeProjectActions } from "./crepe-config";
import { DocumentHeadingPicker } from "./document-heading-picker";
import { getHeadingSelection } from "./document-heading-command";

export const documentHeadingMenuApi = $ctx(
  { toggle: () => {} },
  "documentHeadingMenuApi",
);

/** TopBar registers its trigger through Crepe's public buildTopBar API. */
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
            const picker = new DocumentHeadingPicker(ctx, view, {
              root: options.root,
              variant: "topbar",
            });
            const trigger = () =>
              view.dom.parentElement?.querySelector<HTMLElement>(
                "[data-document-heading-trigger]",
              ) ?? null;
            ctx.set(documentHeadingMenuApi.key, {
              toggle() {
                const button = trigger()?.closest("button");
                if (button) picker.toggle(button);
              },
            });
            const keyboardClick = (event: MouseEvent) => {
              if (event.detail !== 0) return;
              const button = (event.target as Element).closest("button");
              if (!button?.contains(trigger())) return;
              event.preventDefault();
              picker.toggle(button);
            };
            const toolbarRoot = view.dom.parentElement;
            toolbarRoot?.addEventListener("click", keyboardClick);
            const update = () => {
              picker.update();
              const span = trigger();
              if (!span) return;
              span.textContent = `${getHeadingSelection(view.state).label} ▾`;
              const button = span.closest("button");
              button?.setAttribute("aria-label", "标题样式");
              button?.setAttribute("aria-haspopup", "menu");
              button?.setAttribute("aria-expanded", String(picker.isOpen));
            };
            update();
            return {
              update,
              destroy() {
                toolbarRoot?.removeEventListener("click", keyboardClick);
                picker.destroy();
              },
            };
          },
        }),
    ),
  );
};
