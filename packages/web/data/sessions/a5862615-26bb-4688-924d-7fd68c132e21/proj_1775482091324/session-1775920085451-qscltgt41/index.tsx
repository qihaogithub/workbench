import React from 'react';

interface DemoProps {
  title: string;
  description: string;
  variant?: 'default' | 'gradient' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  showBadge?: boolean;
  badgeText?: string;
  icon?: 'sparkles' | 'star' | 'heart' | 'lightning';
}

const iconMap = {
  sparkles: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  star: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  heart: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  ),
  lightning: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 2v11h3v9l7-12h-4l4-8z" />
    </svg>
  ),
};

const sizeClasses = {
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

const variantStyles = {
  default: 'bg-white border-gray-200 shadow-md hover:shadow-lg',
  gradient: 'bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 border-transparent text-white',
  outline: 'bg-transparent border-2 border-dashed border-gray-300 hover:border-purple-400',
};

export default function Demo({ 
  title, 
  description, 
  variant = 'default',
  size = 'md',
  showBadge = false,
  badgeText = 'New',
  icon = 'sparkles',
}: DemoProps) {
  const isGradient = variant === 'gradient';
  const isOutline = variant === 'outline';

  return (
    <div 
      className={`
        rounded-2xl border transition-all duration-300 ease-out
        hover:-translate-y-1 hover:scale-[1.02]
        ${sizeClasses[size]}
        ${variantStyles[variant]}
      `}
    >
      {/* Badge */}
      {showBadge && (
        <span 
          className={`
            inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold mb-3
            ${isGradient ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-700'}
          `}
        >
          {badgeText}
        </span>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Icon */}
        <div 
          className={`
            flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center
            ${isGradient ? 'bg-white/20' : isOutline ? 'bg-purple-50 text-purple-500' : 'bg-purple-100 text-purple-600'}
          `}
        >
          {iconMap[icon]}
        </div>

        {/* Title */}
        <h1 
          className={`
            font-bold leading-tight
            ${size === 'sm' ? 'text-lg' : size === 'md' ? 'text-xl' : 'text-2xl'}
            ${isGradient ? 'text-white' : isOutline ? 'text-gray-800' : 'text-gray-900'}
          `}
        >
          {title}
        </h1>
      </div>

      {/* Description */}
      <p 
        className={`
          leading-relaxed
          ${isGradient ? 'text-white/90' : isOutline ? 'text-gray-600' : 'text-gray-600'}
          ${size === 'sm' ? 'text-sm' : 'text-base'}
        `}
      >
        {description}
      </p>

      {/* Decorative Elements */}
      {variant === 'default' && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-1.5 rounded-full bg-gradient-to-r from-purple-400 to-pink-400"
                style={{ width: `${20 + i * 10}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Decorative corner accent */}
      {variant !== 'outline' && (
        <div 
          className={`
            absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10
            ${isGradient ? 'bg-white' : 'bg-purple-500'}
          `}
        />
      )}
    </div>
  );
}
