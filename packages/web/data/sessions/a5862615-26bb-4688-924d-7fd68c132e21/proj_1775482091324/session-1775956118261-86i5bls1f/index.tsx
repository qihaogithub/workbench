import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CarouselImage {
  url: string;
  alt?: string;
}

interface DemoProps {
  title: string;
  autoPlay?: boolean;
  interval?: number;
  images?: CarouselImage[];
  showArrows?: boolean;
  showDots?: boolean;
  height?: string;
}

export default function Demo({
  title,
  autoPlay = true,
  interval = 3000,
  images = [],
  showArrows = true,
  showDots = true,
  height = '400px',
}: DemoProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  useEffect(() => {
    if (!autoPlay || isHovering || images.length <= 1) {
      return;
    }

    const timer = setInterval(nextSlide, interval);
    return () => clearInterval(timer);
  }, [autoPlay, isHovering, interval, nextSlide, images.length]);

  if (images.length === 0) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        <div
          className="flex items-center justify-center bg-gray-100 rounded-lg"
          style={{ height }}
        >
          <p className="text-gray-500">暂无图片</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div
        className="relative overflow-hidden rounded-lg group"
        style={{ height }}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* 图片容器 */}
        <div
          className="flex transition-transform duration-500 ease-out h-full"
          style={{
            transform: `translateX(-${currentIndex * 100}%)`,
          }}
        >
          {images.map((image, index) => (
            <div
              key={index}
              className="flex-shrink-0 w-full h-full"
              style={{ minWidth: '100%' }}
            >
              <img
                src={image.url}
                alt={image.alt || `Slide ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>

        {/* 左右箭头 */}
        {showArrows && images.length > 1 && (
          <>
            <button
              onClick={prevSlide}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              aria-label="上一张"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={nextSlide}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              aria-label="下一张"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* 指示点 */}
        {showDots && images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  index === currentIndex
                    ? 'bg-white scale-110'
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`跳转到第 ${index + 1} 张`}
              />
            ))}
          </div>
        )}

        {/* 当前图片描述 */}
        {images[currentIndex]?.alt && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/60 text-white text-sm rounded-lg">
            {images[currentIndex].alt}
          </div>
        )}
      </div>

      {/* 图片计数器 */}
      <div className="mt-2 text-center text-sm text-gray-500">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  );
}
