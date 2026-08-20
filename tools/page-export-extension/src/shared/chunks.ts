import { checksumChunk } from "./protocol.js";

export function acceptCaptureChunk(chunks: Map<number, string>, sequence: number, checksum: string, chunk: string): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error(`无效分块序号 ${sequence}`);
  if (checksumChunk(chunk) !== checksum) throw new Error(`分块 ${sequence} 校验失败`);
  const existing = chunks.get(sequence);
  if (existing !== undefined && existing !== chunk) throw new Error(`分块 ${sequence} 内容冲突`);
  chunks.set(sequence, chunk);
}

export function assembleCaptureChunks(chunks: Map<number, string>, totalChunks: number): string {
  if (chunks.size !== totalChunks) throw new Error(`捕获分块不完整：期望 ${totalChunks}，收到 ${chunks.size}`);
  return Array.from({ length: totalChunks }, (_, sequence) => {
    const chunk = chunks.get(sequence);
    if (chunk === undefined) throw new Error(`缺少分块 ${sequence}`);
    return chunk;
  }).join("");
}
