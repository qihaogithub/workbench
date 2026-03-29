'use client';

import { useState } from 'react';
import { PreviewPanel, ConfigForm } from '../../../components/demo';

const demoCode = `import React from 'react';

interface DemoProps {
  title: string;
  description: string;
  banner?: string;
  theme?: 'light' | 'dark' | 'colorful';
}

export default function Demo({ title, description, banner, theme = 'light' }: DemoProps) {
  const bgColors = {
    light: 'bg-white',
    dark: 'bg-gray-900 text-white',
    colorful: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  };

  return (
    <div className={\`min-h-screen p-8 \${bgColors[theme]}\`}>
      <div className="max-w-2xl mx-auto">
        {banner && (
          <img 
            src={banner} 
            alt="Banner" 
            className="w-full h-48 object-cover rounded-lg mb-6"
          />
        )}
        <h1 className="text-3xl font-bold mb-4">{title}</h1>
        <p className="text-lg opacity-80">{description}</p>
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
