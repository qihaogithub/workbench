import type {
  ThumbnailMeta,
  ThumbnailBlock,
  ThumbnailLayoutEvidence,
  RawElementSnapshot,
} from "./thumbnail-types";

function classifyElement(el: RawElementSnapshot): ThumbnailBlock["type"] {
  if (el.tag === "img" || el.attrs.src) return "image";
  if (el.tag === "button" || el.attrs.role === "button") return "button";
  if (el.tag === "input" || el.tag === "textarea" || el.tag === "select") return "input";

  if (el.text && parseFloat(el.style.fontSize) >= 14) return "text";

  if (hasCardLikeStyle(el)) return "card";

  return "unknown";
}

function hasCardLikeStyle(el: RawElementSnapshot): boolean {
  const radius = parseFloat(el.style.borderRadius) || 0;
  const hasRadius = radius >= 8;
  const hasShadow = !!(el.style.boxShadow && el.style.boxShadow !== "none");
  const hasSolidBackground = !!(
    el.style.backgroundColor &&
    el.style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
    el.style.backgroundColor !== "transparent"
  );
  const area = el.rect.width * el.rect.height;
  const isReasonableSize = area > 80 * 80;
  return isReasonableSize && (hasRadius || hasShadow || hasSolidBackground);
}

function computeScore(el: RawElementSnapshot): number {
  const area = el.rect.width * el.rect.height;
  const viewportArea = 375 * 812;
  const areaScore = Math.min(area / viewportArea, 1) * 0.35;

  let semanticScore = 0;
  const type = classifyElement(el);
  if (type === "text") semanticScore = 0.6;
  else if (type === "image") semanticScore = 0.9;
  else if (type === "button") semanticScore = 0.7;
  else if (type === "card") semanticScore = 0.5;
  else if (type === "input") semanticScore = 0.4;
  else semanticScore = 0.1;
  semanticScore *= 0.25;

  let textScore = 0;
  if (el.text && el.text.trim().length > 0) {
    const len = el.text.trim().length;
    textScore = Math.min(len / 100, 1) * 0.15;
  }

  let centerScore = 0;
  const cx = el.rect.x + el.rect.width / 2;
  const cy = el.rect.y + el.rect.height / 2;
  const distFromCenter = Math.sqrt(
    Math.pow(cx / 375 - 0.5, 2) + Math.pow(cy / 812 - 0.5, 2),
  );
  centerScore = Math.max(0, 1 - distFromCenter * 2) * 0.15;

  let visualStyleScore = 0;
  if (hasCardLikeStyle(el)) visualStyleScore += 0.5;
  if (el.style.boxShadow && el.style.boxShadow !== "none") visualStyleScore += 0.3;
  if (el.style.backgroundImage !== "none") visualStyleScore += 0.2;
  visualStyleScore = Math.min(visualStyleScore, 1) * 0.1;

  return areaScore + semanticScore + textScore + centerScore + visualStyleScore;
}

function isBackgroundElement(el: RawElementSnapshot, viewport: { width: number; height: number }): boolean {
  const widthRatio = el.rect.width / viewport.width;
  const heightRatio = el.rect.height / viewport.height;
  if (widthRatio > 0.8 && heightRatio > 0.8) return true;

  if (el.rect.x <= 0 && el.rect.y <= 0 &&
      el.rect.width >= viewport.width * 0.9 &&
      el.rect.height >= viewport.height * 0.9) return true;

  const bg = el.style.backgroundColor;
  if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && widthRatio > 0.9) return true;

  return false;
}

function extractTheme(evidence: ThumbnailLayoutEvidence): ThumbnailMeta["theme"] {
  const theme: ThumbnailMeta["theme"] = {};

  for (const el of evidence.elements) {
    if (isBackgroundElement(el, evidence.viewport)) {
      const bg = el.style.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        theme.backgroundColor = bg;
      }
      break;
    }
  }

  for (const el of evidence.elements) {
    if (el.tag === "button" || el.attrs.role === "button") {
      const bg = el.style.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        theme.primaryColor = bg;
        break;
      }
    }
  }

  return theme;
}

function extractPageType(evidence: ThumbnailLayoutEvidence): { type: ThumbnailMeta["page"]["type"]; title?: string } {
  const textElements = evidence.elements
    .filter((e) => e.text && e.text.trim().length > 0)
    .sort((a, b) => {
      const scoreA = computeScore(a);
      const scoreB = computeScore(b);
      return scoreB - scoreA;
    });

  let title: string | undefined;
  if (textElements.length > 0) {
    const candidate = textElements[0];
    if (parseFloat(candidate.style.fontSize) >= 18) {
      title = candidate.text?.trim();
    }
  }

  const hasFormInputs = evidence.elements.some(
    (e) => e.tag === "input" || e.tag === "textarea" || e.tag === "select" || e.attrs.role === "radiogroup",
  );

  if (hasFormInputs) return { type: "form", title };

  const hasManyButtons = evidence.elements.filter(
    (e) => e.tag === "button" || e.attrs.role === "button",
  ).length >= 2;

  if (hasManyButtons) return { type: "question", title };

  return { type: "custom", title };
}

function generateBlockId(prefix: string, index: number): string {
  return `${prefix}-${index}-${Date.now().toString(36)}`;
}

export function generateThumbnailMeta(evidence: ThumbnailLayoutEvidence): ThumbnailMeta {
  const viewport = evidence.viewport;
  const elements = [...evidence.elements];

  const backgroundEls = elements.filter((el) => isBackgroundElement(el, viewport));
  const nonBackground = elements.filter((el) => !isBackgroundElement(el, viewport));

  const scored = nonBackground.map((el) => ({ el, score: computeScore(el) }));
  scored.sort((a, b) => b.score - a.score);

  const maxBlocks = 20;
  const minBlocks = 5;
  const topN = Math.min(scored.length, maxBlocks);
  const selected = scored.slice(0, Math.max(topN, minBlocks));

  const blocks: ThumbnailBlock[] = [];

  for (const bg of backgroundEls.slice(0, 1)) {
    blocks.push({
      id: generateBlockId("bg", 0),
      type: "background",
      rect: { x: bg.rect.x, y: bg.rect.y, width: bg.rect.width, height: bg.rect.height },
      style: {
        backgroundColor: bg.style.backgroundColor !== "rgba(0, 0, 0, 0)" ? bg.style.backgroundColor : undefined,
        opacity: Number(bg.style.opacity),
      },
    });
  }

  for (let i = 0; i < selected.length; i++) {
    const { el } = selected[i];
    const blockType = classifyElement(el);

    blocks.push({
      id: generateBlockId(blockType, i),
      type: blockType,
      role: el.attrs.role ?? undefined,
      rect: { x: el.rect.x, y: el.rect.y, width: el.rect.width, height: el.rect.height },
      style: {
        backgroundColor:
          el.style.backgroundColor !== "rgba(0, 0, 0, 0)" ? el.style.backgroundColor : undefined,
        color: el.style.color !== "rgba(0, 0, 0, 0)" ? el.style.color : undefined,
        radius: parseFloat(el.style.borderRadius) || undefined,
        opacity: Number(el.style.opacity),
        emphasis: selected[i].score > 0.6 ? "high" : selected[i].score > 0.3 ? "medium" : "low",
      },
      contentHint: el.text?.trim().slice(0, 40) || undefined,
    });
  }

  const confidence = blocks.length >= minBlocks ? 0.8 : Math.max(0.2, blocks.length / minBlocks * 0.8);

  const page = extractPageType(evidence);
  const theme = extractTheme(evidence);

  return {
    version: 1,
    confidence: Math.round(confidence * 100) / 100,
    viewport,
    page,
    theme,
    blocks,
  };
}
