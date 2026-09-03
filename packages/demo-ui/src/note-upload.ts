import type { NoteUploadHandler } from "./RichTextEditor";

/** 默认上传实现：投递到 author-site 图床（同源 Cookie 鉴权）。 */
export const uploadNoteFile: NoteUploadHandler = async (file) => {
  if (!file.type.startsWith("image/")) {
    throw new Error("当前仅支持上传图片，视频/通用附件上传能力即将上线");
  }
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/images/upload", {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  if (!res.ok) {
    try {
      const body = await res.json();
      const message = body?.error?.message || `上传失败（HTTP ${res.status}）`;
      throw new Error(message);
    } catch {
      throw new Error(`上传失败（HTTP ${res.status}）`);
    }
  }
  const json = await res.json();
  const data = json?.data;
  if (!data?.url) throw new Error("上传成功但缺少资源地址");
  return { url: data.url, kind: "image" };
};
