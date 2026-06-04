export interface ThumbnailMeta {
  version: 1;

  confidence: number;

  viewport: {
    width: number;
    height: number;
  };

  page: {
    type:
      | "cover"
      | "question"
      | "exercise"
      | "reading"
      | "result"
      | "form"
      | "dashboard"
      | "custom";
    title?: string;
  };

  theme: {
    backgroundColor?: string;
    primaryColor?: string;
    secondaryColor?: string;
    mood?: "clean" | "cartoon" | "business" | "tech" | "soft" | "dark";
  };

  blocks: ThumbnailBlock[];
}

export interface ThumbnailBlock {
  id: string;

  type:
    | "background"
    | "text"
    | "image"
    | "button"
    | "card"
    | "input"
    | "options"
    | "list"
    | "media"
    | "decorative"
    | "unknown";

  role?: string;

  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  style?: {
    backgroundColor?: string;
    color?: string;
    radius?: number;
    opacity?: number;
    emphasis?: "low" | "medium" | "high";
  };

  contentHint?: string;
}

export interface ThumbnailLayoutEvidence {
  viewport: {
    width: number;
    height: number;
  };
  elements: RawElementSnapshot[];
}

export interface RawElementSnapshot {
  tag: string;
  text?: string;

  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  style: {
    display: string;
    visibility: string;
    opacity: string;
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontWeight: string;
    borderRadius: string;
    boxShadow: string;
    border: string;
    position: string;
    zIndex: string;
    backgroundImage: string;
  };

  attrs: {
    role?: string | null;
    ariaLabel?: string | null;
    src?: string;
    className?: string;
  };
}

export interface ThumbnailHashInput {
  codeHash: string;
  configHash: string;
  previewSize?: { width?: number; height?: number };
  generatorVersion: number;
}

export const THUMBNAIL_GENERATOR_VERSION = 1;
