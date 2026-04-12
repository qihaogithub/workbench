import React, { useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BannerDemoProps {
  title: string;
  description: string;
  theme: 'light' | 'dark' | 'colorful';
  showBadge: boolean;
  showDeleteButton: boolean;
}

const themeStyles = {
  light: {
    container: 'bg-gradient-to-br from-white via-slate-50 to-gray-100',
    text: 'text-slate-900',
    subtext: 'text-slate-600',
    badge: 'bg-slate-900 text-white',
    accent: 'text-slate-700',
    border: 'border-slate-200',
  },
  dark: {
    container: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    text: 'text-white',
    subtext: 'text-slate-300',
    badge: 'bg-white text-slate-900',
    accent: 'text-blue-400',
    border: 'border-slate-700',
  },
  colorful: {
    container: 'bg-gradient-to-br from-violet-600 via-purple-600 to-pink-500',
    text: 'text-white',
    subtext: 'text-purple-100',
    badge: 'bg-white/20 backdrop-blur-sm text-white border border-white/30',
    accent: 'text-yellow-300',
    border: 'border-white/20',
  },
};

export default function BannerDemo({ title, description, theme, showBadge, showDeleteButton }: BannerDemoProps) {
  const styles = themeStyles[theme];
  const [isDeleted, setIsDeleted] = useState(false);

  const handleDelete = () => {
    setIsDeleted(true);
  };

  if (isDeleted) {
    return (
      <div className={cn('min-h-screen flex items-center justify-center p-6', styles.container)}>
        <div className="text-center">
          <div className="text-6xl mb-4">🗑️</div>
          <p className={cn('text-xl font-medium mb-4', styles.subtext)}>内容已删除</p>
          <button
            onClick={() => setIsDeleted(false)}
            className={cn(
              'px-6 py-2 rounded-lg font-medium transition-all duration-300',
              'hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2',
              theme === 'colorful'
                ? 'bg-white/20 text-white hover:bg-white/30 focus:ring-white/50'
                : theme === 'dark'
                  ? 'bg-slate-700 text-white hover:bg-slate-600 focus:ring-slate-400'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300 focus:ring-slate-400'
            )}
          >
            恢复显示
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('min-h-screen flex items-center justify-center p-6', styles.container)}>
      <div className="relative max-w-2xl w-full">
        {/* 主卡片 */}
        <div
          className={cn(
            'relative overflow-hidden rounded-3xl p-10 md:p-14',
            'shadow-2xl backdrop-blur-sm',
            'transform transition-all duration-500 hover:scale-[1.02]',
            styles.border,
            theme === 'colorful' ? 'bg-white/10' : 'bg-white/80'
          )}
        >
          {/* 背景装饰 */}
          <div className="absolute inset-0 overflow-hidden">
            <div
              className={cn(
                'absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-20',
                theme === 'colorful' ? 'bg-pink-300' : 'bg-slate-400'
              )}
            />
            <div
              className={cn(
                'absolute -bottom-20 -left-20 w-64 h-64 rounded-full blur-3xl opacity-20',
                theme === 'colorful' ? 'bg-violet-300' : 'bg-slate-400'
              )}
            />
          </div>

          {/* 内容区域 */}
          <div className="relative z-10">
            {/* 徽章 */}
            {showBadge && (
              <div
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6',
                  'animate-pulse shadow-lg',
                  styles.badge
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span
                    className={cn(
                      'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
                      theme === 'colorful' ? 'bg-white' : theme === 'dark' ? 'bg-blue-400' : 'bg-slate-400'
                    )}
                  />
                  <span
                    className={cn(
                      'relative inline-flex rounded-full h-2 w-2',
                      theme === 'colorful' ? 'bg-white' : theme === 'dark' ? 'bg-blue-400' : 'bg-slate-400'
                    )}
                  />
                </span>
                限时活动
              </div>
            )}

            {/* 标题 */}
            <h1
              className={cn(
                'text-4xl md:text-5xl font-bold tracking-tight mb-4',
                'leading-tight',
                styles.text
              )}
            >
              {title}
            </h1>

            {/* 描述 */}
            <p className={cn('text-lg md:text-xl mb-8 leading-relaxed max-w-lg', styles.subtext)}>
              {description}
            </p>

            {/* 操作按钮 */}
            <div className="flex flex-wrap gap-4">
              <button
                className={cn(
                  'px-8 py-3 rounded-xl font-semibold text-lg',
                  'transform transition-all duration-300 hover:scale-105 hover:shadow-xl',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2',
                  theme === 'colorful'
                    ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-300 focus:ring-yellow-300'
                    : theme === 'dark'
                      ? 'bg-yellow-500 text-slate-900 hover:bg-yellow-400 focus:ring-yellow-300'
                      : 'bg-yellow-500 text-slate-900 hover:bg-yellow-400 focus:ring-yellow-300'
                )}
              >
                立即参与
              </button>
              <button
                className={cn(
                  'px-8 py-3 rounded-xl font-semibold text-lg',
                  'border-2 backdrop-blur-sm',
                  'transform transition-all duration-300 hover:scale-105',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2',
                  styles.text,
                  theme === 'colorful'
                    ? 'border-white/30 hover:bg-white/10 focus:ring-white/50'
                    : theme === 'dark'
                      ? 'border-slate-600 hover:bg-slate-700 focus:ring-slate-400'
                      : 'border-slate-300 hover:bg-slate-100 focus:ring-slate-400'
                )}
              >
                了解更多
              </button>
              {showDeleteButton && (
                <button
                  onClick={handleDelete}
                  className={cn(
                    'px-8 py-3 rounded-xl font-semibold text-lg',
                    'bg-red-500 text-white hover:bg-red-600',
                    'border-2 border-red-500',
                    'transform transition-all duration-300 hover:scale-105',
                    'focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2'
                  )}
                >
                  删除
                </button>
              )}
            </div>
          </div>

          {/* 底部装饰线 */}
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 h-1',
              theme === 'colorful'
                ? 'bg-gradient-to-r from-yellow-300 via-pink-300 to-violet-300'
                : theme === 'dark'
                  ? 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500'
                  : 'bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300'
            )}
          />
        </div>

        {/* 底部提示 */}
        <div className={cn('mt-8 text-center text-sm', styles.subtext)}>
          尝试切换不同的配置选项查看效果
        </div>
      </div>
    </div>
  );
}
