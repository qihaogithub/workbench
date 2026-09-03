interface DemoProps {
  title: string;
  subtitle: string;
  showBanner: boolean;
  fontSize: number;
  gap: number;
  bgColor: string;
  textColor: string;
  layout: string;
  tags: string[];
  logo: string;
  gallery: string[];
  description: string;
  region: string[];
  blocks: Array<{ type: string; content?: string; pic?: string; caption?: string }>;
}

export default function Page(props: DemoProps) {
  const {
    title,
    subtitle,
    showBanner,
    fontSize,
    gap,
    bgColor,
    textColor,
    layout,
    tags,
    logo,
    gallery,
    description,
    region,
    blocks,
  } = props;
  const { __positions } = props as unknown as Record<string, unknown>;
  const pos = (__positions as Record<string, { x: number; y: number }>) || {};
  const safeTags = Array.isArray(tags) ? tags : [];
  const safeGallery = Array.isArray(gallery) ? gallery : [];
  const safeRegion = Array.isArray(region) ? region : [];
  const safeBlocks = Array.isArray(blocks) ? blocks : [];

  return (
    <div
      className="min-h-screen px-4 py-8 font-sans transition-colors"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div
        className="max-w-md mx-auto"
        style={{ display: 'flex', flexDirection: 'column', gap: `${gap}px` }}
      >
        {showBanner && (
          <div className="rounded-2xl bg-white/10 p-6 shadow-sm">
            <div className="flex items-center gap-4">
              {logo && (
                <img
                  src={logo}
                  alt="Logo"
                  className="w-14 h-14 rounded-xl object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="font-bold truncate" style={{ fontSize: `${fontSize}px` }}>
                  {title}
                </h1>
                <p className="text-sm opacity-60 mt-1 line-clamp-2">{subtitle}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs bg-white/10">布局: {layout}</span>
          <span className="px-3 py-1 rounded-full text-xs bg-white/10">
            横幅: {showBanner ? '开' : '关'}
          </span>
          {safeTags.map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full text-xs bg-white/10">
              标签: {tag}
            </span>
          ))}
          {safeRegion.length > 0 && (
            <span className="px-3 py-1 rounded-full text-xs bg-white/10">
              地区: {safeRegion.join(' / ')}
            </span>
          )}
        </div>

        {description && (
          <div
            className="rounded-xl bg-white/10 p-4 shadow-sm text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}

        {safeGallery.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {safeGallery.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`画廊图片 ${i + 1}`}
                className="w-full h-28 rounded-xl object-cover"
              />
            ))}
          </div>
        )}

        <div className="space-y-3">
          {safeBlocks.map((block, i) => (
            <div key={i} className="rounded-xl bg-white/10 p-4 shadow-sm">
              {block.type === 'positionable' || block.type === 'positionableTop' ? (
                <div
                  className="relative rounded-lg overflow-hidden"
                  style={{
                    height: 400,
                    border: '1px dashed rgba(128,128,128,0.4)',
                    background:
                      'linear-gradient(135deg, rgba(128,128,128,0.12), rgba(128,128,128,0.04))',
                  }}
                >
                  {/* 上方 / 下方模块分区线 */}
                  <div
                    className="absolute left-0 right-0 top-0"
                    style={{
                      height: 200,
                      borderBottom: '1px dashed rgba(128,128,128,0.3)',
                      pointerEvents: 'none',
                    }}
                  />
                  <span className="absolute left-2 top-1 text-[10px] opacity-40">
                    上方模块 · 横幅 / 标题 / 倒计时 / 按钮
                  </span>
                  <span className="absolute left-2 bottom-1 text-[10px] opacity-40">
                    下方模块 · Logo / 标题 / 副标题 / 按钮 / 徽章
                  </span>

                  {/* 上方模块元素（top* 独立控制） */}
                  {(safeGallery[1] || logo) && (
                    <img
                      src={safeGallery[1] || logo}
                      alt="顶部横幅"
                      style={{
                        position: 'absolute',
                        left: pos.topBanner?.x ?? 10,
                        top: pos.topBanner?.y ?? 10,
                        width: 64,
                        height: 64,
                        borderRadius: 12,
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <h2
                    className="font-bold"
                    style={{
                      position: 'absolute',
                      left: pos.topTitle?.x ?? 90,
                      top: pos.topTitle?.y ?? 16,
                      fontSize: 18,
                      lineHeight: 1.2,
                    }}
                  >
                    限时抢购 · {title}
                  </h2>
                  <p
                    className="text-sm font-medium"
                    style={{
                      position: 'absolute',
                      left: pos.topCountdown?.x ?? 90,
                      top: pos.topCountdown?.y ?? 52,
                      color: '#e53935',
                    }}
                  >
                    ⏳ 距开奖 02:15:36
                  </p>
                  <button
                    className="px-4 py-1.5 rounded-full text-sm font-medium"
                    style={{
                      position: 'absolute',
                      left: pos.topBtn?.x ?? 90,
                      top: pos.topBtn?.y ?? 110,
                      backgroundColor: '#e53935',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    立即抢购
                  </button>

                  {/* 下方模块元素（独立控制） */}
                  {logo && (
                    <img
                      src={logo}
                      alt="Logo"
                      style={{
                        position: 'absolute',
                        left: pos.logo?.x ?? 20,
                        top: pos.logo?.y ?? 220,
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <h1
                    className="font-bold"
                    style={{
                      position: 'absolute',
                      left: pos.title?.x ?? 100,
                      top: pos.title?.y ?? 224,
                      fontSize: `${fontSize}px`,
                      lineHeight: 1.2,
                    }}
                  >
                    {title}
                  </h1>
                  <p
                    className="text-sm opacity-60"
                    style={{
                      position: 'absolute',
                      left: pos.subtitle?.x ?? 100,
                      top: pos.subtitle?.y ?? 264,
                    }}
                  >
                    {subtitle}
                  </p>
                  <button
                    className="px-4 py-1.5 rounded-full text-sm font-medium"
                    style={{
                      position: 'absolute',
                      left: pos.ctaButton?.x ?? 100,
                      top: pos.ctaButton?.y ?? 320,
                      backgroundColor: textColor,
                      color: bgColor,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    立即参与
                  </button>
                  {(safeGallery[0] || logo) && (
                    <img
                      src={safeGallery[0] || logo}
                      alt="活动徽章"
                      style={{
                        position: 'absolute',
                        left: pos.badge?.x ?? 290,
                        top: pos.badge?.y ?? 220,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <span
                    className="text-[10px] opacity-40"
                    style={{ position: 'absolute', right: 10, bottom: 8 }}
                  >
                    在右侧「元素定位」中拖拽调整位置
                  </span>
                </div>
              ) : block.type === 'text' ? (
                <p className="text-sm leading-relaxed">{block.content}</p>
              ) : (
                <div className="space-y-2">
                  {block.pic && (
                    <img src={block.pic} className="w-full rounded-lg object-cover" alt="模块配图" />
                  )}
                  {block.caption && (
                    <p className="text-xs opacity-50">{block.caption}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
