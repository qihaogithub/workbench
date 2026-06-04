import React from "react";
import type { ThumbnailBlock } from "./thumbnail-types";

const DEFAULT_RADIUS: Record<string, number> = {
  button: 6,
  card: 8,
  input: 4,
  image: 4,
};

function getDefaultRadius(type: ThumbnailBlock["type"]): number | undefined {
  return DEFAULT_RADIUS[type];
}

function getBlockBackground(block: ThumbnailBlock): string | undefined {
  if (block.style?.backgroundColor) return block.style.backgroundColor;

  switch (block.type) {
    case "text":
      return "rgba(0,0,0,0.08)";
    case "button":
      return "rgba(59,130,246,0.3)";
    case "card":
      return "rgba(255,255,255,0.6)";
    case "input":
      return "rgba(255,255,255,0.8)";
    case "image":
      return "rgba(0,0,0,0.05)";
    case "background":
      return undefined;
    default:
      return "rgba(0,0,0,0.04)";
  }
}

function TextBlock({
  style,
  block,
}: {
  style: React.CSSProperties;
  block: ThumbnailBlock;
}) {
  const fontSize = Math.min(block.rect.height * 0.35, 12);
  const hasContent = !!(block.contentHint && block.contentHint.trim());

  return (
    <div
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        padding: "1px 3px",
        overflow: "hidden",
        background: "none",
      }}
    >
      {hasContent ? (
        <span
          style={{
            fontSize,
            lineHeight: 1.2,
            color: block.style?.color || "rgba(0,0,0,0.6)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {block.contentHint}
        </span>
      ) : (
        <div
          style={{
            width: "100%",
            height: fontSize * 1.2,
            background: block.style?.backgroundColor || "rgba(0,0,0,0.1)",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );
}

function ImageBlock({
  style,
  block,
}: {
  style: React.CSSProperties;
  block: ThumbnailBlock;
}) {
  return (
    <div
      style={{
        ...style,
        background: "rgba(0,0,0,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={Math.min(24, block.rect.width * 0.3)}
        height={Math.min(24, block.rect.height * 0.3)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="1.5"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
    </div>
  );
}

function ButtonBlock({
  style,
  block,
}: {
  style: React.CSSProperties;
  block: ThumbnailBlock;
}) {
  const hasText = !!(block.contentHint && block.contentHint.trim());

  return (
    <div
      style={{
        ...style,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "70%",
          height: "60%",
          background: block.style?.backgroundColor || "rgba(59,130,246,0.5)",
          borderRadius: style.borderRadius ?? getDefaultRadius("button"),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {hasText && (
          <span
            style={{
              fontSize: Math.min(block.rect.height * 0.3, 10),
              color: "#fff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              padding: "0 4px",
            }}
          >
            {block.contentHint}
          </span>
        )}
      </div>
    </div>
  );
}

function CardBlock({
  style,
  block,
}: {
  style: React.CSSProperties;
  block: ThumbnailBlock;
}) {
  const hasText = !!(block.contentHint && block.contentHint.trim());

  return (
    <div
      style={{
        ...style,
        background: block.style?.backgroundColor || "rgba(255,255,255,0.5)",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {hasText && block.rect.height > 40 && (
        <div
          style={{
            padding: "3px 4px",
            fontSize: Math.min(block.rect.height * 0.22, 10),
            color: block.style?.color || "rgba(0,0,0,0.5)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {block.contentHint}
        </div>
      )}
    </div>
  );
}

function InputBlock({
  style,
  block,
}: {
  style: React.CSSProperties;
  block: ThumbnailBlock;
}) {
  const hasText = !!(block.contentHint && block.contentHint.trim());

  return (
    <div
      style={{
        ...style,
        background: block.style?.backgroundColor || "rgba(255,255,255,0.7)",
        border: "1px solid rgba(0,0,0,0.12)",
        borderRadius: style.borderRadius ?? getDefaultRadius("input"),
        padding: "2px 5px",
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {hasText ? (
        <span
          style={{
            fontSize: Math.min(block.rect.height * 0.38, 10),
            color: "rgba(0,0,0,0.4)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {block.contentHint}
        </span>
      ) : (
        <div
          style={{
            width: "60%",
            height: "35%",
            background: "rgba(0,0,0,0.06)",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );
}

function OptionsBlock({
  style,
  block,
}: {
  style: React.CSSProperties;
  block: ThumbnailBlock;
}) {
  const optionCount = Math.min(4, Math.floor(block.rect.height / 20));
  return (
    <div
      style={{
        ...style,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        padding: 3,
        background: "none",
      }}
    >
      {Array.from({ length: optionCount }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            background: "rgba(0,0,0,0.06)",
            borderRadius: 3,
          }}
        />
      ))}
    </div>
  );
}

export function ThumbnailBlockView({ block }: { block: ThumbnailBlock }) {
  const style: React.CSSProperties = {
    position: "absolute",
    left: block.rect.x,
    top: block.rect.y,
    width: block.rect.width,
    height: block.rect.height,
    borderRadius: block.style?.radius ?? getDefaultRadius(block.type) ?? 0,
    background: getBlockBackground(block),
    opacity: block.style?.opacity ?? 1,
  };

  switch (block.type) {
    case "text":
      return <TextBlock style={style} block={block} />;
    case "image":
      return <ImageBlock style={style} block={block} />;
    case "button":
      return <ButtonBlock style={style} block={block} />;
    case "card":
      return <CardBlock style={style} block={block} />;
    case "input":
      return <InputBlock style={style} block={block} />;
    case "options":
      return <OptionsBlock style={style} block={block} />;
    case "background":
      return <div style={{ ...style, zIndex: -1 }} />;
    default:
      return <div style={style} />;
  }
}
