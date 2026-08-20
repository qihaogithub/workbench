import type { TextPatch } from "@workbench/prototype-core";

export interface CollabTextLike {
  toString: () => string;
  delete: (index: number, length: number) => void;
  insert: (index: number, text: string) => void;
  doc?: { transact: (fn: () => void, origin?: unknown) => void } | null;
}

/**
 * 把源码级 patch 直接翻译成 Y.Text 区间操作。若协同文本已经变化则拒绝执行，
 * 由调用方基于最新源码重新生成命令，避免退回整文件覆盖。
 */
export function applyCollabTextPatches(
  ytext: CollabTextLike | null,
  before: string,
  after: string,
  patches: TextPatch[],
): boolean {
  if (!ytext) return true;
  if (ytext.toString() !== before) return false;
  const apply = () => {
    for (const patch of [...patches].sort((left, right) => right.start - left.start)) {
      const deleteLength = patch.end - patch.start;
      if (deleteLength > 0) ytext.delete(patch.start, deleteLength);
      if (patch.text) ytext.insert(patch.start, patch.text);
    }
  };
  if (ytext.doc) {
    ytext.doc.transact(apply, "prototype-visual-editor");
  } else {
    apply();
  }
  return ytext.toString() === after;
}
