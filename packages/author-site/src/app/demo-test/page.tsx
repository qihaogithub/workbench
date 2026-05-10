'use client';

import { useState } from 'react';
import { PreviewPanel, ConfigForm } from '../../../components/demo';

const demoCode = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
  banner?: string;
  theme?: 'light' | 'dark' | 'colorful';
  fontSize?: number;
  showSidebar?: boolean;
  tags?: string[];
  author?: { name: string; email: string };
  publishDate?: string;
  rating?: number;
  layout?: 'default' | 'compact' | 'spacious';
}

export default function Demo({ 
  title, 
  description, 
  banner, 
  theme = 'light',
  fontSize = 16,
  showSidebar = true,
  tags = [],
  author = { name: '匿名', email: '' },
  publishDate = '',
  rating = 0,
  layout = 'default'
}: DemoProps) {
  const bgColors = {
    light: 'bg-white',
    dark: 'bg-gray-900 text-white',
    colorful: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  };

  const layoutClasses = {
    default: 'max-w-2xl',
    compact: 'max-w-xl',
    spacious: 'max-w-4xl',
  };

  return (
    <div className={\`min-h-screen p-8 \${bgColors[theme]}\`}>
      <div className={\`mx-auto \${layoutClasses[layout]}\`}>
        {banner && (
          <img 
            src={banner} 
            alt="Banner" 
            className="w-full h-48 object-cover rounded-lg mb-6"
          />
        )}
        <div className="flex gap-6">
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-4" style={{ fontSize: \`\${fontSize}px\` }}>{title}</h1>
            <p className="text-lg opacity-80 mb-4">{description}</p>
            
            {tags.length > 0 && (
              <div className="flex gap-2 mb-4">
                {tags.map((tag, i) => (
                  <span key={i} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            
            {rating > 0 && (
              <div className="flex items-center gap-1 mb-4">
                <span className="text-yellow-500">{'★'.repeat(Math.round(rating))}</span>
                <span className="text-sm opacity-60">({rating})</span>
              </div>
            )}
            
            {publishDate && (
              <p className="text-sm opacity-50">发布日期: {publishDate}</p>
            )}
          </div>
          
          {showSidebar && (
            <div className="w-64 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <h3 className="font-semibold mb-2">作者信息</h3>
              <p className="text-sm">{author.name}</p>
              {author.email && (
                <p className="text-xs opacity-60">{author.email}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}`;

const demoSchema = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Demo 配置',
  type: 'object',
  properties: {
    title: {
      type: 'string',
      title: '标题',
      default: 'Hello World',
      maxLength: 50,
    },
    description: {
      type: 'string',
      title: '描述',
      default: 'This is a demo description',
    },
    banner: {
      type: 'string',
      format: 'uri',
      title: 'Banner 图片',
      description: '建议尺寸: 800x400px',
      default: 'https://picsum.photos/800/400',
    },
    theme: {
      type: 'string',
      title: '主题颜色',
      enum: ['light', 'dark', 'colorful'],
      enumNames: ['浅色', '深色', '多彩'],
      default: 'light',
    },
    fontSize: {
      type: 'number',
      title: '字体大小',
      default: 16,
      minimum: 12,
      maximum: 48,
      description: '标题字体大小 (px)',
    },
    showSidebar: {
      type: 'boolean',
      title: '显示侧边栏',
      default: true,
    },
    tags: {
      type: 'array',
      title: '标签',
      items: {
        type: 'string',
      },
      default: [],
    },
    author: {
      type: 'object',
      title: '作者信息',
      properties: {
        name: {
          type: 'string',
          title: '姓名',
          default: '匿名',
        },
        email: {
          type: 'string',
          format: 'email',
          title: '邮箱',
          default: '',
        },
      },
    },
    publishDate: {
      type: 'string',
      format: 'date',
      title: '发布日期',
      default: '',
    },
    rating: {
      type: 'number',
      title: '评分',
      minimum: 0,
      maximum: 5,
      default: 0,
      description: '0-5 星评分',
    },
    layout: {
      type: 'string',
      title: '布局',
      enum: ['default', 'compact', 'spacious'],
      enumNames: ['默认', '紧凑', '宽松'],
      default: 'default',
    },
  },
  required: ['title'],
});

export default function DemoTestPage() {
  const [configData, setConfigData] = useState<Record<string, unknown>>({
    title: 'Hello World',
    description: 'This is a demo description',
    banner: 'https://picsum.photos/800/400',
    theme: 'light',
  });

  return (
    <div className="flex h-screen">
      <div className="w-2/3 p-4 border-r">
        <h2 className="text-lg font-semibold mb-4">预览区</h2>
        <div className="h-[calc(100vh-100px)] border rounded-lg overflow-hidden">
          <PreviewPanel code={demoCode} configData={configData} />
        </div>
      </div>

      <div className="w-1/3 p-4 overflow-auto">
        <h2 className="text-lg font-semibold mb-4">配置面板</h2>
        <ConfigForm schema={demoSchema} onChange={setConfigData} initialData={configData} />
      </div>
    </div>
  );
}
