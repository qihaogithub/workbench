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
  const themeClasses = {
    light: 'bg-white text-gray-900',
    dark: 'bg-gray-900 text-white',
    colorful: 'bg-gradient-to-r from-pink-500 to-purple-500 text-white',
  };

  return (
    <div className={`min-h-screen ${themeClasses[theme]}`}>
      <div className="container mx-auto px-4 py-8">
        {showBadge && (
          <span className="inline-block px-3 py-1 text-sm font-semibold bg-blue-500 text-white rounded-full mb-4">
            活动中
          </span>
        )}
        
        <img 
          src={banner} 
          alt="banner" 
          className="w-full h-64 object-cover rounded-lg mb-6"
        />
        
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-lg opacity-80">{description}</p>
      </div>
    </div>
  );
}