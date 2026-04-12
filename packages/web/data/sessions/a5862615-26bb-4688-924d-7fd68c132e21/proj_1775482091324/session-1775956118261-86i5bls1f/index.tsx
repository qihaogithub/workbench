import React from 'react';

interface BannerDemoProps {
  title: string;
  description: string;
  theme: 'light' | 'dark' | 'colorful';
  showBadge: boolean;
}

export default function BannerDemo({}: BannerDemoProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-slate-900">空页面</h1>
        <p className="text-slate-500 mt-2">暂无内容</p>
      </div>
    </div>
  );
}
