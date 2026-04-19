import React from 'react';

interface BannerDemoProps {
  banner: string;
  title: string;
  description: string;
  theme: 'light' | 'dark' | 'colorful';
  showBadge: boolean;
}

export default function BannerDemo({ 
  banner, 
  title, 
  description, 
  theme,
  showBadge 
}: BannerDemoProps) {
  const textClasses = {
    light: 'text-slate-900',
    dark: 'text-white',
    colorful: 'text-white',
  };

  const descClasses = {
    light: 'text-slate-600',
    dark: 'text-white/80',
    colorful: 'text-white/80',
  };

  const badgeClasses = {
    light: 'bg-blue-600 text-white',
    dark: 'bg-blue-500 text-white',
    colorful: 'bg-white/80 text-purple-600',
  };

  return (
    <div className={`min-h-screen bg-white ${textClasses[theme]}`}>
      <div className="container mx-auto px-4 py-8">
        {showBadge && (
          <span className={`inline-block px-3 py-1 text-sm font-semibold rounded-full mb-4 ${badgeClasses[theme]}`}>
            Active
          </span>
        )}
        
        <img 
          src={banner} 
          alt="banner" 
          className="w-full h-64 object-cover rounded-lg mb-6"
        />
        
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className={`text-lg ${descClasses[theme]}`}>{description}</p>
      </div>
    </div>
  );
}