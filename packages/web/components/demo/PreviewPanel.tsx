"use client";

import {
  SandpackProvider,
  SandpackLayout,
  SandpackPreview,
} from "@codesandbox/sandpack-react";
import type { PreviewPanelProps, PreviewSize } from "./types";
import { extractDependenciesFromComments } from "@/lib/sandpack-deps";

// 默认预览尺寸（iPhone 8/SE 标准）
const DEFAULT_PREVIEW_SIZE: PreviewSize = {
  width: 375,
  height: 667,
};

function buildPreviewStyle(size?: PreviewSize): React.CSSProperties {
  // 使用传入的尺寸或默认尺寸
  const effectiveSize = size ?? DEFAULT_PREVIEW_SIZE;

  const style: React.CSSProperties = {
    width: effectiveSize.width,
    height: effectiveSize.height,
    minHeight: effectiveSize.minHeight ?? "400px",
    // 居中显示
    margin: "0 auto",
    // 添加边框和圆角以突出设备感
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    overflow: "hidden",
  };

  if (effectiveSize.maxHeight !== undefined) {
    style.maxHeight = effectiveSize.maxHeight;
  }

  if (effectiveSize.scale !== undefined) {
    style.transform = `scale(${effectiveSize.scale})`;
    style.transformOrigin = "top center";
  }

  return style;
}

export function PreviewPanel({
  code,
  configData,
  sdkFiles,
  onError,
  className,
  previewSize,
}: PreviewPanelProps) {
  // 验证 code 是否为有效的代码（不是文件路径或其他非代码内容）
  const isValidCode =
    typeof code === "string" &&
    code.trim().length > 0 &&
    // 检查是否包含代码特征（import、function、export、< 等）
    (code.includes("import") ||
      code.includes("function") ||
      code.includes("export") ||
      code.includes("<")) &&
    // 排除明显不是代码的内容（如 Windows 路径）
    !code.match(/^[A-Z]:\\/) &&
    !code.includes("\\重要文件\\");

  const entryCode = `
import React from 'react';
import Demo from './Demo';

export default function App() {
  return <Demo {...${JSON.stringify(configData)}} />;
}
`;

  const files: Record<string, string> = isValidCode
    ? {
        "/Demo.tsx": code,
        "/App.tsx": entryCode,
        ...sdkFiles,
      }
    : {
        "/Demo.tsx": `export default function Demo() { return <div>代码加载失败</div>; }`,
        "/App.tsx": entryCode,
        ...sdkFiles,
      };

  const previewStyle = buildPreviewStyle(previewSize);

  // 从代码注释中提取依赖声明
  const declaredDependencies = isValidCode
    ? extractDependenciesFromComments(code)
    : {};

  // 合并依赖
  const mergedDependencies = {
    // 核心依赖
    react: "^18.0.0",
    "react-dom": "^18.0.0",

    // shadcn/ui 工具库
    clsx: "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",

    // UI 库
    "lucide-react": "^0.323.0",

    // 动画库
    "framer-motion": "^10.0.0",

    // AI 声明的额外依赖
    ...declaredDependencies,
  };

  return (
    <div className={className || "h-full w-full"}>
      {!isValidCode && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
          <p className="text-red-800 font-medium">⚠️ 代码加载失败</p>
          <p className="text-red-600 text-sm mt-1">
            检测到无效的代码文件（可能是文件路径而非代码内容）
          </p>
        </div>
      )}
      <SandpackProvider
        key={code}
        template="react-ts"
        files={files}
        customSetup={{
          dependencies: mergedDependencies,
        }}
        options={{
          externalResources: ['https://cdn.tailwindcss.com/3.4.17#tailwind.js'],
        }}
        theme={{
          colors: {
            surface1: "#ffffff",
            surface2: "#f7f7f7",
            surface3: "#e8e8e8",
          },
        }}
      >
        <SandpackLayout>
          <SandpackPreview
            showNavigator={false}
            showRefreshButton={true}
            style={previewStyle}
          />
        </SandpackLayout>
      </SandpackProvider>
    </div>
  );
}
