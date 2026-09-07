import type { Node } from "@milkdown/kit/prose/model";
import {
  AllSelection,
  EditorState,
  TextSelection,
  type Transaction,
} from "@milkdown/kit/prose/state";
import { liftListItem } from "@milkdown/kit/prose/schema-list";

/** Heading style is a block operation; collect once, before any structural edits. */
export function getHeadingSelection(state: EditorState) {
  const blocks: { pos: number; node: Node }[] = [];
  let reason = "";
  let inList = false;
  if (
    !(
      state.selection instanceof TextSelection ||
      state.selection instanceof AllSelection
    )
  )
    reason = "请选择正文段落或标题";
  state.doc.nodesBetween(
    state.selection.from,
    state.selection.to,
    (node, pos) => {
      if (
        node.type.name === "table" ||
        node.type.name === "code_block" ||
        (node.isAtom && node.isBlock)
      ) {
        reason = "此选区包含不支持标题转换的内容";
        return false;
      }
      if (node.isTextblock) {
        if (!["paragraph", "heading"].includes(node.type.name))
          reason = "此内容不支持标题转换";
        const $pos = state.doc.resolve(pos + 1);
        for (let d = 1; d <= $pos.depth; d++) {
          if ($pos.node(d).type.name === "list_item") inList = true;
          if (["table_cell", "table_header"].includes($pos.node(d).type.name))
            reason = "表格内暂不支持标题转换";
        }
        blocks.push({ pos, node });
        return false;
      }
    },
  );
  if (!blocks.length) reason ||= "请选择正文段落或标题";
  const styles = new Set(
    blocks.map(({ node }) =>
      node.type.name === "heading" ? `H${node.attrs.level}` : "正文",
    ),
  );
  return {
    blocks,
    reason,
    inList,
    label: styles.size > 1 ? "混合" : ([...styles][0] ?? "正文"),
  };
}

/** Returns an atomic transaction, or null. No partial edits escape on failure. */
export function buildHeadingTransaction(
  state: EditorState,
  level: number | null,
): Transaction | null {
  if (level !== null && (!Number.isInteger(level) || level < 1 || level > 6))
    return null;
  const info = getHeadingSelection(state);
  if (info.reason) return null;
  const type = state.schema.nodes[level === null ? "paragraph" : "heading"];
  const itemType = state.schema.nodes.list_item;
  if (!type) return null;
  const tr = state.tr;
  const bookmark = state.selection.getBookmark();
  try {
    for (const block of [...info.blocks].reverse()) {
      let inside = tr.mapping.map(block.pos + 1);
      if (level !== null && itemType) {
        // Each lift removes one list level. A strict depth bound prevents an
        // unexpected schema/command combination from looping indefinitely.
        const depth = tr.doc.resolve(inside).depth;
        for (let step = 0; step < depth; step++) {
          const $pos = tr.doc.resolve(inside);
          let itemDepth = 0;
          for (let d = $pos.depth; d > 0; d--) {
            if ($pos.node(d).type === itemType) {
              itemDepth = d;
              break;
            }
          }
          if (!itemDepth) break;
          const list = $pos.node(itemDepth - 1);
          const index = $pos.index(itemDepth - 1);
          const nextItem = list.maybeChild(index + 1);
          const order = Number(list.attrs.order ?? 1) + index + 1;
          tr.setSelection(TextSelection.create(tr.doc, inside));
          const scratch = EditorState.create({
            schema: state.schema,
            doc: tr.doc,
            selection: tr.selection,
          });
          const mapStart = tr.mapping.maps.length;
          const lifted = liftListItem(itemType)(scratch, (result) => {
            result.steps.forEach((item) => tr.step(item));
          });
          if (!lifted || tr.mapping.maps.length === mapStart) return null;
          inside = tr.mapping.slice(mapStart).map(inside);
          // Splitting an ordered list must retain the original ordinal of
          // its untouched tail, not restart the tail at 1.
          if (nextItem && list.type.name === "ordered_list") {
            const tails: number[] = [];
            tr.doc.descendants((node, pos) => {
              if (node.type === list.type && node.firstChild === nextItem)
                tails.push(pos);
            });
            tails.forEach((pos) =>
              tr.setNodeMarkup(pos, undefined, {
                ...tr.doc.nodeAt(pos)!.attrs,
                order,
              }),
            );
          }
        }
      }
      const $pos = tr.doc.resolve(inside);
      const pos = $pos.before();
      tr.setBlockType(
        pos,
        pos + $pos.parent.nodeSize,
        type,
        level === null ? undefined : { level },
      );
      if (tr.doc.nodeAt(pos)?.type !== type) return null;
    }
    tr.doc.check();
    tr.setSelection(bookmark.map(tr.mapping).resolve(tr.doc));
    return tr.scrollIntoView();
  } catch {
    return null;
  }
}
