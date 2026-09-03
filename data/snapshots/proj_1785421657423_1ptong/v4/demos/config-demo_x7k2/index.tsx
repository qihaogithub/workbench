interface DemoProps {
  title: string;
  subtitle: string;
  showBanner: boolean;
  bgColor: string;
  textColor: string;
  layout: string;
  logo: string;
  blocks: Array<{ type: string; content?: string; pic?: string; caption?: string }>;
}

export default function Page({
  title,
  subtitle,
  showBanner,
  bgColor,
  textColor,
  layout,
  logo,
  blocks,
}: DemoProps) {
  return (
    <div
      className="min-h-screen px-4 py-8 font-sans transition-colors"
      style={{ backgroundColor: bgColor, color: textColor }}
    >
      <div className="max-w-md mx-auto space-y-6">
        {showBanner && (
          <div className="rounded-2xl bg-white/10 p-6 text-center shadow-sm">
            {logo && (
              <img
                src={logo}
                alt="Logo"
                className="w-16 h-16 rounded-xl object-cover mx-auto mb-3"
              />
            )}
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-sm opacity-60 mt-1">{subtitle}</p>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs bg-white/10">布局: {layout}</span>
          <span className="px-3 py-1 rounded-full text-xs bg-white/10">
            横幅: {showBanner ? '开' : '关'}
          </span>
        </div>

        <div className={layout === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
          {blocks.map((block, i) => (
            <div key={i} className="rounded-xl bg-white/10 p-4 shadow-sm">
              {block.type === 'text' ? (
                <p className="text-sm leading-relaxed">{block.content}</p>
              ) : (
                <div className="space-y-2">
                  {block.pic && (
                    <img src={block.pic} className="w-full rounded-lg object-cover" />
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