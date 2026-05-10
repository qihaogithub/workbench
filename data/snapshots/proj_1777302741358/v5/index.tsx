import React from 'react';

interface GalleryItem {
  url: string;
  alt?: string;
}

interface DemoProps {
  title: string;
  subtitle?: string;
  textContent?: string;
  richtextContent?: string;
  themeColor?: string;
  bgColor?: string;
  fontSize?: number;
  borderRadius?: number;
  opacity?: number;
  itemCount?: number;
  showHeader?: boolean;
  showFooter?: boolean;
  enableAnimation?: boolean;
  layout?: 'horizontal' | 'vertical' | 'grid';
  cardStyle?: 'flat' | 'elevated' | 'outlined';
  banner?: string;
  avatar?: string;
  gallery?: GalleryItem[];
  __order?: string[];
}

export default function Demo({
  title = '配置面板表单控件合集',
  subtitle = '',
  textContent = '',
  richtextContent = '',
  themeColor = '#3b82f6',
  bgColor = '#fafafa',
  fontSize = 16,
  borderRadius = 12,
  opacity = 1,
  itemCount = 3,
  showHeader = true,
  showFooter = false,
  enableAnimation = true,
  layout = 'grid',
  cardStyle = 'elevated',
  banner: bannerUrl,
  avatar,
  gallery = [],
  __order,
}: DemoProps) {
  const transitionClass = enableAnimation ? 'transition-all duration-300 ease-out' : '';

  const cardShadow =
    cardStyle === 'elevated'
      ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.05)]'
      : cardStyle === 'outlined'
        ? 'bg-white border border-gray-200/80'
        : 'bg-gray-50/80';

  const layoutClass =
    layout === 'grid'
      ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
      : layout === 'vertical'
        ? 'flex flex-col gap-5'
        : 'flex flex-row gap-5 flex-wrap';

  const order = __order || ['header', 'banner', 'content', 'cards', 'gallery', 'footer'];

  const sections: Record<string, React.ReactNode> = {
    header: showHeader ? (
      <div className="mb-12">
        <div className="flex items-start gap-5">
          {avatar && (
            <div className="flex-shrink-0">
              <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gray-100 ring-1 ring-gray-200/50">
                <img
                  src={avatar}
                  alt="avatar"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
          <div className="flex-1 pt-1">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2 text-base text-gray-500 leading-relaxed">
                {subtitle}
              </p>
            )}
            <div className="mt-4 h-px w-16" style={{ backgroundColor: `${themeColor}30` }} />
          </div>
        </div>
      </div>
    ) : null,

    banner: bannerUrl ? (
      <div className="mb-12">
        <div
          className="overflow-hidden bg-gray-100"
          style={{ borderRadius }}
        >
          <img
            src={bannerUrl}
            alt="banner"
            className={`w-full h-64 object-cover ${transitionClass} hover:scale-[1.02]`}
          />
        </div>
      </div>
    ) : null,

    content: (textContent || richtextContent) ? (
      <div
        className={`p-8 mb-10 ${cardShadow} ${transitionClass}`}
        style={{ borderRadius }}
      >
        {textContent && (
          <div className="mb-6 last:mb-0">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
              文本内容
            </h3>
            <p
              className="text-gray-700 leading-relaxed whitespace-pre-wrap"
              style={{ fontSize }}
            >
              {textContent}
            </p>
          </div>
        )}
        {richtextContent && (
          <div className="last:mb-0">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-3">
              富文本内容
            </h3>
            <div
              className="text-gray-700 leading-relaxed whitespace-pre-wrap"
              style={{ fontSize }}
            >
              {richtextContent}
            </div>
          </div>
        )}
      </div>
    ) : null,

    cards: (
      <div className="mb-12">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-6">
          控件配置预览
        </h3>
        <div className={layoutClass}>
          {Array.from({ length: itemCount }, (_, i) => (
            <div
              key={i}
              className={`p-6 ${cardShadow} ${transitionClass} group cursor-default`}
              style={{ borderRadius }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                  style={{ backgroundColor: themeColor }}
                >
                  {i + 1}
                </div>
                <span className="text-gray-900 font-medium">
                  卡片 {i + 1}
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-1.5 bg-gray-100 rounded-full w-full" />
                <div className="h-1.5 bg-gray-100 rounded-full w-4/5" />
                <div className="h-1.5 bg-gray-100 rounded-full w-3/5" />
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  {layout === 'grid' ? '网格' : layout === 'vertical' ? '垂直' : '水平'}布局 · {cardStyle === 'elevated' ? '悬浮' : cardStyle === 'outlined' ? '描边' : '扁平'}样式
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    ),

    gallery: gallery.length > 0 ? (
      <div className="mb-12">
        <h3 className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-6">
          图片画廊
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {gallery.map((item, index) => (
            <div
              key={index}
              className={`overflow-hidden bg-gray-100 ${cardShadow} ${transitionClass}`}
              style={{ borderRadius }}
            >
              <div className="aspect-square">
                <img
                  src={item.url}
                  alt={item.alt || `gallery-${index}`}
                  className={`w-full h-full object-cover ${transitionClass} hover:scale-105`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : null,

    footer: showFooter ? (
      <div className="mt-16 pt-8 border-t border-gray-200/60">
        <div className="flex items-center justify-center gap-6 text-sm text-gray-400">
          <span>{fontSize}px 字体</span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span>{borderRadius}px 圆角</span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span>透明度 {Math.round(opacity * 100)}%</span>
          {enableAnimation && (
            <>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>动画已开启</span>
            </>
          )}
        </div>
      </div>
    ) : null,
  };

  return (
    <div
      style={{ backgroundColor: bgColor, opacity }}
      className={`min-h-screen ${transitionClass}`}
    >
      <div className="max-w-5xl mx-auto px-6 py-16">
        {order.map((key) => sections[key])}
      </div>
    </div>
  );
}
