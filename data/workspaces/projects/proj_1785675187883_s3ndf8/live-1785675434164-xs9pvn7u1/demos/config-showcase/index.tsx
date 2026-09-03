interface DemoProps {
  title: string;
  subtitle: string;
  showHeader: boolean;
  count: number;
  gap: number;
  bgColor: string;
  textColor: string;
  accentColor: string;
  fontSize: number;
  fontWeight: string;
  layout: string;
  tags: string[];
  region: string[];
  logo: string;
  banner: string;
  gallery: string[];
  description: string;
  note: string;
  bannerPosition: { x: number; y: number };
  badgePosition: { x: number; y: number };
  blocks: Array<{
    type: string;
    content?: string;
    pic?: string;
    caption?: string;
    label?: string;
    position?: { x: number; y: number };
  }>;
}

export default function Page(props: DemoProps) {
  const {
    title,
    subtitle,
    showHeader,
    count,
    gap,
    bgColor,
    textColor,
    accentColor,
    fontSize,
    fontWeight,
    layout,
    tags,
    region,
    logo,
    banner,
    gallery,
    description,
    note,
    bannerPosition,
    badgePosition,
    blocks,
  } = props;

  const bp = bannerPosition || { x: 20, y: 16 };
  const badPos = badgePosition || { x: 280, y: 10 };
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeGallery = Array.isArray(gallery) ? gallery : [];
  const safeRegion = Array.isArray(region) ? region : [];
  const safeBlocks = Array.isArray(blocks) ? blocks : [];

  const gridStyle = layout === "grid"
    ? { display: "grid", gridTemplateColumns: `repeat(${Math.min(count, 3)}, 1fr)` }
    : layout === "card"
      ? { display: "flex", flexDirection: "column" as const }
      : { display: "flex", flexDirection: "column" as const };

  return (
    <div
      className="min-h-screen font-sans transition-colors px-3 py-4"
      style={{ backgroundColor: bgColor, color: textColor, fontSize }}
    >
      <div className="max-w-md mx-auto" style={{ display: "flex", flexDirection: "column", gap: `${gap}px` }}>

        {/* Header with positioned banner */}
        {showHeader && (
          <div style={{ position: "relative", height: 220, borderRadius: 16, overflow: "hidden", background: "linear-gradient(135deg, rgba(79,70,229,0.15), rgba(79,70,229,0.05))" }}>
            {banner && (
              <img
                src={banner}
                data-pos-key="bannerImage"
                alt="横幅"
                style={{ position: "absolute", left: bp.x, top: bp.y, width: 180, height: 120, borderRadius: 12, objectFit: "cover" }}
              />
            )}
            {/* Positioned badge */}
            <span
              data-pos-key="badgeImage"
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{
                position: "absolute",
                left: badPos.x,
                top: badPos.y,
                backgroundColor: accentColor,
                color: "#fff",
              }}
            >
              {safeTags[0] || "热门"}
            </span>
          </div>
        )}

        {/* Title area */}
        <div>
          <h1 style={{ fontSize: Math.round(fontSize * 1.5), fontWeight }}>{title}</h1>
          <p style={{ opacity: 0.6, marginTop: 4 }}>{subtitle}</p>
        </div>

        {/* Info badges */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: accentColor + "20", color: accentColor }}>
            布局: {layout === "grid" ? "网格" : layout === "card" ? "卡片" : "列表"}
          </span>
          <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: accentColor + "20", color: accentColor }}>
            数量: {count}
          </span>
          {safeTags.map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: accentColor + "20", color: accentColor }}>
              {tag}
            </span>
          ))}
          {safeRegion.length > 0 && (
            <span className="px-3 py-1 rounded-full text-xs" style={{ backgroundColor: accentColor + "20", color: accentColor }}>
              地区: {safeRegion.join(" / ")}
            </span>
          )}
        </div>

        {/* Logo */}
        {logo && (
          <div style={{ textAlign: "center" }}>
            <img src={logo} alt="Logo" style={{ height: 48, borderRadius: 8 }} />
          </div>
        )}

        {/* Rich text description */}
        {description && (
          <div
            className="leading-relaxed"
            style={{ backgroundColor: accentColor + "0a", padding: 16, borderRadius: 12, lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        {/* Gallery */}
        {safeGallery.length > 0 && (
          <div style={gridStyle as any}>
            {safeGallery.slice(0, count).map((src, i) => (
              <img key={i} src={src} alt={`图${i + 1}`}
                style={{ width: "100%", height: 120, borderRadius: 12, objectFit: "cover" }}
              />
            ))}
          </div>
        )}

        {/* Blocks */}
        {safeBlocks.map((block, i) => (
          <div key={i} style={{ borderRadius: 12, padding: 16, backgroundColor: accentColor + "0a" }}>
            {block.type === "text" ? (
              <p style={{ lineHeight: 1.6 }}>{block.content}</p>
            ) : block.type === "image" ? (
              <div>
                {block.pic && <img src={block.pic} alt="配图" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />}
                {block.caption && <p style={{ fontSize: 12, opacity: 0.5 }}>{block.caption}</p>}
              </div>
            ) : block.type === "positionBlock" ? (
              <div style={{ position: "relative", height: 120, borderRadius: 8, border: "1px dashed rgba(128,128,128,0.3)", background: "rgba(128,128,128,0.05)" }}>
                <button
                  data-pos-key="floatingBtn"
                  style={{
                    position: "absolute",
                    left: block.position?.x ?? 20,
                    top: block.position?.y ?? 60,
                    backgroundColor: accentColor,
                    color: "#fff",
                    border: "none",
                    borderRadius: 999,
                    padding: "8px 20px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {block.label || "按钮"}
                </button>
                <span style={{ position: "absolute", right: 10, bottom: 6, fontSize: 10, opacity: 0.3 }}>
                  拖拽定位模块
                </span>
              </div>
            ) : null}
          </div>
        ))}

        {/* Note footer */}
        {note && (
          <p style={{ fontSize: 12, opacity: 0.4, textAlign: "center", padding: "16px 0" }}>
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

