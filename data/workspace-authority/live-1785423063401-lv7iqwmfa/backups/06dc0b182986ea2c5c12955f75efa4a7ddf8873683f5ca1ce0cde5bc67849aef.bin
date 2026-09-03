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

const TAG_LABELS: Record<string, string> = {
  hot: '热门',
  new: '新品',
  recommend: '推荐',
};

const REGION_LABELS: Record<string, string> = {
  beijing: '北京',
  chaoyang: '朝阳区',
  haidian: '海淀区',
  zhejiang: '浙江',
  hangzhou: '杭州',
  ningbo: '宁波',
  guangdong: '广东',
  guangzhou: '广州',
  shenzhen: '深圳',
};

const LAYOUT_LABELS: Record<string, string> = { grid: '网格', list: '列表' };

function rgba(hex: string, alpha: number): string {
  const h = (hex || '#333333').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(51,51,51,${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function Page(props: DemoProps) {
  const {
    title = '配置面板测试',
    subtitle = '',
    showBanner = true,
    fontSize = 24,
    gap = 16,
    bgColor = '#f5f5f5',
    textColor = '#333333',
    layout = 'grid',
    tags = [],
    logo = '',
    gallery = [],
    description = '',
    region = [],
    blocks = [],
  } = props;

  const { __positions } = props as unknown as Record<string, unknown>;
  const rawPositions =
    __positions ?? ((props as unknown as Record<string, unknown>).positions as unknown) ?? {};
  const pos = (rawPositions as Record<string, { x: number; y: number }>) || {};
  const hasPos = Boolean(pos.logo || pos.title || pos.subtitle || pos.ctaButton || pos.badge);
  // eslint-disable-next-line no-console
  console.log('[POS-DEBUG] __positions =', JSON.stringify(__positions));

  const safeTags = Array.isArray(tags) ? tags : [];
  const safeGallery = Array.isArray(gallery) ? gallery : [];
  const safeRegion = Array.isArray(region) ? region : [];
  const safeBlocks = Array.isArray(blocks) ? blocks : [];

  const fontPx = typeof fontSize === 'number' ? fontSize : 24;
  const gapPx = typeof gap === 'number' ? gap : 16;

  const softBg = rgba(textColor, 0.05);
  const softBorder = rgba(textColor, 0.1);
  const muted = rgba(textColor, 0.52);
  const faint = rgba(textColor, 0.38);

  const renderTag = (key: string) => (
    <span
      key={key}
      className="inline-flex items-center rounded border px-1.5 py-px font-mono text-[10px] leading-4"
      style={{
        color: rgba(textColor, 0.42),
        borderColor: rgba(textColor, 0.14),
        background: rgba(textColor, 0.04),
      }}
    >
      {key}
    </span>
  );

  const renderSectionHead = (label: string, keys: string[]) => (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: muted }}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1">{keys.map(renderTag)}</div>
    </div>
  );

  return (
    <div
      className="min-h-screen px-4 py-8 font-sans antialiased transition-colors duration-300"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col" style={{ gap: `${gapPx}px` }}>
        {/* 基础信息 */}
        {showBanner && (
          <section
            className="rounded-2xl border p-5 shadow-sm"
            style={{ background: softBg, borderColor: softBorder }}
          >
            {renderSectionHead('基础信息', ['title', 'subtitle', 'logo', 'showBanner'])}
            <div className="flex items-center gap-4">
              {logo && (
                <img
                  src={logo}
                  alt="Logo"
                  className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                  style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                />
              )}
              <div className="min-w-0">
                <h1
                  className="truncate font-bold leading-tight"
                  style={{ fontSize: `${fontPx}px` }}
                >
                  {title}
                </h1>
                <p className="mt-1 line-clamp-2 text-sm" style={{ color: muted }}>
                  {subtitle}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 数值配置 */}
        <section
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: softBg, borderColor: softBorder }}
        >
          {renderSectionHead('数值配置', ['fontSize', 'gap'])}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl px-3 py-3" style={{ background: rgba(textColor, 0.06) }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: faint }}>
                标题字号
              </p>
              <p className="mt-1 text-lg font-semibold">
                {fontPx}
                <span className="ml-0.5 text-xs font-normal" style={{ color: faint }}>
                  px
                </span>
              </p>
            </div>
            <div className="rounded-xl px-3 py-3" style={{ background: rgba(textColor, 0.06) }}>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: faint }}>
                模块间距
              </p>
              <p className="mt-1 text-lg font-semibold">
                {gapPx}
                <span className="ml-0.5 text-xs font-normal" style={{ color: faint }}>
                  px
                </span>
              </p>
            </div>
          </div>
        </section>

        {/* 样式配置 */}
        <section
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: softBg, borderColor: softBorder }}
        >
          {renderSectionHead('样式配置', ['layout', 'tags'])}
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: rgba(textColor, 0.08) }}
            >
              布局 · {LAYOUT_LABELS[layout] ?? layout}
            </span>
            {safeTags.map((t) => (
              <span
                key={t}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{ background: rgba(textColor, 0.08) }}
              >
                {TAG_LABELS[t] ?? t}
              </span>
            ))}
            {safeTags.length === 0 && (
              <span className="text-xs" style={{ color: faint }}>
                （未选择标签）
              </span>
            )}
          </div>
        </section>

        {/* 富文本与地区 */}
        <section
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: softBg, borderColor: softBorder }}
        >
          {renderSectionHead('富文本与地区', ['description', 'region'])}
          <div
            className="text-sm leading-relaxed"
            style={{ color: textColor }}
            dangerouslySetInnerHTML={{
              __html: description || '<span style="opacity:.4">（暂无富文本内容）</span>',
            }}
          />
          {safeRegion.length > 0 && (
            <div className="mt-3">
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                style={{ background: rgba(textColor, 0.08) }}
              >
                地区 · {safeRegion.map((v) => REGION_LABELS[v] ?? v).join(' / ')}
              </span>
            </div>
          )}
        </section>

        {/* 素材 */}
        <section
          className="rounded-2xl border p-5 shadow-sm"
          style={{ background: softBg, borderColor: softBorder }}
        >
          {renderSectionHead('素材', ['gallery'])}
          {safeGallery.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {safeGallery.map((src, i) => (
                <figure
                  key={i}
                  className="overflow-hidden rounded-xl border"
                  style={{ borderColor: softBorder, background: rgba(textColor, 0.04) }}
                >
                  <img src={src} alt={`画廊图片 ${i + 1}`} className="h-28 w-full object-cover" />
                </figure>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: faint }}>
              （暂无画廊图片）
            </p>
          )}
        </section>

        {/* 模块列表 */}
        <section className="space-y-3">
          <div className="px-1">{renderSectionHead('模块列表', ['blocks'])}</div>
          {safeBlocks.length === 0 && (
            <div
              className="rounded-2xl border p-5 text-center text-xs"
              style={{ background: softBg, borderColor: softBorder, color: faint }}
            >
              （暂无内容模块，可在右侧添加）
            </div>
          )}
          {safeBlocks.map((block, i) =>
            block.type === 'positionable' ? (
              <div key={i}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs font-semibold" style={{ color: muted }}>
                    元素定位模块
                  </span>
                  {renderTag('__positions')}
                </div>
                <div
                  className="relative overflow-hidden rounded-xl"
                  style={{
                    width: 375,
                    height: 200,
                    marginLeft: -16,
                    marginRight: -16,
                    border: '1px dashed rgba(128,128,128,0.4)',
                    background:
                      'linear-gradient(135deg, rgba(128,128,128,0.12), rgba(128,128,128,0.04))',
                  }}
                >
                  {logo && (
                    <img
                      src={logo}
                      alt="Logo"
                      style={{
                        position: 'absolute',
                        left: pos.logo?.x ?? 20,
                        top: pos.logo?.y ?? 20,
                        width: 56,
                        height: 56,
                        borderRadius: 12,
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <h2
                    className="font-bold"
                    style={{
                      position: 'absolute',
                      left: pos.title?.x ?? 100,
                      top: pos.title?.y ?? 24,
                      fontSize: `${fontPx}px`,
                      lineHeight: 1.2,
                    }}
                  >
                    {title}
                  </h2>
                  <p
                    className="text-sm"
                    style={{
                      position: 'absolute',
                      left: pos.subtitle?.x ?? 100,
                      top: pos.subtitle?.y ?? 64,
                      opacity: 0.6,
                    }}
                  >
                    {subtitle}
                  </p>
                  <button
                    className="rounded-full px-4 py-1.5 text-sm font-medium"
                    style={{
                      position: 'absolute',
                      left: pos.ctaButton?.x ?? 100,
                      top: pos.ctaButton?.y ?? 120,
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
                        top: pos.badge?.y ?? 20,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  )}
                  <span
                    className="text-[10px]"
                    style={{ position: 'absolute', right: 10, bottom: 8, opacity: 0.4 }}
                  >
                    {hasPos
                      ? `logo(${pos.logo?.x ?? 20},${pos.logo?.y ?? 20}) · title(${pos.title?.x ?? 100},${pos.title?.y ?? 24}) · badge(${pos.badge?.x ?? 290},${pos.badge?.y ?? 20})`
                      : '未收到位置数据 · 请在右侧「元素定位」中拖拽'}
                  </span>
                </div>
              </div>
            ) : (
              <div
                key={i}
                className="rounded-2xl border p-5 shadow-sm"
                style={{ background: softBg, borderColor: softBorder }}
              >
                {block.type === 'text' ? (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: muted }}>
                        文本模块
                      </span>
                      {renderTag('blocks[].content')}
                    </div>
                    <p className="text-sm leading-relaxed">{block.content || '（空文本）'}</p>
                  </>
                ) : (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold" style={{ color: muted }}>
                        图片模块
                      </span>
                      {renderTag('blocks[].pic')}
                    </div>
                    {block.pic && (
                      <img
                        src={block.pic}
                        alt="模块配图"
                        className="w-full rounded-xl object-cover"
                      />
                    )}
                    {block.caption && (
                      <p className="mt-2 text-xs" style={{ color: muted }}>
                        {block.caption}
                      </p>
                    )}
                  </>
                )}
              </div>
            )
          )}
        </section>

        <p className="pb-2 pt-1 text-center text-xs" style={{ color: faint }}>
          以上内容均由右侧「配置面板」实时驱动
        </p>
      </div>
    </div>
  );
}
