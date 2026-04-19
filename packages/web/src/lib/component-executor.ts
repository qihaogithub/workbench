import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as lucideReact from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const requireMap: Record<string, unknown> = {
  'react': React,
  'react/jsx-runtime': jsxRuntime,
  'lucide-react': lucideReact,
  'clsx': clsx,
  'tailwind-merge': { twMerge },
  'class-variance-authority': { cva },
  '@/lib/utils': { cn },
};

// 按需加载常用 shadcn/ui 组件
const uiComponentModules = [
  'button',
  'card',
  'dialog',
  'input',
  'dropdown-menu',
  'label',
  'avatar',
  'badge',
  'separator',
  'tooltip',
  'scroll-area',
  'textarea',
  'alert',
  'slider',
  'switch',
  'select',
  'tabs',
  'popover',
  'collapsible',
] as const;

// 异步预加载组件（不阻塞主流程）
async function preloadUiComponents() {
  for (const name of uiComponentModules) {
    try {
      const mod = await import(`@/components/ui/${name}`);
      requireMap[`@/components/ui/${name}`] = mod;
    } catch {
      // 组件不存在时静默跳过
    }
  }
}

// 启动预加载
if (typeof window !== 'undefined') {
  preloadUiComponents();
}

export function executeComponent(compiledCode: string): React.ComponentType<Record<string, unknown>> {
  const moduleObj = { exports: {} as Record<string, unknown> };

  const requireFn = (id: string): unknown => {
    if (requireMap[id]) {
      return requireMap[id];
    }
    throw new Error(`未找到依赖: "${id}"。请在 requireMap 中添加映射。`);
  };

  // eslint-disable-next-line no-new-func
  const executor = new Function('module', 'exports', 'require', compiledCode);
  executor(moduleObj, moduleObj.exports, requireFn);

  const Component =
    (moduleObj.exports.default as React.ComponentType<Record<string, unknown>>) ||
    (moduleObj.exports as unknown as React.ComponentType<Record<string, unknown>>);

  if (typeof Component !== 'function') {
    throw new Error('编译后的代码未导出有效的 React 组件');
  }

  return Component;
}
