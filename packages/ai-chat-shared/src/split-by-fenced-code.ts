export type FencedBlock =
  | { type: "text"; content: string }
  | { type: "code"; language: string; code: string };

export function splitByFencedCode(markdown: string): FencedBlock[] {
  const lines = markdown.split("\n");
  const result: FencedBlock[] = [];

  let textBuf: string[] = [];
  let fenceBuf: string[] = [];
  let inFence = false;
  let fenceBackticks = 0;
  let fenceLang = "";

  for (const line of lines) {
    if (!inFence) {
      const match = line.match(/^ {0,3}(```+)([^`]*)$/);
      if (match) {
        inFence = true;
        fenceBackticks = match[1].length;
        fenceLang = match[2].trim();
        continue;
      }
      textBuf.push(line);
    } else {
      const match = line.match(/^ {0,3}(```+)\s*$/);
      if (match && match[1].length >= fenceBackticks) {
        if (textBuf.length > 0) {
          result.push({ type: "text", content: textBuf.join("\n") });
          textBuf = [];
        }
        result.push({
          type: "code",
          language: fenceLang,
          code: fenceBuf.join("\n"),
        });
        fenceBuf = [];
        inFence = false;
        continue;
      }
      fenceBuf.push(line);
    }
  }

  if (inFence) {
    textBuf.push("`".repeat(fenceBackticks) + fenceLang);
    textBuf.push(...fenceBuf);
  }

  if (textBuf.length > 0) {
    result.push({ type: "text", content: textBuf.join("\n") });
  }

  return result;
}
