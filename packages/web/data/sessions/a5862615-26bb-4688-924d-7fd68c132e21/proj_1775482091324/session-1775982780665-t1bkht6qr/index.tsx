import React, { useState, useEffect } from 'react';

interface BannerDemoProps {
  banner: string;
  theme: 'light' | 'dark' | 'colorful';
  buttonText: string;
  buttonVariant: 'primary' | 'secondary' | 'outline' | 'ghost';
  carouselOrder: number;
  buttonOrder: number;
}

export default function BannerDemo({ 
  banner, 
  theme,
  buttonText,
  buttonVariant,
  carouselOrder,
  buttonOrder
}: BannerDemoProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // 模拟多张轮播图，使用传入的 banner 作为基础，可添加占位符模拟
  const banners = [
    banner,
    banner.replace(/(\d+)/, (_match, num) => String(parseInt(num) + 1)),
    banner.replace(/(\d+)/, (_match, num) => String(parseInt(num) + 2)),
  ];

  // 自动轮播
  useEffect(() => {
    const timer = setInterval(() => {
      goToNext();
    }, 4000);

    return () => clearInterval(timer);
  }, [currentIndex]);

  const goToNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev + 1) % banners.length);
    setTimeout(() => setIsAnimating(false), 500);
  };

  const goToPrev = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev - 1 + banners.length) % banners.length);
    setTimeout(() => setIsAnimating(false), 500);
  };

  const goToSlide = (index: number) => {
    if (isAnimating || index === currentIndex) return;
    setIsAnimating(true);
    setCurrentIndex(index);
    setTimeout(() => setIsAnimating(false), 500);
  };

  // 触摸手势支持
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      goToNext();
    } else if (isRightSwipe) {
      goToPrev();
    }
  };

  const themeClasses = {
    light: 'bg-gray-50 text-gray-900',
    dark: 'bg-gray-900 text-white',
    colorful: 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white',
  };

  // 按钮样式变体
  const buttonVariantClasses = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg hover:shadow-xl',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-800 shadow-md hover:shadow-lg',
    outline: 'border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 shadow-sm hover:shadow-md',
    ghost: 'text-indigo-600 hover:bg-indigo-50 shadow-none',
  };

  // 渲染轮播组件
  const renderCarousel = () => (
    <div 
      className="relative w-full max-w-4xl mx-auto"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* 主轮播区域 */}
      <div className="relative overflow-hidden rounded-2xl shadow-2xl">
        <div 
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {banners.map((img, index) => (
            <div
              key={index}
              className="w-full flex-shrink-0"
              style={{ width: '100%' }}
            >
              <img
                src={img}
                alt={`轮播图 ${index + 1}`}
                className="w-full h-72 md:h-96 object-cover"
                draggable={false}
              />
            </div>
          ))}
        </div>

        {/* 渐变遮罩 */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-transparent" />
      </div>

      {/* 上一张按钮 */}
      <button
        onClick={goToPrev}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50"
        aria-label="上一张"
      >
        <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* 下一张按钮 */}
      <button
        onClick={goToNext}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 disabled:opacity-50"
        aria-label="下一张"
      >
        <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* 指示器点 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {banners.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`w-3 h-3 rounded-full transition-all ${
              index === currentIndex
                ? 'bg-white w-8'
                : 'bg-white/50 hover:bg-white/75'
            }`}
            aria-label={`跳转到第 ${index + 1} 张`}
          />
        ))}
      </div>
    </div>
  );

  // 渲染按钮组件
  const renderButton = () => (
    <div className="flex justify-center">
      <button
        className={`
          px-8 py-3 rounded-xl font-semibold text-lg
          transition-all duration-200 transform hover:scale-105 active:scale-95
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
          ${buttonVariantClasses[buttonVariant]}
        `}
        onClick={() => alert(`你点击了: ${buttonText}`)}
      >
        {buttonText}
      </button>
    </div>
  );

  // 根据顺序渲染组件 - 使用位置值排序
  const renderContent = () => {
    // 根据 order 值排序，值越小越靠前
    const components = [
      { order: carouselOrder, render: renderCarousel },
      { order: buttonOrder, render: renderButton },
    ].sort((a, b) => a.order - b.order);

    return (
      <div className="space-y-8">
        {components.map((comp, index) => (
          <div key={index}>{comp.render()}</div>
        ))}
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${themeClasses[theme]}`}>
      <div className="container mx-auto px-4 py-8">
        {renderContent()}
      </div>
    </div>
  );
}
