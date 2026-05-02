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
}

export default function Demo({
  title,
  subtitle = '',
  textContent = '',
  richtextContent = '',
  themeColor = '#3b82f6',
  bgColor = '#ffffff',
  fontSize = 16,
  borderRadius = 8,
  opacity = 1,
  itemCount = 3,
  showHeader = true,
  showFooter = false,
  enableAnimation = true,
  layout = 'horizontal',
  cardStyle = 'elevated',
  banner,
  avatar,
  gallery = [],
}: DemoProps) {
  const cardClass =
    cardStyle === 'elevated'
      ? 'shadow-lg'
      : cardStyle === 'outlined'
        ? 'border-2 border-gray-300'
        : '';

  const layoutClass =
    layout === 'grid'
      ? 'grid grid-cols-3 gap-4'
      : layout === 'vertical'
        ? 'flex flex-col gap-4'
        : 'flex flex-row gap-4 flex-wrap';

  const transitionStyle = enableAnimation
    ? { transition: 'all 0.3s ease' }
    : {};

  return (
    <div
      style={{ backgroundColor: bgColor, fontSize, opacity, borderRadius, ...transitionStyle }}
      className="p-8 max-w-4xl mx-auto min-h-screen"
    >
      {showHeader && (
        <div
          style={{ backgroundColor: themeColor, borderRadius }}
          className="p-6 mb-6 text-white"
        >
          <div className="flex items-center gap-4">
            {avatar && (
              <img
                src={avatar}
                alt="avatar"
                className="w-16 h-16 rounded-full object-cover border-2 border-white/50"
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              {subtitle && <p className="text-white/80 mt-1">{subtitle}</p>}
            </div>
          </div>
        </div>
      )}

      {banner && (
        <img
          src={banner}
          alt="banner"
          className="w-full h-48 object-cover mb-6"
          style={{ borderRadius }}
        />
      )}

      {(textContent || richtextContent) && (
        <div
          className={`p-6 mb-6 bg-white ${cardClass}`}
          style={{ borderRadius }}
        >
          {textContent && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">长文本内容</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{textContent}</p>
            </div>
          )}
          {richtextContent && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">富文本内容</h3>
              <div className="text-gray-700 whitespace-pre-wrap">{richtextContent}</div>
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">
          控件配置预览
        </h3>
        <div className={layoutClass}>
          {Array.from({ length: itemCount }, (_, i) => (
            <div
              key={i}
              className={`p-4 bg-white ${cardClass}`}
              style={{ borderRadius, ...transitionStyle }}
            >
              <div
                className="w-full h-2 mb-3"
                style={{ backgroundColor: themeColor, borderRadius: 4 }}
              />
              <p className="text-gray-800 font-medium">卡片 {i + 1}</p>
              <p className="text-gray-500 text-sm mt-1">
                布局: {layout} · 样式: {cardStyle}
              </p>
            </div>
          ))}
        </div>
      </div>

      {gallery.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">图片画廊</h3>
          <div className="grid grid-cols-3 gap-3">
            {gallery.map((item, index) => (
              <div
                key={index}
                className={`aspect-square overflow-hidden bg-white ${cardClass}`}
                style={{ borderRadius }}
              >
                <img
                  src={item.url}
                  alt={item.alt || `gallery-${index}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showFooter && (
        <div
          className="p-4 mt-6 text-center text-sm text-gray-500"
          style={{ backgroundColor: `${themeColor}15`, borderRadius }}
        >
          字体 {fontSize}px · 圆角 {borderRadius}px · 透明度 {opacity}
          {enableAnimation ? ' · 动画已开启' : ' · 动画已关闭'}
        </div>
      )}
    </div>
  );
}
